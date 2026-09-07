import { createHash,randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { persistentMemoryOperationSchema,persistentMemoryProposalSchema,persistentMemoryResultSchema,type PersistentMemoryCard,type PersistentMemoryProposal,type PersistentMemoryResult,type PersistentMemoryService } from './memory-contracts';
type Database=typeof db;
type Tx=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope=Parameters<PersistentMemoryService['execute']>[0];
type ErrorCode=Extract<PersistentMemoryResult,{ok:false}>['error'];
class Rejected extends Error {constructor(readonly code:ErrorCode){super(code);}}
const fail=(error:ErrorCode):PersistentMemoryResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
function canonical(value:unknown):string {if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;return JSON.stringify(value);}
const digest=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
const contentHash=(value:string)=>createHash('sha256').update(value).digest('hex');
function proposalHash(scope:Scope,proposal:PersistentMemoryProposal){return digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:scope.operation.conversationId,proposal:{...proposal,hash:''}});}
async function authorize(tx:Tx,scope:Scope){
 scope.signal.throwIfAborted();
 const result=await tx.execute(sql`SELECT actor.id FROM public.profiles actor JOIN public.client_profiles cp ON cp.user_id=actor.id JOIN public.organization_members member ON member.user_id=actor.id
 WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid FOR SHARE OF actor,cp,member`);
 if(result.rows.length!==1)throw new Rejected('forbidden');
}
type MemoryRow={created_at:string;id:string;fact_text:string;revision:string;confirmed_text_hash:string;active:boolean;source:string;fact_type:string;scope:string;agent_name:string|null;session_id:string|null;superseded_by:string|null;expired:boolean};
function card(row:MemoryRow,conversationId:string):PersistentMemoryCard|null {
 if(!row.active||row.expired||row.superseded_by!==null||row.source!=='user_input'||row.fact_type!=='preference'||row.scope!=='agent'||row.agent_name!=='coach-assistant-confirmed'||row.session_id!==conversationId||row.confirmed_text_hash!==contentHash(row.fact_text))return null;
 return {id:row.id,text:row.fact_text,createdAt:new Date(row.created_at).toISOString(),version:row.revision,confirmation:'confirmed',source:'user_input',retention:'persistent',conversationId};
}
async function load(tx:Tx,scope:Scope,memoryId?:string){
 return tx.execute<MemoryRow>(sql`SELECT m.id,m.created_at::text,m.fact_text,m.active,m.source::text,m.fact_type::text,m.scope::text,m.agent_name,m.session_id,m.superseded_by,(m.expires_at IS NOT NULL AND m.expires_at<=clock_timestamp()) AS expired,b.revision::text,b.confirmed_text_hash
 FROM public.memory_chunks m JOIN private.coach_memory_bindings b ON b.memory_id=m.id AND b.subject_id=m.user_id
 WHERE b.actor_id=${scope.actorId}::uuid AND b.subject_id=${scope.subjectId}::uuid AND b.organization_id=${scope.organizationId}::uuid AND b.conversation_id=${scope.operation.conversationId}::uuid
 ${memoryId?sql`AND m.id=${memoryId}::uuid`:sql`AND m.active=true`} ORDER BY m.id LIMIT 21 FOR UPDATE OF m,b`);
}
/** Real server transaction; AG1 must provision isolated bindings/revision trigger
 * and extend the existing shared action ledger before any HTTP activation.
 * No extraction, embedding, summary cache, profile inference or automatic save.
 */
