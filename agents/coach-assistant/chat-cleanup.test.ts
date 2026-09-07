import {describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';
import type {db} from '@/db/client';
import type {createPrivateAttachmentService} from './attachments-service';
import {createCoachChatCleanup} from './chat-cleanup';
import type {CoachChatScope} from './chat-contract';
const scope:CoachChatScope={actorId:randomUUID(),subjectId:'',organizationId:randomUUID(),actorRole:'client'};scope.subjectId=scope.actorId;const thread=randomUUID();
function fixture(advanceRevision=true){
 const dialect=new PgDialect(),queries:string[]=[];
 const memory={threadText:'vegan',bindingRevision:4,profilePreference:'vegan',otherThreadText:'preferencia de otro hilo'};
 let attachmentPending=false,removed=false,authorized=true;
 const database={transaction:async(work:(tx:{execute:(q:SQL)=>Promise<unknown>})=>Promise<unknown>)=>work({execute:async q=>{
  const {sql:s,params:p}=dialect.sqlToQuery(q);queries.push(s);
  if(s.includes('FROM public.profiles'))return {rows:authorized?[{id:scope.actorId}]:[]};
  if(s.includes('FROM private.coach_chat_threads'))return {rows:[{id:thread}]};
  if(s.includes('DELETE FROM public.memory_chunks m USING')){
   expect(p.slice(0,5)).toEqual([scope.actorId,scope.subjectId,scope.organizationId,thread,thread]);expect(p[5]).toEqual(memory.threadText?['846050dc-cd48-40ea-ae8c-72caa8b1e14e']:[]);expect(s).toContain("m.agent_name='coach-assistant-confirmed'");expect(s).toContain("m.scope::text='agent'");if(memory.threadText){memory.threadText='';if(advanceRevision)memory.bindingRevision++;}return {rows:[]};
  }
  if(s.includes('SELECT b.memory_id,b.revision'))return {rows:memory.threadText?[{memory_id:'846050dc-cd48-40ea-ae8c-72caa8b1e14e',revision:String(memory.bindingRevision)}]:[]};
  if(s.includes('SELECT memory_id,revision'))return {rows:[{memory_id:'846050dc-cd48-40ea-ae8c-72caa8b1e14e',revision:String(memory.bindingRevision)}]};
  if(s.includes('SELECT b.memory_id'))return {rows:[]};
  if(s.includes('FROM private.coach_attachment_uploads'))return {rows:attachmentPending&&!removed?[{id:'a1d480b1-4aab-4089-995e-33c8f91969ef'}]:[]};
  return {rows:[]};
 }})};
 const operation=vi.fn(async()=>{removed=true;return {ok:true,state:'removed'};});
 return {database:database as unknown as typeof db,memory,queries,operation,attachments:{operation} as unknown as ReturnType<typeof createPrivateAttachmentService>,pending:()=>{attachmentPending=true;},revoke:()=>{authorized=false;}};
}
describe('thread deletion erases exclusively bound text without independent profile writes',()=>{
 it('uses existing memory lock/tombstones, purges thread memory and envelopes, preserves independent preferences',async()=>{
  const f=fixture();expect(await createCoachChatCleanup(f.database).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:true});
  expect(f.memory).toEqual({threadText:'',bindingRevision:5,profilePreference:'vegan',otherThreadText:'preferencia de otro hilo'});
  expect(f.queries.join('\n')).toContain('pg_advisory_xact_lock');expect(f.queries.join('\n')).not.toMatch(/DELETE FROM private.coach_memory_bindings|UPDATE public.client_profiles|DELETE FROM public.food_log|DELETE FROM public.messages/);
  expect(f.queries.join('\n')).toContain("p.action IN ('memory.confirm','memory.correct','memory.delete')");
 });
 it('returns pending for missing/failed attachment cleanup and resumes through the existing lifecycle',async()=>{
  const f=fixture();f.pending();expect(await createCoachChatCleanup(f.database).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:false});
  expect(await createCoachChatCleanup(f.database,f.attachments).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:true});
  expect(f.operation).toHaveBeenCalledWith({actorId:scope.actorId,subjectId:scope.subjectId,organizationId:scope.organizationId},{version:'coach-assistant.v2',operation:'attachment.remove',conversationId:thread,attachmentId:'a1d480b1-4aab-4089-995e-33c8f91969ef',reviewed:true},expect.any(AbortSignal));
 });
 it('cannot report erasure complete when the existing memory deletion revision trigger is absent',async()=>{
  const f=fixture(false);expect(await createCoachChatCleanup(f.database,f.attachments).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:false});expect(f.operation).not.toHaveBeenCalled();
 });
 it('does not erase through revoked authorization and does not report unavailable schema as complete',async()=>{
  const f=fixture();f.revoke();expect(await createCoachChatCleanup(f.database).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:false});expect(f.memory.threadText).not.toBe('');
  const transaction=vi.fn().mockRejectedValue({code:'42P01'});expect(await createCoachChatCleanup({transaction} as unknown as typeof db).cleanup(scope,thread,new AbortController().signal)).toEqual({complete:false});
 });
});
