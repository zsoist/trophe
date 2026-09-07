import {randomUUID} from 'node:crypto';
import {sql} from 'drizzle-orm';
import {z} from 'zod';
import type {db} from '@/db/client';
import {coachMessageInputSchema} from './message-input';
import {COACH_CHAT_VERSION,type CoachChatScope,type CoachChatResult,type CoachChatThread,type CoachChatMessage,type CoachChatError} from './chat-contract';
import {chatTextHash,readVerifiedChatFinal,bindVerifiedChatFinal,type VerifiedChatFinal} from './chat-final';
import type {CoachSpeechTextPort} from './chat-ports';
export const COACH_CHAT_NAMESPACE='coach-assistant-global-v1';
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
const uuid=z.string().uuid(),revision=z.string().regex(/^(0|[1-9]\d*)$/),iso=z.string().datetime({offset:true});
export const chatScopeSchema=z.object({actorId:uuid,subjectId:uuid,organizationId:uuid,actorRole:z.enum(['client','coach','admin','super_admin'])}).strict();
const title=z.string().trim().min(1).max(80);
const operationSchema=z.discriminatedUnion('operation',[
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('create'),requestId:uuid,title}).strict(),
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('list'),limit:z.number().int().min(1).max(50).default(20),before:z.object({createdAt:iso,id:uuid}).strict().optional()}).strict(),
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('read'),threadId:uuid,limit:z.number().int().min(1).max(50).default(20),afterSequence:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)}).strict(),
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('rename'),threadId:uuid,title,expectedRevision:revision}).strict(),
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('delete'),threadId:uuid,reviewed:z.literal(true)}).strict(),
 z.object({version:z.literal(COACH_CHAT_VERSION),operation:z.literal('append_user'),threadId:uuid,turnId:uuid,requestId:uuid,text:coachMessageInputSchema}).strict(),
]);
const dbTimestamp=z.string().refine(v=>Number.isFinite(Date.parse(v))).transform(v=>new Date(v).toISOString());
const threadSchema=z.object({access_revoked:z.boolean(),id:uuid,title:z.string(),created_at:dbTimestamp,revision,request_id:uuid,create_hash:z.string(),state:z.enum(['active','cleanup_pending','deleted']),next_sequence:z.number().int().nonnegative()});
type Thread=z.infer<typeof threadSchema>;
const messageSchema=z.object({id:uuid,turn_id:uuid,role:z.enum(['user','assistant']),content:z.string(),sequence:z.number().int().positive(),revision:uuid,created_at:dbTimestamp,request_id:uuid,content_hash:z.string(),current:z.boolean(),pipeline_version:z.string().nullable()});
type Message=z.infer<typeof messageSchema>;
class Rejected extends Error{constructor(readonly code:CoachChatError){super(code);}}
const fail=<T>(error:CoachChatError):CoachChatResult<T>=>({version:COACH_CHAT_VERSION,storage:'database',ok:false,error});
const success=<T>(value:T):CoachChatResult<T>=>({version:COACH_CHAT_VERSION,storage:'database',ok:true,value});
const threadView=(t:Thread):CoachChatThread=>({id:t.id,title:t.title,createdAt:t.created_at,revision:t.revision,state:t.state});
function messageView(m:Message):CoachChatMessage{if(chatTextHash(m.content)!==m.content_hash)throw new Rejected('uncertain');return {id:m.id,turnId:m.turn_id,role:m.role,text:m.content,sequence:m.sequence,revision:m.revision,createdAt:m.created_at};}
export interface CoachChatCleanup {cleanup(scope:CoachChatScope,threadId:string,signal:AbortSignal):Promise<{complete:boolean}>}
export type ChatOperationValue={thread:CoachChatThread;cleanup?:'complete'|'pending'}|{threads:CoachChatThread[];nextCursor:{createdAt:string;id:string}|null}|{thread:CoachChatThread;messages:CoachChatMessage[];nextSequence:number|null}|{message:CoachChatMessage;replayed:boolean;current:boolean};
/** Current actor, membership roles, subject and assignment are locked on EVERY operation.
 * Scope is a server argument, never parsed from the operation body.
 */
