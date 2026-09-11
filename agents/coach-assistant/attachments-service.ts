import { createHash,createHmac,randomUUID,timingSafeEqual } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { db } from '@/db/client';
import { COACH_IMAGE_LIMITS,type CoachAttachmentResult } from './contracts';
import { attachmentObjectPath,type AttachmentStorageScope,type PrivateCoachImageStorage } from './attachments-storage';
const uuid=z.string().uuid();
const scopeSchema=z.object({actorId:uuid,subjectId:uuid,organizationId:uuid}).strict();
type Scope=z.infer<typeof scopeSchema>;
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const base={version:z.literal('coach-assistant.v2'),conversationId:uuid};
const operationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('attachment.prepare'),requestId:uuid.optional(),mime:z.enum(['image/jpeg','image/png','image/webp']),bytes:z.number().int().positive().max(COACH_IMAGE_LIMITS.fileBytes)}).strict(),
 z.object({...base,operation:z.enum(['attachment.status','attachment.read']),attachmentId:uuid}).strict(),
 z.object({...base,operation:z.literal('attachment.remove'),attachmentId:uuid,reviewed:z.literal(true)}).strict(),
]);
export type PrivateAttachmentResult=Omit<CoachAttachmentResult,'storage'|'error'>&{storage:'private_storage';error?:CoachAttachmentResult['error']|'uncertain'|'expired'|'idempotency_conflict';read?:{url:string;expiresIn:number}};
const common={version:'coach-assistant.v2',storage:'private_storage',analysis:'not_connected'} as const;
class Rejected extends Error {constructor(readonly code:PrivateAttachmentResult['error']){super(code);}}
const fail=(error:PrivateAttachmentResult['error']):PrivateAttachmentResult=>({...common,ok:false,error});
function reportPreviewFailure(operation:string,stage:string,error:unknown){
 if(process.env.VERCEL_ENV!=='preview'||process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED!=='1')return;
 const diagnostic=error instanceof Rejected?error.code:error instanceof z.ZodError?'stored_row_contract':error instanceof Error&&['storage_unavailable','idempotency_conflict','invalid_input','forbidden'].includes(error.message)?error.message:'unexpected';
 const cause=typeof error==='object'&&error!==null&&'cause' in error&&typeof error.cause==='object'&&error.cause!==null?error.cause:undefined;
 const code=typeof error==='object'&&error!==null&&'code' in error?error.code:cause&&'code' in cause?cause.code:undefined;
 const sqlstate=typeof code==='string'&&/^[0-9A-Z]{5}$/.test(code)?code:undefined;
 console.warn(JSON.stringify({event:'coach_attachment_operation_failed',operation,stage,diagnostic,...(sqlstate?{sqlstate}:{})}));
}
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const metadata=z.object({mime:z.literal('image/jpeg'),bytes:z.number().int().positive().max(COACH_IMAGE_LIMITS.fileBytes),width:z.number().int().positive(),height:z.number().int().positive()}).strict().refine(value=>value.width*value.height<=COACH_IMAGE_LIMITS.pixels);
const rowSchema=z.object({id:uuid,actor_id:uuid,subject_id:uuid,organization_id:uuid,conversation_id:uuid,request_id:uuid,bucket:z.string(),object_path:z.string(),mime:z.enum(['image/jpeg','image/png','image/webp']),input_bytes:z.number().int().positive().max(COACH_IMAGE_LIMITS.fileBytes),upload_token_hash:z.string().regex(/^[a-f0-9]{64}$/),state:z.enum(['prepared','available','removed']),source_digest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),normalized_digest:z.string().regex(/^[a-f0-9]{64}$/).nullable(),metadata:metadata.nullable(),expires_at:z.string().refine(value=>Number.isFinite(Date.parse(value))),expired:z.boolean()}).refine(row=>row.state!=='available'||row.source_digest!==null&&row.normalized_digest!==null&&row.metadata!==null);
type Row=z.infer<typeof rowSchema>;
function storageScope(row:Row):AttachmentStorageScope{return {actorId:row.actor_id,subjectId:row.subject_id,organizationId:row.organization_id,conversationId:row.conversation_id,attachmentId:row.id};}
async function authorize(tx:Tx,scope:Scope,signal:AbortSignal){
 signal.throwIfAborted();const r=await tx.execute(sql`SELECT actor.id FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id
 WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid FOR SHARE OF actor,cp,member`);
 if(r.rows.length!==1)throw new Rejected('forbidden');signal.throwIfAborted();
}
/** Concrete durable lifecycle over private SQL reservations + Supabase objects.
 * External storage is not transactional with SQL: existing reservations retain
 * orphan paths after rollback/lost commit; retries verify bytes, cleanup retries.
 */
