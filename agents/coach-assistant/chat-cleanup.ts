import {sql} from 'drizzle-orm';
import type {db} from '@/db/client';
import type {CoachChatAttachmentRemovalPort} from './chat-ports';
import {authorizeCoachChat,COACH_CHAT_NAMESPACE,type CoachChatCleanup} from './chat-service';
/** Concrete scoped cleanup. Existing memory bindings/revision tombstones remain.
 * Soft memory.delete alone retains fact_text; this explicit thread erasure deletes
 * exclusively bound canonical chunks under the SAME memory advisory lock/trigger.
 * Independent profile preferences and applied non-memory actions are retained.
 */
export function createCoachChatCleanup(database:typeof db,attachments?:CoachChatAttachmentRemovalPort):CoachChatCleanup{
 return {async cleanup(scope,threadId,signal){
  try{
   const ids=await database.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);await authorizeCoachChat(tx,scope,signal);
    const t=await tx.execute(sql`SELECT id FROM private.coach_chat_threads WHERE id=${threadId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND actor_role=${scope.actorRole} AND state IN ('cleanup_pending','deleted') FOR UPDATE`);
    if(t.rows.length!==1)throw new Error('forbidden');
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${['coach-memory',scope.actorId,scope.subjectId,scope.organizationId,threadId].join(':')},0))`);
    const bound=await tx.execute<{memory_id:string;revision:string}>(sql`SELECT b.memory_id,b.revision::text FROM private.coach_memory_bindings b JOIN public.memory_chunks m ON m.id=b.memory_id WHERE b.actor_id=${scope.actorId}::uuid AND b.subject_id=${scope.subjectId}::uuid AND b.organization_id=${scope.organizationId}::uuid AND b.conversation_id=${threadId}::uuid ORDER BY b.memory_id LIMIT 20 FOR UPDATE OF m,b`);
    const memoryIds=bound.rows.map(row=>row.memory_id);
    // memory_id is unique in the existing binding table: exclusively owned by this scope.
    // Its deletion/recreation trigger increments revision; binding row is NOT deleted.
    await tx.execute(sql`DELETE FROM public.memory_chunks m USING private.coach_memory_bindings b WHERE m.id=b.memory_id AND m.user_id=b.subject_id
 AND b.actor_id=${scope.actorId}::uuid AND b.subject_id=${scope.subjectId}::uuid AND b.organization_id=${scope.organizationId}::uuid AND b.conversation_id=${threadId}::uuid
 AND m.scope::text='agent' AND m.agent_name='coach-assistant-confirmed' AND m.session_id=${threadId} AND m.id=ANY(${sql.param(memoryIds)}::uuid[])`);
    const revisions=await tx.execute<{memory_id:string;revision:string}>(sql`SELECT memory_id,revision::text FROM private.coach_memory_bindings WHERE memory_id=ANY(${sql.param(memoryIds)}::uuid[]) AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${threadId}::uuid`);
    if(bound.rows.some(before=>{const after=revisions.rows.find(row=>row.memory_id===before.memory_id);return !after||!/^\d+$/.test(after.revision)||!/^\d+$/.test(before.revision)||BigInt(after.revision)<=BigInt(before.revision);}))throw new Error('missing_memory_tombstone_revision');
    const remaining=await tx.execute(sql`SELECT b.memory_id FROM private.coach_memory_bindings b JOIN public.memory_chunks m ON m.id=b.memory_id WHERE b.actor_id=${scope.actorId}::uuid AND b.subject_id=${scope.subjectId}::uuid AND b.organization_id=${scope.organizationId}::uuid AND b.conversation_id=${threadId}::uuid LIMIT 1`);

    // This implementation creates no inferred memories; remove only its own session namespace if present.
    await tx.execute(sql`DELETE FROM public.memory_chunks WHERE user_id=${scope.subjectId}::uuid AND scope::text='session' AND agent_name=${COACH_CHAT_NAMESPACE} AND session_id=${threadId}`);
    // Historical memory envelopes contain deleted text. Remove their receipts first;
    // old proposals cannot be applied, and the thread tombstone prevents new ones.
    await tx.execute(sql`DELETE FROM private.coach_action_receipts r USING private.coach_action_proposals p WHERE r.proposal_id=p.id
 AND p.actor_id=${scope.actorId}::uuid AND p.subject_id=${scope.subjectId}::uuid AND p.organization_id=${scope.organizationId}::uuid AND p.conversation_id=${threadId}::uuid
 AND r.actor_id=${scope.actorId}::uuid AND r.subject_id=${scope.subjectId}::uuid AND r.organization_id=${scope.organizationId}::uuid AND r.conversation_id=${threadId}::uuid
 AND p.action IN ('memory.confirm','memory.correct','memory.delete')`);
    await tx.execute(sql`DELETE FROM private.coach_action_proposals p WHERE p.actor_id=${scope.actorId}::uuid AND p.subject_id=${scope.subjectId}::uuid AND p.organization_id=${scope.organizationId}::uuid AND p.conversation_id=${threadId}::uuid
 AND (p.action IN ('memory.confirm','memory.correct','memory.delete') OR NOT EXISTS(SELECT 1 FROM private.coach_action_receipts r WHERE r.proposal_id=p.id))`);
    const rows=await tx.execute<{id:string}>(sql`SELECT id FROM private.coach_attachment_uploads WHERE actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${threadId}::uuid AND state<>'removed' ORDER BY id LIMIT 21`);
    await authorizeCoachChat(tx,scope,signal);return {attachments:rows.rows.map(r=>r.id),memoryComplete:remaining.rows.length===0};
   });
   if(!ids.memoryComplete||ids.attachments.length>20||ids.attachments.length&&!attachments)return {complete:false};
   for(const id of ids.attachments){const result=await attachments!.operation({actorId:scope.actorId,subjectId:scope.subjectId,organizationId:scope.organizationId},{version:'coach-assistant.v2',operation:'attachment.remove',conversationId:threadId,attachmentId:id,reviewed:true},signal);if(!result.ok||result.state!=='removed')return {complete:false};}
   return await database.transaction(async tx=>{
    await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);await authorizeCoachChat(tx,scope,signal);
    const rows=await tx.execute(sql`SELECT id FROM private.coach_attachment_uploads WHERE actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${threadId}::uuid AND state<>'removed' LIMIT 1`);
    signal.throwIfAborted();return {complete:rows.rows.length===0};
   });
  }catch{return {complete:false};}
 }};
}