export function createPersistentMemoryService(database:Database):PersistentMemoryService {
 return {async execute(rawScope){
  const parsed=persistentMemoryOperationSchema.safeParse(rawScope.operation);if(!parsed.success)return fail('invalid_input');
  const scope={...rawScope,operation:parsed.data};const op=scope.operation;
  if(scope.actorId!==scope.subjectId||(op.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');
  if(scope.signal.aborted)return fail('cancelled');
  try{return await database.transaction(async tx=>{
   await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
   if(op.operation==='memory.apply'||op.operation==='memory.receipt')await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+op.actionId},0))`);
   await authorize(tx,scope);
   await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${['coach-memory',scope.actorId,scope.subjectId,scope.organizationId,op.conversationId].join(':')},0))`);
   if(op.operation==='memory.apply'||op.operation==='memory.receipt'){
    const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;envelope:unknown;result:unknown}>(sql`SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.envelope
    FROM private.coach_action_receipts r LEFT JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id
    WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${op.actionId}::uuid`);
    if(prior.rows.length){
     const row=prior.rows[0];const proposal=persistentMemoryProposalSchema.safeParse(row.envelope);const result=persistentMemoryResultSchema.safeParse(row.result);
     if(!proposal.success||row.subject_id!==scope.subjectId||row.organization_id!==scope.organizationId||row.conversation_id!==op.conversationId||(op.operation==='memory.apply'&&(row.proposal_id!==op.proposalId||row.request_hash!==op.hash||row.resource_version!==op.resourceVersion)))throw new Rejected('idempotency_conflict');
     if(!result.success||!result.data.ok||!('receipt' in result.data)||result.data.receipt.actionId!==op.actionId||result.data.receipt.proposalId!==row.proposal_id||result.data.refresh.conversationId!==op.conversationId)throw new Rejected('uncertain');
     scope.signal.throwIfAborted();return result.data;
    }
    if(op.operation==='memory.receipt')return fail('not_found');
   }
   if(op.operation==='memory.read'){
    const rows=await load(tx,scope);if(rows.rows.length>20)throw new Rejected('uncertain');
    const memories=rows.rows.map(row=>card(row,op.conversationId)).filter((row):row is PersistentMemoryCard=>row!==null);
    const revision=await tx.execute<{revision:string}>(sql`SELECT coalesce(sum(revision+1),0)::text AS revision FROM private.coach_memory_bindings WHERE actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid`);
    scope.signal.throwIfAborted();return persistentMemoryResultSchema.parse({version:'coach-assistant.v2',storage:'database',ok:true,memories,scopeRevision:revision.rows[0]?.revision,derivedContext:'excluded'});
   }
   if(op.operation==='memory.propose'||op.operation==='memory.correct'||op.operation==='memory.delete'){
    let before:PersistentMemoryCard|null=null;let memoryId:string=randomUUID();
    if(op.operation!=='memory.propose'){
     memoryId=op.memoryId;const rows=await load(tx,scope,memoryId);if(rows.rows.length!==1)throw new Rejected('not_found');
     before=card(rows.rows[0],op.conversationId);if(!before||before.version!==op.resourceVersion)throw new Rejected('version_conflict');
     if(op.operation==='memory.correct'&&before.text===op.after.text)throw new Rejected('invalid_input');
    }
    const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>clock_timestamp()`);
    if(Number(count.rows[0].count)>=128)throw new Rejected('uncertain');
    const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
    const proposal:PersistentMemoryProposal={id:randomUUID(),hash:'',action:op.operation==='memory.propose'?'memory.confirm':op.operation,resource:{kind:'memory',id:memoryId,version:before?.version??'0'},before,after:op.operation==='memory.delete'?null:op.after,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};
    proposal.hash=proposalHash(scope,proposal);if(Buffer.byteLength(JSON.stringify(proposal))>4096)throw new Rejected('invalid_input');
    await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at)
    VALUES (${proposal.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${proposal.action},${proposal.hash},${proposal.resource.version},${JSON.stringify(proposal)}::jsonb,${proposal.expiresAt}::timestamptz)`);
    scope.signal.throwIfAborted();return persistentMemoryResultSchema.parse({version:'coach-assistant.v2',storage:'database',ok:true,proposal});
   }
   if(op.operation!=='memory.apply')throw new Rejected('invalid_input');
   const saved=await tx.execute<{envelope:unknown;expired:boolean;request_hash:string;resource_version:string}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired,request_hash,resource_version FROM private.coach_action_proposals
   WHERE id=${op.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${op.conversationId}::uuid AND action IN ('memory.confirm','memory.correct','memory.delete')`);
   const stored=saved.rows[0];if(!stored)throw new Rejected('not_found');const proposal=persistentMemoryProposalSchema.parse(stored.envelope);
   if(stored.expired)throw new Rejected('expired');
   if(proposal.id!==op.proposalId||proposal.hash!==op.hash||stored.request_hash!==op.hash||proposalHash(scope,proposal)!==op.hash)throw new Rejected('invalid_input');
   if(proposal.resource.version!==op.resourceVersion||stored.resource_version!==op.resourceVersion)throw new Rejected('version_conflict');
   const memoryId=proposal.resource.id;const rows=await load(tx,scope,memoryId);
   if(proposal.action==='memory.confirm'){
    if(proposal.before!==null||proposal.after===null||op.resourceVersion!=='0'||rows.rows.length)throw new Rejected('version_conflict');
    const current=await load(tx,scope);if(current.rows.length>=20)throw new Rejected('invalid_input');
    await tx.execute(sql`INSERT INTO public.memory_chunks(id,user_id,scope,agent_name,session_id,fact_text,fact_type,source,confidence,active,expires_at)
    VALUES (${memoryId}::uuid,${scope.subjectId}::uuid,'agent','coach-assistant-confirmed',${op.conversationId},${proposal.after.text},'preference','user_input',1,true,NULL)`);
    await tx.execute(sql`INSERT INTO private.coach_memory_bindings(memory_id,actor_id,subject_id,organization_id,conversation_id,revision,confirmed_text_hash)
    VALUES (${memoryId}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,0,${contentHash(proposal.after.text)})`);
   }else{
    if(rows.rows.length!==1)throw new Rejected('not_found');const before=card(rows.rows[0],op.conversationId);
    if(!before||canonical(before)!==canonical(proposal.before)||before.version!==op.resourceVersion)throw new Rejected('version_conflict');
    if(proposal.action==='memory.correct'){
     if(!proposal.after)throw new Rejected('invalid_input');
     await tx.execute(sql`UPDATE public.memory_chunks SET fact_text=${proposal.after.text} WHERE id=${memoryId}::uuid AND user_id=${scope.subjectId}::uuid`);
     await tx.execute(sql`UPDATE private.coach_memory_bindings SET confirmed_text_hash=${contentHash(proposal.after.text)} WHERE memory_id=${memoryId}::uuid`);
    }else{
     if(proposal.after!==null)throw new Rejected('invalid_input');
     await tx.execute(sql`UPDATE public.memory_chunks SET active=false WHERE id=${memoryId}::uuid AND user_id=${scope.subjectId}::uuid`);
    }
   }
   const updated=await load(tx,scope,memoryId);if(updated.rows.length!==1)throw new Rejected('uncertain');const nextVersion=updated.rows[0].revision;
   if(proposal.action!=='memory.confirm'&&nextVersion===op.resourceVersion)throw new Rejected('uncertain');
   if(proposal.action==='memory.delete'?updated.rows[0].active:card(updated.rows[0],op.conversationId)?.text!==proposal.after?.text)throw new Rejected('uncertain');
   const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
   // Receipts carry invalidation metadata, never old or deleted preference text.
   const result=persistentMemoryResultSchema.parse({version:'coach-assistant.v2',storage:'database',ok:true,receipt:{id:randomUUID(),actionId:op.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString()},refresh:{conversationId:op.conversationId,strategy:'refetch',discardDerivedContext:true,invalidatedMemoryVersions:proposal.before?[{id:memoryId,version:proposal.before.version}]:[]}});
   if(!result.ok||!('receipt' in result))throw new Rejected('uncertain');
   await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result)
   VALUES (${result.receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${op.conversationId}::uuid,${op.actionId}::uuid,${proposal.id}::uuid,${op.hash},${op.resourceVersion},${JSON.stringify(result)}::jsonb)`);
   await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value)
   VALUES (${scope.actorId}::uuid,'client'::user_role,${proposal.action},'memory_chunks',${memoryId}::uuid,${JSON.stringify({actionId:op.actionId,version:nextVersion})}::jsonb)`);
   scope.signal.throwIfAborted();return result;
  });}catch(error){return fail(error instanceof Rejected?error.code:'uncertain');}
 }};
}