export function createPrivateAttachmentService(database:typeof db,storage:PrivateCoachImageStorage,signingKey:Uint8Array){
 if(signingKey.length<32)throw new Error('invalid_signing_key');const secret=Buffer.from(signingKey);
 const token=(row:Pick<Row,'id'|'actor_id'|'subject_id'|'organization_id'|'conversation_id'|'mime'|'input_bytes'|'expires_at'>)=>createHmac('sha256',secret).update(JSON.stringify([row.id,row.actor_id,row.subject_id,row.organization_id,row.conversation_id,row.mime,row.input_bytes,new Date(row.expires_at).toISOString()])).digest('hex');
 function parsedRow(raw:unknown){const row=rowSchema.parse(raw);if(row.bucket!==storage.bucket||row.object_path!==attachmentObjectPath(storageScope(row)))throw new Rejected('forbidden');return row;}
 function view(row:Row):PrivateAttachmentResult{return {...common,ok:true,state:row.state,...(row.state==='removed'?{}:{attachment:{id:row.id,kind:'image',status:row.state==='available'?'available':'pending'}}),expiresAt:new Date(row.expires_at).toISOString(),...(row.metadata&&row.state==='available'?{metadata:row.metadata}:{})};}
 async function find(tx:Tx,scope:Scope,conversationId:string,attachmentId:string){
  const found=await tx.execute(sql`SELECT *,expires_at::text,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads
  WHERE id=${attachmentId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${conversationId}::uuid FOR UPDATE`);
  if(found.rows.length!==1)throw new Rejected('not_found');return parsedRow(found.rows[0]);
 }
 const failure=(error:unknown)=>fail(error instanceof Rejected?error.code:error instanceof Error&&['idempotency_conflict','forbidden','invalid_image','limit_exceeded'].includes(error.message)?error.message as PrivateAttachmentResult['error']:'uncertain');
 return {
  async operation(rawScope:Scope,raw:unknown,signal:AbortSignal):Promise<PrivateAttachmentResult>{
   const parsed=operationSchema.safeParse(raw),scopeParsed=scopeSchema.safeParse(rawScope);if(!parsed.success||!scopeParsed.success)return fail('invalid_input');const op=parsed.data,scope=scopeParsed.data;if(scope.actorId!==scope.subjectId)return fail('forbidden');if(signal.aborted)return fail('cancelled');
   let stage='authorize';
   try{return await database.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout='15000ms'`);await authorize(tx,scope,signal);
    if(op.operation==='attachment.prepare'){
     stage='capacity_lock';
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`coach-attachments:${storage.bucket}`},0))`);
     stage='expired_select';
     const expired=await tx.execute(sql`SELECT *,expires_at::text,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE bucket=${storage.bucket} AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND state<>'removed' AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 6 FOR UPDATE SKIP LOCKED`);
     for(const raw of expired.rows){stage='expired_parse';const stale=parsedRow(raw);stage='expired_storage_remove';await storage.remove(storageScope(stale),signal);stage='expired_reauthorize';await authorize(tx,scope,signal);stage='expired_mark_removed';await tx.execute(sql`UPDATE private.coach_attachment_uploads SET state='removed',metadata=NULL WHERE id=${stale.id}::uuid`);}
     stage='idempotency_read';
     const requestId=op.requestId??randomUUID();const prior=await tx.execute(sql`SELECT *,expires_at::text,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE actor_id=${scope.actorId}::uuid AND request_id=${requestId}::uuid FOR UPDATE`);
     if(prior.rows.length){const row=parsedRow(prior.rows[0]);if(row.subject_id!==scope.subjectId||row.organization_id!==scope.organizationId||row.conversation_id!==op.conversationId||row.mime!==op.mime||row.input_bytes!==op.bytes)throw new Rejected('idempotency_conflict');if(row.expired||row.state==='removed')throw new Rejected('expired');if(digest(token(row))!==row.upload_token_hash)throw new Rejected('uncertain');if(row.state==='available')await storage.assertStored(storageScope(row),row.normalized_digest!,signal,()=>authorize(tx,scope,signal));return {...view(row),uploadToken:token(row)};}
     // Reserve the full normalized-file cap until actual deletion, even expired.
     const count=await tx.execute<{total:string;owned:string}>(sql`SELECT count(*)::text AS total,count(*) FILTER (WHERE actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid)::text AS owned FROM private.coach_attachment_uploads WHERE bucket=${storage.bucket} AND state<>'removed'`);
     if(Number(count.rows[0].total)>=6||Number(count.rows[0].owned)>=COACH_IMAGE_LIMITS.count)throw new Rejected('limit_exceeded');
     const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '15 minutes')::text AS expires`);const id=randomUUID();
     const row:Row={id,actor_id:scope.actorId,subject_id:scope.subjectId,organization_id:scope.organizationId,conversation_id:op.conversationId,request_id:requestId,bucket:storage.bucket,object_path:attachmentObjectPath({...scope,conversationId:op.conversationId,attachmentId:id}),mime:op.mime,input_bytes:op.bytes,upload_token_hash:'',state:'prepared',source_digest:null,normalized_digest:null,metadata:null,expires_at:clock.rows[0].expires,expired:false};row.upload_token_hash=digest(token(row));
     await tx.execute(sql`INSERT INTO private.coach_attachment_uploads(id,actor_id,subject_id,organization_id,conversation_id,request_id,bucket,object_path,mime,input_bytes,upload_token_hash,state,expires_at)
     VALUES (${id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${requestId}::uuid,${row.bucket},${row.object_path},${op.mime},${op.bytes},${row.upload_token_hash},'prepared',${row.expires_at}::timestamptz)`);
     signal.throwIfAborted();return {...view(row),uploadToken:token(row)};
    }
    const row=await find(tx,scope,op.conversationId,op.attachmentId);
    if(op.operation==='attachment.remove'){
     if(row.state==='removed')return view(row);await storage.remove(storageScope(row),signal);await authorize(tx,scope,signal);
     await tx.execute(sql`UPDATE private.coach_attachment_uploads SET state='removed',metadata=NULL WHERE id=${row.id}::uuid`);signal.throwIfAborted();return view({...row,state:'removed',metadata:null});
    }
    if(row.expired)throw new Rejected('expired');if(row.state==='removed')throw new Rejected('not_found');
    if(row.state==='available')await storage.assertStored(storageScope(row),row.normalized_digest!,signal,()=>authorize(tx,scope,signal));
    if(op.operation==='attachment.read'){
     if(row.state!=='available')throw new Rejected('not_found');
     const seconds=await tx.execute<{seconds:number}>(sql`SELECT floor(extract(epoch FROM (expires_at-clock_timestamp())))::int AS seconds FROM private.coach_attachment_uploads WHERE id=${row.id}::uuid`);
     const expiresIn=Math.min(60,seconds.rows[0].seconds-2);if(expiresIn<1)throw new Rejected('expired');
     const read=await storage.signedRead(storageScope(row),expiresIn,signal,()=>authorize(tx,scope,signal));
     const remaining=await tx.execute<{seconds:number}>(sql`SELECT floor(extract(epoch FROM (expires_at-clock_timestamp())))::int AS seconds FROM private.coach_attachment_uploads WHERE id=${row.id}::uuid`);if(read.expiresIn>remaining.rows[0].seconds)throw new Rejected('expired');return {...view(row),read};
    }
    signal.throwIfAborted();return view(row);
   });}catch(error){reportPreviewFailure(op.operation,stage,error);return failure(error);}
  },
  async upload(rawScope:AttachmentStorageScope,providedToken:string,bytes:Uint8Array,signal:AbortSignal):Promise<PrivateAttachmentResult>{
   const scopeParsed=scopeSchema.safeParse({actorId:rawScope.actorId,subjectId:rawScope.subjectId,organizationId:rawScope.organizationId});if(!scopeParsed.success||!uuid.safeParse(rawScope.conversationId).success||!uuid.safeParse(rawScope.attachmentId).success||!/^[a-f0-9]{64}$/.test(providedToken))return fail('invalid_input');const scope=scopeParsed.data;if(scope.actorId!==scope.subjectId)return fail('forbidden');if(signal.aborted)return fail('cancelled');
   try{
    // Commit original-byte identity BEFORE external I/O, so a lost upload result
    // cannot let a retry substitute different source bytes (even equivalent JPEG).
    await database.transaction(async tx=>{
     await authorize(tx,scope,signal);const row=await find(tx,scope,rawScope.conversationId,rawScope.attachmentId);
     if(!timingSafeEqual(Buffer.from(digest(providedToken),'hex'),Buffer.from(row.upload_token_hash,'hex')))throw new Rejected('forbidden');
     if(row.expired||row.state==='removed')throw new Rejected('expired');if(bytes.length!==row.input_bytes)throw new Rejected('limit_exceeded');
     if(row.source_digest!==null&&row.source_digest!==digest(bytes))throw new Rejected('idempotency_conflict');
     if(row.source_digest===null)await tx.execute(sql`UPDATE private.coach_attachment_uploads SET source_digest=${digest(bytes)} WHERE id=${row.id}::uuid`);
     signal.throwIfAborted();
    });
    return await database.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout='15000ms'`);await authorize(tx,scope,signal);const row=await find(tx,scope,rawScope.conversationId,rawScope.attachmentId);
    if(!timingSafeEqual(Buffer.from(digest(providedToken),'hex'),Buffer.from(row.upload_token_hash,'hex')))throw new Rejected('forbidden');
    if(row.expired||row.state==='removed')throw new Rejected('expired');if(bytes.length!==row.input_bytes)throw new Rejected('limit_exceeded');
    if(row.state==='available'){if(row.source_digest!==digest(bytes))throw new Rejected('idempotency_conflict');await storage.assertStored(storageScope(row),row.normalized_digest!,signal,()=>authorize(tx,scope,signal));return view(row);}
    const stored=await storage.put(rawScope,bytes,row.mime,signal,()=>authorize(tx,scope,signal));
    if(stored.path!==row.object_path)throw new Rejected('uncertain');
    const expiry=await tx.execute<{expired:boolean}>(sql`SELECT expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE id=${row.id}::uuid`);if(expiry.rows[0].expired)throw new Rejected('expired');
    await tx.execute(sql`UPDATE private.coach_attachment_uploads SET state='available',source_digest=${stored.sourceDigest},normalized_digest=${stored.normalizedDigest},metadata=${JSON.stringify(stored.metadata)}::jsonb WHERE id=${row.id}::uuid`);
    signal.throwIfAborted();return view({...row,state:'available',source_digest:stored.sourceDigest,normalized_digest:stored.normalizedDigest,metadata:stored.metadata});
   });}catch(error){return failure(error);}
  },
  /** Internal bounded janitor; not an actor-selectable HTTP operation. */
  async cleanup(signal:AbortSignal):Promise<{ok:boolean;removed:number}>{
   try{return await database.transaction(async tx=>{
    const rows=await tx.execute(sql`SELECT *,expires_at::text,expires_at<=clock_timestamp() AS expired FROM private.coach_attachment_uploads WHERE bucket=${storage.bucket} AND state<>'removed' AND expires_at<=clock_timestamp() ORDER BY expires_at,id LIMIT 10 FOR UPDATE SKIP LOCKED`);
    let removed=0;for(const raw of rows.rows){const row=parsedRow(raw);await storage.remove(storageScope(row),signal);await tx.execute(sql`UPDATE private.coach_attachment_uploads SET state='removed',metadata=NULL WHERE id=${row.id}::uuid`);removed++;}signal.throwIfAborted();return {ok:true,removed};
   });}catch{return {ok:false,removed:0};}
  },
 };
}
