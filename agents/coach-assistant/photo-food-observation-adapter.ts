import {createHash,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import type {db} from '@/db/client';
import {executeAiTask} from '@/agents/runtime';
import type {ExecuteAiTaskInput,ExecuteAiTaskResult} from '@/agents/runtime';
import {normalizePhotoAnalysisFoods,type PhotoAnalysisFood} from '@/lib/food/photo-analysis';
import {photoFoodScopeSchema,type PhotoFoodObservationPort,type PhotoFoodScope,type PhotoFoodObservationTransaction} from './photo-food-observation';
import type {PrivateCoachImageStorage} from './attachments-storage';

type Database=typeof db;
type PhotoProviderOutput={content?:Array<{type?:string;name?:string;input?:{foods?:unknown}}>};
export interface VerifiedPhotoFoodAnalysis {readonly kind:'verified_photo_food_analysis'}
interface AnalysisData {scope:PhotoFoodScope;imageDigest:string;generationId:string;foods:PhotoAnalysisFood[]}
const analyses=new WeakMap<VerifiedPhotoFoodAnalysis,AnalysisData>();
const digest=z.string().regex(/^[a-f0-9]{64}$/),uuid=z.string().uuid();
const PHOTO_PROMPT=readFileSync(join(process.cwd(),'agents/prompts/photo-analyze.v1.md'),'utf8').trim();
const rowSchema=z.object({id:uuid,actor_id:uuid,subject_id:uuid,organization_id:uuid,conversation_id:uuid,attachment_id:uuid,revision:uuid,image_digest:digest,generation_id:uuid,foods:z.array(z.unknown()).min(1).max(8),active:z.boolean(),attachment_digest:digest,attachment_state:z.literal('available'),attachment_expired:z.literal(false)}).strict();
const storedSchema=rowSchema.omit({attachment_digest:true,attachment_state:true,attachment_expired:true});
type ObservationAdapter=PhotoFoodObservationPort&{record(scope:PhotoFoodScope,proof:VerifiedPhotoFoodAnalysis,signal:AbortSignal):Promise<unknown>;analyzeAndRecord(scope:PhotoFoodScope,input:Parameters<typeof runVerifiedPhotoFoodAnalysis>[2],signal:AbortSignal):Promise<unknown>};

/** Wraps the existing photo_analyze task exactly once and binds its exact output
 * to server-derived attachment scope/digest. This function performs a provider
 * call only when an integrating route invokes it; AG3's delivery never does. */
export async function runVerifiedPhotoFoodAnalysis(scope:PhotoFoodScope,image:{digest:string;bytes:Uint8Array},input:{requestId?:string;invoke:(args:Parameters<ExecuteAiTaskInput<PhotoProviderOutput>['invoke']>[0]&{image:{bytes:Uint8Array;mediaType:'image/jpeg'}})=>ReturnType<ExecuteAiTaskInput<PhotoProviderOutput>['invoke']>}):Promise<{result:ExecuteAiTaskResult<PhotoProviderOutput>;proof:VerifiedPhotoFoodAnalysis}>{
 scope=photoFoodScopeSchema.parse(scope);const imageDigest=digest.parse(image.digest);if(!(image.bytes instanceof Uint8Array)||image.bytes.length<1||createHash('sha256').update(image.bytes).digest('hex')!==imageDigest)throw new Error('invalid_image_binding');const bytes=image.bytes.slice();
 const result=await executeAiTask({task:'photo_analyze',prompt:PHOTO_PROMPT,context:{userId:scope.actorId,organizationId:scope.organizationId,requestId:input.requestId,metadata:{coachPhotoFood:{conversationId:scope.conversationId,attachmentId:scope.attachmentId,imageDigest}}},invoke:args=>input.invoke({...args,image:{bytes:bytes.slice(),mediaType:'image/jpeg'}})});
 if(result.selectedPolicy.provider!=='anthropic'||result.selectedPolicy.promptVersion!=='photo-analyze-v1')throw new Error('invalid_photo_pipeline');
 const uses=result.output.content?.filter(value=>value.type==='tool_use'&&value.name==='submit_food_photo_analysis')??[];
 if(uses.length!==1||!Array.isArray(uses[0].input?.foods)||uses[0].input!.foods!.length<1||uses[0].input!.foods!.length>8)throw new Error('invalid_photo_output');
 const foods=normalizePhotoAnalysisFoods(uses[0].input!.foods);
 if(foods.length!==uses[0].input!.foods!.length||foods.some(food=>food.needs_confirmation===true))throw new Error('invalid_photo_output');
 const proof:VerifiedPhotoFoodAnalysis=Object.freeze({kind:'verified_photo_food_analysis'});
 analyses.set(proof,{scope:structuredClone(scope),imageDigest,generationId:result.generationId,foods:structuredClone(foods)});
 return {result,proof};
}

async function authorize(tx:PhotoFoodObservationTransaction,scope:PhotoFoodScope,signal:AbortSignal){
 signal.throwIfAborted();const found=await tx.execute(sql`SELECT actor.id FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid FOR SHARE OF actor,cp,member`);
 if(found.rows.length!==1)throw new Error('forbidden');
 // A saved thread is mandatory. Its permanent revocation bit survives a full
 // revoke/restore while the provider is running, before any observation exists.
 const contract=await tx.execute<{version:string}>(sql`SELECT private.coach_chat_contract_version() AS version`);
 if(contract.rows[0]?.version!=='coach-assistant.chat.v1')throw new Error('not_connected');
 const thread=await tx.execute(sql`SELECT id FROM private.coach_chat_threads WHERE id=${scope.conversationId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND actor_role='client' AND state='active' AND access_revoked=false FOR SHARE`);
 if(thread.rows.length!==1)throw new Error('forbidden');signal.throwIfAborted();
}
function parseRow(raw:unknown,scope:PhotoFoodScope){
 const row=rowSchema.parse(raw);for(const [key,value] of Object.entries(scope))if(row[key.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`) as keyof typeof row]!==value)throw new Error('forbidden');
 if(row.image_digest!==row.attachment_digest)throw new Error('version_conflict');
 const foods=normalizePhotoAnalysisFoods(row.foods);if(foods.length!==row.foods.length||foods.some(food=>food.needs_confirmation===true))throw new Error('invalid_observation');
 return {...scope,id:row.id,revision:row.revision,imageDigest:row.image_digest,source:'validated_photo_analysis' as const,foods};
}

/** Durable adapter for the proposed private observation sidecar. `record` accepts
 * only the process-local proof from runVerifiedPhotoFoodAnalysis; `load` uses the
 * caller transaction and locks observation+attachment through Food apply commit. */
export function createDatabasePhotoFoodObservationAdapter(database:Database,storage?:Pick<PrivateCoachImageStorage,'readNormalized'>):ObservationAdapter{
 const adapter:ObservationAdapter={
  async analyzeAndRecord(rawScope:PhotoFoodScope,input:Parameters<typeof runVerifiedPhotoFoodAnalysis>[2],signal:AbortSignal){
   if(!storage)throw new Error('not_connected');const scope=photoFoodScopeSchema.parse(rawScope);
   const imageDigest=await database.transaction(async tx=>{await authorize(tx,scope,signal);const found=await tx.execute<{normalized_digest:string;state:string;expired:boolean}>(sql`SELECT normalized_digest,state,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE id=${scope.attachmentId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${scope.conversationId}::uuid FOR SHARE`);const row=found.rows[0];if(!row||row.state!=='available'||row.expired||!digest.safeParse(row.normalized_digest).success)throw new Error(row?.expired?'expired':'not_found');return row.normalized_digest;});
   const reauthorize=()=>database.transaction(async tx=>authorize(tx,scope,signal));
   const bytes=await storage.readNormalized(scope,imageDigest,signal,reauthorize);
   const executed=await runVerifiedPhotoFoodAnalysis(scope,{digest:imageDigest,bytes},input);signal.throwIfAborted();
   return adapter.record(scope,executed.proof,signal);
  },
  async record(rawScope:PhotoFoodScope,proof:VerifiedPhotoFoodAnalysis,signal:AbortSignal){
   const scope=photoFoodScopeSchema.parse(rawScope),analysis=analyses.get(proof);if(!analysis)throw new Error('forbidden');
   if(JSON.stringify(analysis.scope)!==JSON.stringify(scope))throw new Error('forbidden');
   return database.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);await authorize(tx,scope,signal);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coach-photo-food:${scope.attachmentId}`},0))`);
    const attachment=await tx.execute<{normalized_digest:string;state:string;expired:boolean}>(sql`SELECT normalized_digest,state,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE id=${scope.attachmentId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${scope.conversationId}::uuid FOR UPDATE`);
    const image=attachment.rows[0];if(!image)throw new Error('not_found');if(image.state!=='available'||image.expired)throw new Error(image.expired?'expired':'not_found');if(image.normalized_digest!==analysis.imageDigest)throw new Error('version_conflict');
    const generation=await tx.execute(sql`SELECT generation_id FROM public.agent_runs WHERE generation_id=${analysis.generationId}::uuid AND user_id=${scope.actorId}::uuid AND organization_id=${scope.organizationId}::uuid AND task_name='photo_analyze' AND status='completed' AND prompt_version='photo-analyze-v1' AND metadata#>>'{coachPhotoFood,conversationId}'=${scope.conversationId} AND metadata#>>'{coachPhotoFood,attachmentId}'=${scope.attachmentId} AND metadata#>>'{coachPhotoFood,imageDigest}'=${analysis.imageDigest} FOR SHARE`);
    if(generation.rows.length!==1)throw new Error('forbidden');await authorize(tx,scope,signal);
    const prior=await tx.execute(sql`SELECT id,actor_id,subject_id,organization_id,conversation_id,attachment_id,revision,image_digest,generation_id,foods,active FROM private.coach_photo_food_observations WHERE generation_id=${analysis.generationId}::uuid FOR UPDATE`);
    if(prior.rows.length){if(prior.rows.length!==1)throw new Error('uncertain');const saved=storedSchema.parse(prior.rows[0]);if(saved.actor_id!==scope.actorId||saved.subject_id!==scope.subjectId||saved.organization_id!==scope.organizationId||saved.conversation_id!==scope.conversationId||saved.attachment_id!==scope.attachmentId||saved.image_digest!==analysis.imageDigest||JSON.stringify(normalizePhotoAnalysisFoods(saved.foods))!==JSON.stringify(analysis.foods))throw new Error('idempotency_conflict');return {...scope,id:saved.id,revision:saved.revision,imageDigest:saved.image_digest,source:'validated_photo_analysis' as const,foods:structuredClone(analysis.foods)};}
    await tx.execute(sql`UPDATE private.coach_photo_food_observations SET active=false WHERE actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${scope.conversationId}::uuid AND attachment_id=${scope.attachmentId}::uuid AND active=true`);
    const id=randomUUID(),revision=randomUUID();
    const inserted=await tx.execute(sql`INSERT INTO private.coach_photo_food_observations(id,actor_id,subject_id,organization_id,conversation_id,attachment_id,revision,image_digest,generation_id,foods,active) VALUES(${id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${scope.conversationId}::uuid,${scope.attachmentId}::uuid,${revision}::uuid,${analysis.imageDigest},${analysis.generationId}::uuid,${JSON.stringify(analysis.foods)}::jsonb,true) RETURNING id`);
    if(inserted.rows.length!==1)throw new Error('uncertain');signal.throwIfAborted();
    return {...scope,id,revision,imageDigest:analysis.imageDigest,source:'validated_photo_analysis' as const,foods:structuredClone(analysis.foods)};
   });
  },
  async load(rawScope:PhotoFoodScope,signal:AbortSignal,tx:PhotoFoodObservationTransaction){
   const scope=photoFoodScopeSchema.parse(rawScope);await authorize(tx,scope,signal);
   const found=await tx.execute(sql`SELECT o.id,o.actor_id,o.subject_id,o.organization_id,o.conversation_id,o.attachment_id,o.revision,o.image_digest,o.generation_id,o.foods,o.active,a.normalized_digest AS attachment_digest,a.state AS attachment_state,false AS attachment_expired FROM private.coach_photo_food_observations o JOIN private.coach_attachment_uploads a ON a.id=o.attachment_id JOIN public.agent_runs g ON g.generation_id=o.generation_id WHERE o.actor_id=${scope.actorId}::uuid AND o.subject_id=${scope.subjectId}::uuid AND o.organization_id=${scope.organizationId}::uuid AND o.conversation_id=${scope.conversationId}::uuid AND o.attachment_id=${scope.attachmentId}::uuid AND o.active=true AND a.state='available' AND a.expires_at>clock_timestamp() AND g.user_id=o.actor_id AND g.organization_id=o.organization_id AND g.task_name='photo_analyze' AND g.status='completed' AND g.prompt_version='photo-analyze-v1' AND g.metadata#>>'{coachPhotoFood,conversationId}'=o.conversation_id::text AND g.metadata#>>'{coachPhotoFood,attachmentId}'=o.attachment_id::text AND g.metadata#>>'{coachPhotoFood,imageDigest}'=o.image_digest FOR UPDATE OF o,a FOR SHARE OF g`);
   if(found.rows.length!==1)return null;signal.throwIfAborted();return parseRow(found.rows[0],scope);
  },
 };return adapter;
}
