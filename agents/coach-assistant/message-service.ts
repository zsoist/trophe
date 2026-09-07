import { createHash,randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { db } from '@/db/client';
import { insertReviewedClientMessage } from '@/lib/chat/client-message-service';
import { coachMessageOperationSchema,coachMessageProposalSchema,coachMessageResultSchema,recipientSchema,type CoachMessageService,type CoachMessageProposal,type CoachMessageResult } from './message-actions';
type Database=typeof db;
type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope=Parameters<CoachMessageService['execute']>[0];
type ErrorCode=Extract<CoachMessageResult,{ok:false}>['error'];
class Rejected extends Error{constructor(readonly code:ErrorCode){super(code);}}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function recipient(tx:Transaction,scope:Scope){
 scope.signal.throwIfAborted();
 const result=await tx.execute<{coach_id:string;full_name:string|null;revision:string}>(sql`SELECT cp.coach_id,coach.full_name,v.revision::text
 FROM public.client_profiles cp JOIN public.profiles actor ON actor.id=cp.user_id JOIN public.profiles coach ON coach.id=cp.coach_id
 JOIN public.organization_members am ON am.user_id=actor.id JOIN public.organization_members cm ON cm.user_id=coach.id AND cm.org_id=am.org_id
 JOIN private.coach_chat_recipient_versions v ON v.subject_id=cp.user_id
 WHERE cp.user_id=${scope.actorId}::uuid AND actor.role::text='client' AND coach.role::text='coach'
 AND am.org_id=${scope.organizationId}::uuid AND am.role::text='client' AND cm.role::text='coach'
 FOR SHARE OF cp,actor,coach,am,cm,v`);
 if(result.rows.length!==1)throw new Rejected('forbidden');
 const row=result.rows[0];return recipientSchema.parse({coachId:row.coach_id,name:row.full_name,version:hash({actor:scope.actorId,org:scope.organizationId,...row})});
}
/** Required limiter is the existing consumeRateLimit function (same product bucket).
 * Factory itself sends nothing. SQL message and receipt commit on one transaction. */
export function createCoachMessageService(database:Database,consumeRateLimit:(key:string,limit:number,seconds:number)=>Promise<{allowed:boolean;retryAfter:number}>):CoachMessageService{
 return {async execute(scope){
  const parsed=coachMessageOperationSchema.safeParse(scope.operation);if(!parsed.success)return {ok:false,error:'invalid_input'};
  if(scope.actorId!==scope.subjectId)return {ok:false,error:'forbidden'};const operation=parsed.data;
  try{return await database.transaction(async tx=>{
   await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
   if('actionId' in operation)await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+operation.actionId},0))`);
   const current=await recipient(tx,scope);
   if('coachId' in operation&&operation.coachId!==current.coachId)throw new Rejected('forbidden');
   if('actionId' in operation){
    const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;result:unknown}>(sql`SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action
    FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id
    WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${operation.actionId}::uuid`);
    if(prior.rows.length){const saved=prior.rows[0];const output=coachMessageResultSchema.parse(saved.result);
     if(saved.action!=='chat.message.send'||saved.subject_id!==scope.subjectId||saved.organization_id!==scope.organizationId||saved.conversation_id!==operation.conversationId||!output.ok||!('receipt' in output)||output.receipt.actionId!==operation.actionId||output.receipt.coachId!==operation.coachId||output.receipt.proposalId!==saved.proposal_id||operation.operation==='message.apply'&&(saved.proposal_id!==operation.proposalId||saved.request_hash!==operation.hash||saved.resource_version!==operation.resourceVersion))throw new Rejected('idempotency_conflict');
     scope.signal.throwIfAborted();return output;
    }
    if(operation.operation==='message.receipt')throw new Rejected('not_found');
   }
   if(operation.operation==='message.recipient')return {ok:true,recipient:current};
   if(operation.operation==='message.propose'){
    if(operation.resourceVersion!==current.version)throw new Rejected('version_conflict');
    const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);if(Number(count.rows[0]?.count??128)>=128)throw new Rejected('rate_limited');
    const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
    const proposal:CoachMessageProposal={id:randomUUID(),hash:'',action:'chat.message.send',recipient:current,after:operation.after,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};
    proposal.hash=hash({actor:scope.actorId,org:scope.organizationId,conversation:operation.conversationId,proposal});
    await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at)
    VALUES(${proposal.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,'chat.message.send',${proposal.hash},${current.version},${JSON.stringify(proposal)}::jsonb,${proposal.expiresAt}::timestamptz)`);
    scope.signal.throwIfAborted();return {ok:true,proposal};
   }
   if(operation.operation!=='message.apply')throw new Rejected('invalid_input');
   // Serializes a second action ID aimed at the same reviewed proposal.
   const saved=await tx.execute<{envelope:unknown;expired:boolean}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired FROM private.coach_action_proposals
   WHERE id=${operation.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${operation.conversationId}::uuid AND action='chat.message.send' FOR UPDATE`);
   if(saved.rows.length!==1)throw new Rejected('not_found');const proposal=coachMessageProposalSchema.parse(saved.rows[0].envelope);
   if(proposal.id!==operation.proposalId||proposal.hash!==operation.hash||proposal.recipient.coachId!==operation.coachId||hash({actor:scope.actorId,org:scope.organizationId,conversation:operation.conversationId,proposal:{...proposal,hash:''}})!==proposal.hash)throw new Rejected('invalid_input');
   // The message can legitimately be deleted; durable consumption cannot depend on it.
   // The proposal row lock above serializes all action IDs targeting this proposal.
   const consumed=await tx.execute(sql`SELECT id FROM private.coach_action_receipts
   WHERE actor_id=${scope.actorId}::uuid AND proposal_id=${proposal.id}::uuid LIMIT 1`);
   if(consumed.rows.length)throw new Rejected('idempotency_conflict');
   const duplicate=await tx.execute(sql`SELECT id FROM public.messages WHERE id=${proposal.id}::uuid`);if(duplicate.rows.length)throw new Rejected('idempotency_conflict');
   if(saved.rows[0].expired)throw new Rejected('expired');
   if(proposal.recipient.version!==operation.resourceVersion||JSON.stringify(proposal.recipient)!==JSON.stringify(current))throw new Rejected('version_conflict');
   const rate=await consumeRateLimit(`client-message:${scope.actorId}`,30,900);if(!rate.allowed)throw new Rejected('rate_limited');
   const fresh=await recipient(tx,scope);if(JSON.stringify(fresh)!==JSON.stringify(current))throw new Rejected('version_conflict');scope.signal.throwIfAborted();
   const expiry=await tx.execute<{expired:boolean}>(sql`SELECT clock_timestamp()>=${proposal.expiresAt}::timestamptz AS expired`);
   if(expiry.rows[0]?.expired!==false)throw new Rejected('expired');
   const stored=await insertReviewedClientMessage(tx,{messageId:proposal.id,actorId:scope.actorId,subjectId:scope.subjectId,organizationId:scope.organizationId,coachId:current.coachId,message:proposal.after.message});
   const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
   const output:CoachMessageResult={ok:true,receipt:{id:randomUUID(),actionId:operation.actionId,proposalId:proposal.id,messageId:stored.messageId,coachId:current.coachId,status:'stored',recordedAt:new Date(clock.rows[0].recorded).toISOString()},refresh:{coachId:current.coachId,clientId:scope.subjectId,strategy:'refetch'}};
   await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result)
   VALUES(${output.receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${operation.actionId}::uuid,${proposal.id}::uuid,${operation.hash},${operation.resourceVersion},${JSON.stringify(output)}::jsonb)`);
   scope.signal.throwIfAborted();return output;
  });}catch(error){
   const code=(value:unknown)=>value&&typeof value==='object'&&'code' in value?value.code:undefined;
   const cause=error&&typeof error==='object'&&'cause' in error?error.cause:undefined;
   if([code(error),code(cause)].some(value=>value==='42P01'||value==='42703'))return {ok:false,error:'not_connected'};
   if(error instanceof Rejected)return {ok:false,error:error.code};
   if(error instanceof Error&&['forbidden','invalid_input'].includes(error.message))return {ok:false,error:error.message as 'forbidden'|'invalid_input'};
   return {ok:false,error:'uncertain'};
  }
 }};
}
