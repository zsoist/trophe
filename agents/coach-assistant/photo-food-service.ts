import {createHash,randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import type {db} from '@/db/client';
import {deriveFoodLogEdit,type FoodLogRow} from '@/lib/food/log-edit-service';
import {insertReviewedPhotoFood,validateReviewedPhotoFood} from '@/lib/food/log-create-service';
import {selectFoodDisplayName} from '@/lib/food/display-name';
import {photoFoodOperationSchema,photoFoodProposalSchema,photoFoodResultSchema,photoFoodReviewSchema,type PhotoFoodService} from './photo-food-actions';
import {validatePhotoFoodObservation,type PhotoFoodObservationPort,type PhotoFoodObservation,type PhotoFoodScope} from './photo-food-observation';
import {isIsolatedPhotoFoodBoundary,type IsolatedPhotoFoodBoundary} from './photo-food-isolation';
import type {PhotoFoodResult,PhotoFoodError,PhotoFoodProposal,PhotoFoodReview} from './photo-food-contracts';
type Database=typeof db;type Tx=Parameters<Parameters<Database['transaction']>[0]>[0];type Scope=Parameters<PhotoFoodService['execute']>[0];
const action='food.photo.create',fail=(error:PhotoFoodError):PhotoFoodResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
class Rejected extends Error{constructor(readonly code:PhotoFoodError){super(code);}}
function canonical(v:unknown):string{if(Array.isArray(v))return `[${v.map(canonical).join(',')}]`;if(v!==null&&typeof v==='object')return `{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${canonical((v as Record<string,unknown>)[k])}`).join(',')}}`;return JSON.stringify(v);}
const hash=(v:unknown)=>createHash('sha256').update(canonical(v)).digest('hex');
const basis=(o:PhotoFoodObservation,index:number)=>hash({scope:[o.actorId,o.subjectId,o.organizationId,o.conversationId,o.attachmentId],id:o.id,revision:o.revision,imageDigest:o.imageDigest,source:o.source,index,food:o.foods[index]});
const proposalHash=(s:Scope,p:PhotoFoodProposal)=>hash({actor:s.actorId,subject:s.subjectId,organization:s.organizationId,conversation:s.operation.conversationId,proposal:{...p,hash:''}});
async function authorize(tx:Tx,s:Scope){s.signal.throwIfAborted();const result=await tx.execute(sql`SELECT actor.id FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id WHERE actor.id=${s.actorId}::uuid AND actor.id=${s.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${s.organizationId}::uuid FOR SHARE OF actor,cp,member`);if(result.rows.length!==1)throw new Rejected('forbidden');s.signal.throwIfAborted();}
async function loadObservation(tx:Tx,s:Scope,attachmentId:string,port:PhotoFoodObservationPort|undefined){
 if(!port)throw new Rejected('not_connected');
 const found=await tx.execute<{normalized_digest:string;state:string;expired:boolean}>(sql`SELECT normalized_digest,state,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE id=${attachmentId}::uuid AND actor_id=${s.actorId}::uuid AND subject_id=${s.subjectId}::uuid AND organization_id=${s.organizationId}::uuid AND conversation_id=${s.operation.conversationId}::uuid FOR UPDATE`);
 if(found.rows.length!==1)throw new Rejected('not_found');const row=found.rows[0];if(row.expired)throw new Rejected('expired');if(row.state!=='available'||!row.normalized_digest)throw new Rejected('not_found');
 const scope:PhotoFoodScope={actorId:s.actorId,subjectId:s.subjectId,organizationId:s.organizationId,conversationId:s.operation.conversationId,attachmentId};
 const signal=AbortSignal.any([s.signal,AbortSignal.timeout(5000)]);let onAbort:(()=>void)|undefined;
 let raw:unknown;try{raw=await Promise.race([port.load(scope,signal,tx),new Promise<never>((_,reject)=>{onAbort=()=>reject(signal.reason);signal.addEventListener('abort',onAbort,{once:true});if(signal.aborted)onAbort();})]);}finally{if(onAbort)signal.removeEventListener('abort',onAbort);}
 s.signal.throwIfAborted();if(raw===null)throw new Rejected('not_connected');const observation=validatePhotoFoodObservation(raw,scope);if(observation.imageDigest!==row.normalized_digest)throw new Rejected('version_conflict');return observation;
}
async function derive(tx:Tx,o:PhotoFoodObservation,index:number,portion:{loggedDate:string;mealType:PhotoFoodReview['mealType'];grams:number}){
 const item=o.items[index];if(!item)throw new Rejected('invalid_input');
 // Reuse the current Food edit calculation against the parsed basis, without an
 // insert/update and without creating a correction/training label from a photo.
 const existing={foodName:selectFoodDisplayName(item),foodId:null,quantity:item.quantity,qtyG:String(item.grams),calories:item.calories,proteinG:item.protein_g,carbsG:item.carbs_g,fatG:item.fat_g,fiberG:item.fiber_g,sugarG:item.sugar_g} as FoodLogRow;
 const scaled=await deriveFoodLogEdit(tx,existing,{grams:portion.grams});
 const confirmed={...item,quantity:portion.grams,unit:'g',grams:portion.grams,calories:scaled.calories!,protein_g:scaled.proteinG!,carbs_g:scaled.carbsG!,fat_g:scaled.fatG!,fiber_g:scaled.fiberG!,sugar_g:scaled.sugarG!,portion_explicit:true};
 validateReviewedPhotoFood(confirmed,portion.loggedDate,portion.mealType);
 const review=photoFoodReviewSchema.parse({...portion,foodName:selectFoodDisplayName(confirmed),calories:confirmed.calories,proteinG:confirmed.protein_g,carbsG:confirmed.carbs_g,fatG:confirmed.fat_g,fiberG:confirmed.fiber_g,sugarG:confirmed.sugar_g,confidence:confirmed.confidence,source:'photo_ai',nutrition:'estimated',portion:'explicit_user'});
 return {confirmed,review};
}
/** Consumes an existing server observation. Missing observation adapter is an
 * explicit not_connected; no fake vision, attachment upload or provider dispatch.
 */
export function createPhotoFoodService(database:Database,observations?:PhotoFoodObservationPort,boundary?:IsolatedPhotoFoodBoundary):PhotoFoodService{return {async execute(scope){
 const parsed=photoFoodOperationSchema.safeParse(scope.operation);if(!parsed.success)return fail('invalid_input');const op=parsed.data;scope={...scope,operation:op};
 const isolated=(attachmentId:string)=>isIsolatedPhotoFoodBoundary(boundary,database,observations,{actorId:scope.actorId,subjectId:scope.subjectId,organizationId:scope.organizationId,conversationId:op.conversationId,attachmentId});
 const evaluation={mode:'isolated_authorized_fixture',observation:'offline_fixture',visionVerified:false,paidApiCalls:0} as const;
 if(scope.actorId!==scope.subjectId||(op.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');if(scope.signal.aborted)return fail('cancelled');
 try{return await database.transaction(async tx=>{
  await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);if('actionId' in op)await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+op.actionId},0))`);await authorize(tx,scope);
  if('actionId' in op){
   const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;envelope:unknown;result:unknown}>(sql`SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action,p.envelope FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${op.actionId}::uuid`);
   if(prior.rows.length){const r=prior.rows[0];if(r.action!==action||r.subject_id!==scope.subjectId||r.organization_id!==scope.organizationId||r.conversation_id!==op.conversationId||op.operation==='photo.food.apply'&&(r.proposal_id!==op.proposalId||r.request_hash!==op.hash||r.resource_version!==op.resourceVersion))throw new Rejected('idempotency_conflict');
    const checked=photoFoodResultSchema.safeParse(r.result);if(!checked.success||!checked.data.ok||!('receipt' in checked.data))throw new Rejected('uncertain');const result=checked.data;if(result.receipt.actionId!==op.actionId||result.receipt.proposalId!==r.proposal_id||result.refresh.entryId!==r.proposal_id||result.refresh.previousVersion!==r.resource_version||result.refresh.version!==result.receipt.resourceVersion)throw new Rejected('uncertain');const savedProposal=photoFoodProposalSchema.parse(r.envelope);if((savedProposal.evidence.source==='offline_fixture')!==(result.storage==='isolated_database_fixture'))throw new Rejected('uncertain');if(result.storage==='isolated_database_fixture'&&!isolated(savedProposal.evidence.attachmentId))throw new Rejected('not_connected');scope.signal.throwIfAborted();return result;
   }
   if(op.operation==='photo.food.receipt')throw new Rejected('not_found');
  }
  if(op.operation==='photo.food.read'||op.operation==='photo.food.propose'){
   const o=await loadObservation(tx,scope,op.attachmentId,observations),storage=o.source==='offline_fixture'?(isolated(o.attachmentId)?'isolated_database_fixture':'offline_fixture'):'database';
   const fixtureMetadata=storage==='isolated_database_fixture'?{evaluation}:{};
   if(op.operation==='photo.food.read'){scope.signal.throwIfAborted();if(storage==='isolated_database_fixture'&&!isolated(o.attachmentId))throw new Rejected('not_connected');return {version:'coach-assistant.v2',storage,...fixtureMetadata,ok:true,snapshot:{observationId:o.id,attachmentId:o.attachmentId,source:o.source,trust:o.trust,reviewRequired:true,items:o.items.map((item,index)=>({index,version:basis(o,index),foodName:selectFoodDisplayName(item),estimatedGrams:item.grams,estimatedCalories:item.calories,confidence:item.confidence,accuracyNote:item.accuracy_note??''}))}};}
   if(o.id!==op.observationId||!o.items[op.itemIndex]||basis(o,op.itemIndex)!==op.resourceVersion)throw new Rejected('version_conflict');
   const {review}=await derive(tx,o,op.itemIndex,op.after);const id=randomUUID();const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
   const proposal:PhotoFoodProposal={id,hash:'',action,resource:{kind:'food_entry',id,version:op.resourceVersion},before:null,after:review,evidence:{observationId:o.id,observationRevision:o.revision,attachmentId:o.attachmentId,imageDigest:o.imageDigest,itemIndex:op.itemIndex,source:o.source,trust:o.trust},precondition:op.resourceVersion,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};proposal.hash=proposalHash(scope,proposal);
   if(storage!=='offline_fixture'){
    if(storage==='isolated_database_fixture'&&!isolated(o.attachmentId))throw new Rejected('not_connected');
    const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);const n=Number(count.rows[0]?.count);if(!Number.isSafeInteger(n)||n<0||n>=128)throw new Rejected('uncertain');
    await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at) VALUES(${id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${action},${proposal.hash},${op.resourceVersion},${JSON.stringify(proposal)}::jsonb,${proposal.expiresAt}::timestamptz)`);
   }
   scope.signal.throwIfAborted();if(storage==='isolated_database_fixture'&&!isolated(o.attachmentId))throw new Rejected('not_connected');return {version:'coach-assistant.v2',storage,...fixtureMetadata,ok:true,proposal};
  }
  if(op.operation!=='photo.food.apply')throw new Rejected('invalid_input');
  const saved=await tx.execute<{envelope:unknown;request_hash:string;resource_version:string;expired:boolean}>(sql`SELECT envelope,request_hash,resource_version,expires_at<=clock_timestamp() AS expired FROM private.coach_action_proposals WHERE id=${op.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid AND action=${action} FOR UPDATE`);
  if(saved.rows.length!==1)throw new Rejected('not_found');const stored=saved.rows[0],p=photoFoodProposalSchema.parse(stored.envelope);
  if(p.id!==op.proposalId||p.resource.id!==op.proposalId||p.hash!==op.hash||stored.request_hash!==op.hash||proposalHash(scope,p)!==p.hash)throw new Rejected('invalid_input');
  const fixtureWrite=p.evidence.source==='offline_fixture';if(fixtureWrite&&!isolated(p.evidence.attachmentId))throw new Rejected('not_connected');
  const consumed=await tx.execute(sql`SELECT id FROM private.coach_action_receipts WHERE actor_id=${scope.actorId}::uuid AND proposal_id=${p.id}::uuid LIMIT 1`);if(consumed.rows.length)throw new Rejected('idempotency_conflict');
  if(stored.expired)throw new Rejected('expired');if(p.resource.version!==op.resourceVersion||p.precondition!==op.resourceVersion||stored.resource_version!==op.resourceVersion)throw new Rejected('version_conflict');
  const o=await loadObservation(tx,scope,p.evidence.attachmentId,observations);
  if(o.source!==p.evidence.source||o.id!==p.evidence.observationId||o.revision!==p.evidence.observationRevision||o.imageDigest!==p.evidence.imageDigest||basis(o,p.evidence.itemIndex)!==op.resourceVersion)throw new Rejected('version_conflict');
  const {confirmed,review}=await derive(tx,o,p.evidence.itemIndex,p.after);if(canonical(review)!==canonical(p.after))throw new Rejected('version_conflict');
  await authorize(tx,scope);const expiry=await tx.execute<{expired:boolean}>(sql`SELECT clock_timestamp()>=${p.expiresAt}::timestamptz OR clock_timestamp()>=(SELECT expires_at FROM private.coach_attachment_uploads WHERE id=${o.attachmentId}::uuid) AS expired`);if(expiry.rows[0]?.expired!==false)throw new Rejected('expired');scope.signal.throwIfAborted();if(fixtureWrite&&!isolated(p.evidence.attachmentId))throw new Rejected('not_connected');
  const created=await insertReviewedPhotoFood(tx,{entryId:p.id,ownerUserId:scope.subjectId,observationId:o.id,itemIndex:p.evidence.itemIndex},{date:review.loggedDate,mealType:review.mealType,item:confirmed});
  if(created.id!==p.id||created.userId!==scope.subjectId||created.loggedDate!==review.loggedDate||created.mealType!==review.mealType||created.foodName!==review.foodName||created.source!=='photo_ai'||created.sourceId!==`coach-photo:${o.id}:${p.evidence.itemIndex}`||created.foodId!==null||created.llmRecognized!==false||created.unit!=='g'||created.qtyInputUnit!=='g'||Number(created.qtyG)!==review.grams||Number(created.qtyInput)!==review.grams)throw new Rejected('uncertain');
  for(const [actual,expected] of [[created.quantity,review.grams],[created.calories,review.calories],[created.proteinG,review.proteinG],[created.carbsG,review.carbsG],[created.fatG,review.fatG],[created.fiberG,review.fiberG],[created.sugarG,review.sugarG],[created.parseConfidence,review.confidence]])if(typeof actual!=='number'||typeof expected!=='number'||!Number.isFinite(actual)||Math.fround(actual)!==Math.fround(expected))throw new Rejected('uncertain');
  const revisions=await tx.execute<{revision:string}>(sql`SELECT revision::text FROM private.coach_food_entry_versions WHERE entry_id=${p.id}::uuid`);const nextVersion=revisions.rows[0]?.revision;if(!nextVersion||!/^\d{1,20}$/.test(nextVersion))throw new Rejected('not_connected');
  const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
  const result:PhotoFoodResult={version:'coach-assistant.v2',storage:fixtureWrite?'isolated_database_fixture':'database',...(fixtureWrite?{evaluation}:{}),ok:true,receipt:{id:randomUUID(),actionId:op.actionId,proposalId:p.id,status:'applied',action,resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString()},refresh:{entryId:p.id,loggedDate:review.loggedDate,previousVersion:op.resourceVersion,version:nextVersion,strategy:'refetch'}};
  await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result) VALUES(${result.receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${op.actionId}::uuid,${p.id}::uuid,${op.hash},${op.resourceVersion},${JSON.stringify(result)}::jsonb)`);
  await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value) VALUES(${scope.actorId}::uuid,'client'::user_role,'photo_food_created','food_log',${p.id}::uuid,${JSON.stringify({actionId:op.actionId,version:nextVersion})}::jsonb)`);
  scope.signal.throwIfAborted();if(fixtureWrite&&!isolated(p.evidence.attachmentId))throw new Rejected('not_connected');return result;
 });}catch(error){if(error instanceof Rejected)return fail(error.code);if(error instanceof z.ZodError||error instanceof Error&&['invalid_input','invalid_observation','unconfirmed_observation','untrusted_instruction'].includes(error.message))return fail('invalid_input');if(error instanceof Error&&error.message==='forbidden')return fail('forbidden');const code=(v:unknown)=>v&&typeof v==='object'&&'code' in v?v.code:undefined;const cause=error&&typeof error==='object'&&'cause' in error?error.cause:undefined;if([code(error),code(cause)].some(c=>c==='42P01'||c==='42703'))return fail('not_connected');if([code(error),code(cause)].includes('23505'))return fail('idempotency_conflict');return fail('uncertain');}
}};}