export async function authorizeCoachChat(tx:Tx,scope:CoachChatScope,signal:AbortSignal){
 signal.throwIfAborted();const r=await tx.execute(sql`SELECT a.id FROM public.profiles a
 JOIN public.organization_members am ON am.user_id=a.id AND am.org_id=${scope.organizationId}::uuid
 JOIN public.profiles s ON s.id=${scope.subjectId}::uuid
 JOIN public.client_profiles cp ON cp.user_id=s.id
 JOIN public.organization_members sm ON sm.user_id=s.id AND sm.org_id=am.org_id
 WHERE a.id=${scope.actorId}::uuid AND a.role::text=${scope.actorRole} AND am.role::text=${scope.actorRole}
 AND s.role::text='client' AND sm.role::text='client'
 AND ((a.id=s.id AND a.role::text='client') OR (a.role::text IN ('coach','admin','super_admin') AND cp.coach_id=a.id))
 FOR SHARE OF a,am,s,cp,sm`);
 if(r.rows.length!==1)throw new Rejected('forbidden');signal.throwIfAborted();
}
const scopeWhere=(s:CoachChatScope)=>sql`actor_id=${s.actorId}::uuid AND subject_id=${s.subjectId}::uuid AND organization_id=${s.organizationId}::uuid AND actor_role=${s.actorRole}`;
const classify=(error:unknown):CoachChatError=>{
 if(error instanceof Rejected)return error.code;
 const e=error as {code?:string;cause?:{code?:string}},code=e?.cause?.code??e?.code;
 return ['42P01','42703','42883'].includes(code??'')?'not_connected':code==='23505'?'idempotency_conflict':'uncertain';
};
export function createCoachChatService(database:typeof db,cleanup?:CoachChatCleanup){
 async function transaction<T>(scope:CoachChatScope,signal:AbortSignal,work:(tx:Tx)=>Promise<T>):Promise<CoachChatResult<T>>{
  const parsed=chatScopeSchema.safeParse(scope);if(!parsed.success)return fail('invalid_input');if(signal.aborted)return fail('cancelled');
  try{return success(await database.transaction(async tx=>{
   await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);await authorizeCoachChat(tx,parsed.data,signal);
   // Undefined helper/table/policy contract is not a connected persistence backend.
   const contract=await tx.execute<{version:string}>(sql`SELECT private.coach_chat_contract_version() AS version`);
   if(contract.rows[0]?.version!==COACH_CHAT_VERSION)throw new Rejected('not_connected');
   const result=await work(tx);await authorizeCoachChat(tx,parsed.data,signal);signal.throwIfAborted();return result;
  }));}catch(error){return fail(signal.aborted?'cancelled':classify(error));}
 }
 async function thread(tx:Tx,scope:CoachChatScope,id:string,includeDeleted=false){
  const r=await tx.execute(sql`SELECT access_revoked,id,title,created_at::text,revision::text,request_id,create_hash,state,next_sequence FROM private.coach_chat_threads WHERE id=${id}::uuid AND ${scopeWhere(scope)} FOR UPDATE`);
  if(r.rows.length!==1)throw new Rejected('not_found');const t=threadSchema.parse(r.rows[0]);
  if(!includeDeleted&&(t.state!=='active'||t.access_revoked))throw new Rejected('not_found');return t;
 }
 async function messages(tx:Tx,scope:CoachChatScope,id:string,condition:ReturnType<typeof sql>,limit:number){
  const r=await tx.execute(sql`SELECT c.id,t.turn_id,t.role,c.content,t.sequence,t.revision,c.created_at::text,t.request_id,t.content_hash,t.current,t.pipeline_version
 FROM (SELECT * FROM private.coach_chat_turns WHERE thread_id=${id}::uuid) t LEFT JOIN public.agent_conversation c ON c.id=t.content_id
 AND c.user_id=${scope.actorId}::uuid AND c.session_id=${id} AND c.agent_name=${COACH_CHAT_NAMESPACE} AND c.role=t.role WHERE ${condition}
 ORDER BY t.sequence LIMIT ${limit}`);return r.rows.map(row=>messageSchema.parse(row));
 }
 async function append(tx:Tx,scope:CoachChatScope,t:Thread,input:{requestId:string;turnId:string;role:'user'|'assistant';text:string;pipelineVersion:string|null;expectedAssistantRevision?:string}){
  const hash=chatTextHash(input.text),prior=await messages(tx,scope,t.id,sql`t.request_id=${input.requestId}::uuid`,1);
  if(prior.length){const p=prior[0];if(p.turn_id!==input.turnId||p.role!==input.role||p.content_hash!==hash||p.pipeline_version!==input.pipelineVersion)throw new Rejected('idempotency_conflict');return {message:messageView(p),replayed:true,current:p.current};}
  const existing=await messages(tx,scope,t.id,sql`t.turn_id=${input.turnId}::uuid AND t.role=${input.role} AND t.current=true`,1);
  if(input.role==='user'&&existing.length)throw new Rejected('idempotency_conflict');
  if(input.role==='assistant'){
   if(existing.length?existing[0].revision!==input.expectedAssistantRevision:input.expectedAssistantRevision!==undefined)throw new Rejected('version_conflict');
   if(existing.length)await tx.execute(sql`UPDATE private.coach_chat_turns SET current=false WHERE thread_id=${t.id}::uuid AND content_id=${existing[0].id}::uuid`);
  }
  if(t.next_sequence>=1000)throw new Rejected('invalid_input');
  const id=randomUUID(),version=randomUUID();
  const sequence=await tx.execute<{sequence:number}>(sql`UPDATE private.coach_chat_threads SET next_sequence=next_sequence+1,revision=revision+1 WHERE id=${t.id}::uuid RETURNING next_sequence AS sequence`);
  const n=sequence.rows[0]?.sequence;if(!Number.isSafeInteger(n)||n!==t.next_sequence+1)throw new Rejected('uncertain');
  await tx.execute(sql`INSERT INTO public.agent_conversation(id,user_id,agent_name,session_id,role,content) VALUES (${id}::uuid,${scope.actorId}::uuid,${COACH_CHAT_NAMESPACE},${t.id},${input.role},${input.text})`);
  await tx.execute(sql`INSERT INTO private.coach_chat_turns(thread_id,content_id,turn_id,request_id,role,sequence,revision,content_hash,pipeline_version,current)
 VALUES (${t.id}::uuid,${id}::uuid,${input.turnId}::uuid,${input.requestId}::uuid,${input.role},${n},${version}::uuid,${hash},${input.pipelineVersion},true)`);
  const inserted=await messages(tx,scope,t.id,sql`t.content_id=${id}::uuid`,1);if(inserted.length!==1)throw new Rejected('uncertain');
  return {message:messageView(inserted[0]),replayed:false,current:true};
 }
 const service={
  async execute(scope:CoachChatScope,raw:unknown,signal:AbortSignal):Promise<CoachChatResult<ChatOperationValue>>{
   const parsed=operationSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');const op=parsed.data;
   const result=await transaction<ChatOperationValue>(scope,signal,async tx=>{
    if(op.operation==='create'){
     await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':coach-chat:'+op.requestId},0))`);
     const old=await tx.execute(sql`SELECT access_revoked,id,title,created_at::text,revision::text,request_id,create_hash,state,next_sequence FROM private.coach_chat_threads WHERE actor_id=${scope.actorId}::uuid AND request_id=${op.requestId}::uuid FOR UPDATE`);
     const hash=chatTextHash(JSON.stringify([scope.actorId,scope.subjectId,scope.organizationId,scope.actorRole,op.title]));
     if(old.rows.length){const t=threadSchema.parse(old.rows[0]);if(t.create_hash!==hash)throw new Rejected('idempotency_conflict');await thread(tx,scope,t.id,true);if(t.state!=='active'||t.access_revoked)throw new Rejected('not_found');return {thread:threadView(t)};}
     const id=randomUUID();await tx.execute(sql`INSERT INTO private.coach_chat_threads(id,actor_id,subject_id,organization_id,actor_role,request_id,create_hash,title,state,revision,next_sequence)
 VALUES (${id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${scope.actorRole},${op.requestId}::uuid,${hash},${op.title},'active',0,0)`);
     return {thread:threadView(await thread(tx,scope,id))};
    }
    if(op.operation==='list'){
     const r=await tx.execute(sql`SELECT access_revoked,id,title,created_at::text,revision::text,request_id,create_hash,state,next_sequence FROM private.coach_chat_threads WHERE ${scopeWhere(scope)} AND state='active' AND access_revoked=false
 ${op.before?sql`AND (created_at,id)<(${op.before.createdAt}::timestamptz,${op.before.id}::uuid)`:sql``} ORDER BY created_at DESC,id DESC LIMIT ${op.limit+1}`);
     const rows=r.rows.map(row=>threadSchema.parse(row)),page=rows.slice(0,op.limit),last=page.at(-1);
     return {threads:page.map(threadView),nextCursor:rows.length>op.limit&&last?{createdAt:last.created_at,id:last.id}:null};
    }
    const t=await thread(tx,scope,op.threadId,op.operation==='delete');
    if(op.operation==='read'){
     const rows=await messages(tx,scope,t.id,sql`t.current=true AND t.sequence>${op.afterSequence}`,op.limit+1),page=rows.slice(0,op.limit);
     return {thread:threadView(t),messages:page.map(messageView),nextSequence:rows.length>op.limit?page.at(-1)!.sequence:null};
    }
    if(op.operation==='rename'){
     if(t.revision!==op.expectedRevision)throw new Rejected('version_conflict');await tx.execute(sql`UPDATE private.coach_chat_threads SET title=${op.title},revision=revision+1 WHERE id=${t.id}::uuid`);
     return {thread:threadView(await thread(tx,scope,t.id))};
    }
    if(op.operation==='append_user')return append(tx,scope,t,{...op,role:'user',pipelineVersion:null});
    if(t.state==='active'){
     await tx.execute(sql`UPDATE private.coach_chat_threads SET state='cleanup_pending',title='',revision=revision+1 WHERE id=${t.id}::uuid`);
     // Sidecar tombstones survive; request IDs cannot recreate a deleted thread.
     await tx.execute(sql`DELETE FROM public.agent_conversation c USING private.coach_chat_turns t WHERE t.thread_id=${t.id}::uuid AND c.id=t.content_id AND c.user_id=${scope.actorId}::uuid AND c.agent_name=${COACH_CHAT_NAMESPACE} AND c.session_id=${t.id}`);
    }
    return {thread:threadView(await thread(tx,scope,t.id,true)),cleanup:t.state==='deleted'?'complete':'pending'};
   });
   if(op.operation!=='delete'||!result.ok||!('thread' in result.value)||result.value.thread.state==='deleted'||!cleanup)return result;
   try{
    const cleared=await cleanup.cleanup(scope,op.threadId,signal);if(!cleared.complete)return result;
    return transaction(scope,signal,async tx=>{const t=await thread(tx,scope,op.threadId,true);if(t.state==='active')throw new Rejected('uncertain');await tx.execute(sql`UPDATE private.coach_chat_threads SET state='deleted' WHERE id=${t.id}::uuid`);return {thread:{...threadView(t),state:'deleted' as const},cleanup:'complete' as const};});
   }catch{return result;}
  },
  async appendFinal(scope:CoachChatScope,raw:{threadId:string;requestId:string;expectedAssistantRevision?:string},proof:VerifiedChatFinal,signal:AbortSignal){
   const op=z.object({threadId:uuid,requestId:uuid,expectedAssistantRevision:uuid.optional()}).strict().safeParse(raw),final=readVerifiedChatFinal(proof);
   if(!op.success||!final)return fail<ChatOperationValue>('invalid_input');
   if(final.threadId!==op.data.threadId||!(['actorId','subjectId','organizationId','actorRole'] as const).every(k=>final.scope[k]===scope[k]))return fail<ChatOperationValue>('forbidden');
   if(!bindVerifiedChatFinal(proof,op.data.requestId))return fail<ChatOperationValue>('idempotency_conflict');
   return transaction(scope,signal,async tx=>{
    const t=await thread(tx,scope,op.data.threadId),user=await messages(tx,scope,t.id,sql`t.turn_id=${final.turnId}::uuid AND t.role='user' AND t.current=true`,1);
    if(user.length!==1||user[0].content_hash!==final.userTextHash)throw new Rejected('idempotency_conflict');
    return append(tx,scope,t,{requestId:op.data.requestId,turnId:final.turnId,role:'assistant',text:final.text,pipelineVersion:final.pipelineVersion,expectedAssistantRevision:op.data.expectedAssistantRevision});
   });
  },
  async lookupFinal(scope:CoachChatScope,threadId:string,responseId:string,signal:AbortSignal){
   if(!uuid.safeParse(threadId).success||!uuid.safeParse(responseId).success)return fail<{text:string;revision:string}>('invalid_input');
   return transaction(scope,signal,async tx=>{await thread(tx,scope,threadId);const rows=await messages(tx,scope,threadId,sql`t.content_id=${responseId}::uuid AND t.role='assistant' AND t.current=true AND t.pipeline_version='coach-assistant.v2'`,1);if(rows.length!==1)throw new Rejected('not_found');const m=messageView(rows[0]);return {text:m.text,revision:m.revision};});
  },
 };
 return service;
}
/** Concrete durable final-text lookup + current authenticated session epoch.
 * Epoch callback comes from the server session; null after logout. No browser final flags.
 */
export function createDurableCoachSpeechTextPort(service:ReturnType<typeof createCoachChatService>,scope:CoachChatScope,currentSessionEpoch:(signal:AbortSignal)=>Promise<string|null>):CoachSpeechTextPort{
 return {async load(responseId,current,signal){
  if(current.actorId!==scope.actorId||current.organizationId!==scope.organizationId||scope.subjectId!==scope.actorId||scope.actorRole!=='client')return null;
  const epoch=await currentSessionEpoch(signal);if(!epoch)return null;
  const result=await service.lookupFinal(scope,current.conversationId,responseId,signal);if(!result.ok)return null;
  if(signal.aborted||await currentSessionEpoch(signal)!==epoch)return null;
  return {kind:'final_answer',speechAllowed:true,text:result.value.text,revision:result.value.revision,sessionEpoch:epoch};
 }};
}
