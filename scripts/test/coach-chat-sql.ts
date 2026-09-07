/** PREPARED ONLY. Parent owns preinstalled chat/memory/attachment DDL and ledger.
 * Single serial child; no schema installation, no model transport. */
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createCoachChatService, COACH_CHAT_NAMESPACE } from '../../agents/coach-assistant/chat-service';
import { createPersistentMemoryService } from '../../agents/coach-assistant/memory-service';
import { createCoachChatCleanup } from '../../agents/coach-assistant/chat-cleanup';
import { runVerifiedChatFinal } from '../../agents/coach-assistant/chat-final';
import { createServerRepository } from '../../agents/coach-assistant/server-repository';
import { COACH_CHAT_VERSION, type CoachChatScope } from '../../agents/coach-assistant/chat-contract';
const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
 && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
 && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId,coachId,organizationId]) assert.match(id,/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const pool = new Pool({connectionString:target.toString(),max:4,statement_timeout:5000,connectionTimeoutMillis:5000});
const scope:CoachChatScope={actorId,subjectId:actorId,organizationId,actorRole:'client'};
const database=drizzle(pool),service=createCoachChatService(database,createCoachChatCleanup(database));
const signal=()=>new AbortController().signal;
const threadIds:string[]=[],contentIds:string[]=[],memoryIds:string[]=[],memoryProposals:string[]=[],memoryActions:string[]=[];
let baseline:unknown,check='preconditions';
const pass=()=>process.stdout.write(JSON.stringify({event:'coach_chat_sql',check,outcome:'passed'})+'\n');
const parent=async()=>({
 audit:(await pool.query('SELECT * FROM public.audit_log WHERE actor_id=$1 ORDER BY id',[actorId])).rows,
 receipts:(await pool.query('SELECT * FROM private.coach_action_receipts WHERE actor_id=$1 ORDER BY id',[actorId])).rows,
 proposals:(await pool.query('SELECT * FROM private.coach_action_proposals WHERE actor_id=$1 ORDER BY id',[actorId])).rows,
 profile:(await pool.query('SELECT to_jsonb(cp) AS row FROM public.client_profiles cp WHERE user_id=$1',[actorId])).rows,
});
const execute=(op:Record<string,unknown>)=>service.execute(scope,{version:COACH_CHAT_VERSION,...op},signal());
async function asActor<T>(connection:PoolClient,id:string,work:()=>Promise<T>){
 await connection.query('SET LOCAL ROLE authenticated');
 await connection.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:id,role:'authenticated'})]);
 try{return await work();}finally{await connection.query('RESET ROLE');}
}
async function visible(connection:PoolClient,id:string,contentId:string){return asActor(connection,id,async()=>(await connection.query('SELECT id FROM public.agent_conversation WHERE id=$1',[contentId])).rowCount);}
async function rollbackProbe(work:(connection:PoolClient)=>Promise<void>){const c=await pool.connect();try{await c.query('BEGIN');await work(c);}finally{await c.query('ROLLBACK');c.release();}}
async function create(title:string){const requestId=randomUUID();const result=await execute({operation:'create',requestId,title});assert.ok(result.ok&&'thread'in result.value);threadIds.push(result.value.thread.id);return {requestId,thread:result.value.thread};}
async function user(threadId:string,text:string){const turnId=randomUUID(),requestId=randomUUID(),op={operation:'append_user',threadId,turnId,requestId,text};const result=await execute(op);assert.ok(result.ok&&'message'in result.value);contentIds.push(result.value.message.id);return {op,result,message:result.value.message};}
async function main(){
 baseline=structuredClone(await parent());
 assert.ok((baseline as Awaited<ReturnType<typeof parent>>).receipts.length>0,'independent_parent_receipt_required');
 assert.equal((await pool.query('SELECT private.coach_chat_contract_version() AS version')).rows[0].version,COACH_CHAT_VERSION);
 const enabled=(await pool.query("SELECT relname,relrowsecurity FROM pg_class WHERE oid=ANY(ARRAY['public.agent_conversation'::regclass,'private.coach_chat_threads'::regclass,'private.coach_chat_turns'::regclass])")).rows;
 assert.equal(enabled.length,3);assert.ok(enabled.every(r=>r.relrowsecurity));
 assert.equal((await pool.query("SELECT polpermissive FROM pg_policy WHERE polrelid='public.agent_conversation'::regclass AND polname='coach_chat_namespace_guard'")).rows[0]?.polpermissive,false);
 const helper=(await pool.query("SELECT p.prosecdef,p.proconfig,r.rolname AS owner,r.rolsuper FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='private.coach_chat_content_visible(uuid,uuid,text,text)'::regprocedure")).rows[0];
 assert.ok(helper?.prosecdef);assert.ok(helper.rolsuper||helper.owner==='postgres','trusted_helper_owner_required');assert.ok(helper.proconfig.some((s:string)=>s.startsWith('search_path=')&&!s.includes('public')));
 const grants=(await pool.query("SELECT has_function_privilege('authenticated','private.coach_chat_content_visible(uuid,uuid,text,text)','EXECUTE') AS allowed,has_function_privilege('anon','private.coach_chat_content_visible(uuid,uuid,text,text)','EXECUTE') AS anon,has_schema_privilege('authenticated','private','USAGE') AS usage")).rows[0];
 assert.deepEqual(grants,{allowed:true,anon:false,usage:true});pass();
 check='create_replay_page_and_rename_cas';const a=await create('Synthetic chat A'),b=await create('Synthetic chat B');
 const replay=await execute({operation:'create',requestId:a.requestId,title:'Synthetic chat A'});assert.ok(replay.ok&&'thread'in replay.value);assert.equal(replay.value.thread.id,a.thread.id);
 const found:string[]=[];let before:unknown=undefined;
 for(let n=0;n<50;n++){const result=await execute({operation:'list',limit:1,...(before?{before}:{})});assert.ok(result.ok&&'threads'in result.value);found.push(...result.value.threads.map(t=>t.id));before=result.value.nextCursor;if(!before)break;}
 assert.ok(found.includes(a.thread.id)&&found.includes(b.thread.id));assert.equal(new Set(found).size,found.length);
 assert.ok((await execute({operation:'rename',threadId:a.thread.id,title:'Renamed',expectedRevision:a.thread.revision})).ok);
 const stale=await execute({operation:'rename',threadId:a.thread.id,title:'Stale',expectedRevision:a.thread.revision});assert.ok(!stale.ok&&stale.error==='version_conflict');pass();
 check='user_request_identity_and_final_proof';const u=await user(a.thread.id,'Review my workout records today');
 await user(a.thread.id,'Second explicit user turn');
 const firstPage=await execute({operation:'read',threadId:a.thread.id,limit:1});assert.ok(firstPage.ok&&'messages'in firstPage.value);assert.equal(firstPage.value.messages.length,1);assert.equal(firstPage.value.nextSequence,1);
 const nextPage=await execute({operation:'read',threadId:a.thread.id,limit:1,afterSequence:firstPage.value.nextSequence});assert.ok(nextPage.ok&&'messages'in nextPage.value);assert.equal(nextPage.value.messages[0].sequence,2);
 assert.deepEqual(await execute(u.op),{...u.result,value:{...u.result.value,replayed:true}});
 const conflict=await execute({...u.op,text:'Different'});assert.ok(!conflict.ok&&conflict.error==='idempotency_conflict');
 const generated=await runVerifiedChatFinal({version:'coach-assistant.v2',conversationId:a.thread.id,turnId:u.op.turnId,message:u.op.text},{actorId,repository:createServerRepository(pool),mode:'offline',now:new Date(),signal:signal()},scope);
 assert.ok(generated.final,'offline_existing_pipeline_final_required');
 const final=await service.appendFinal(scope,{threadId:a.thread.id,requestId:randomUUID()},generated.final,signal());assert.ok(final.ok&&'message'in final.value);contentIds.push(final.value.message.id);
 const lookup=await service.lookupFinal(scope,a.thread.id,final.value.message.id,signal());assert.ok(lookup.ok);assert.equal(lookup.value.text,generated.response.output!.answer);pass();
 check='legacy_and_current_self_positive_foreign_actor_negative';
 const legacyId=randomUUID();contentIds.push(legacyId);
 await pool.query("INSERT INTO public.agent_conversation(id,user_id,agent_name,session_id,role,content) VALUES($1,$2,'coach_insight',$3,'assistant','Synthetic legacy positive')",[legacyId,actorId,a.thread.id]);
 await rollbackProbe(async c=>{assert.equal(await visible(c,actorId,legacyId),1);assert.equal(await visible(c,actorId,u.message.id),1);assert.equal(await visible(c,coachId,u.message.id),0);});
 await rollbackProbe(async c=>{await c.query('SET LOCAL ROLE authenticated');await assert.rejects(c.query('SELECT * FROM private.coach_chat_threads'),{code:'42501'});});pass();
 check='foreign_tenant_and_subject_rejected_by_helper';
 await rollbackProbe(async c=>{
  const org=randomUUID();await c.query('INSERT INTO public.organizations(id,name,slug) VALUES($1,$2,$3)',[org,'Synthetic scope probe','chat-probe-'+org]);
  for(const [subject,tenant] of [[actorId,org],[coachId,organizationId]]){
   const thread=randomUUID(),id=randomUUID(),text='Synthetic invalid scope';
   await c.query("INSERT INTO private.coach_chat_threads(id,actor_id,subject_id,organization_id,actor_role,request_id,create_hash,title) VALUES($1,$2,$3,$4,'client',$5,$6,'Synthetic scope')",[thread,actorId,subject,tenant,randomUUID(),'a'.repeat(64)]);
   await c.query('INSERT INTO public.agent_conversation(id,user_id,agent_name,session_id,role,content) VALUES($1,$2,$3,$4,\'user\',$5)',[id,actorId,COACH_CHAT_NAMESPACE,thread,text]);
   await c.query("INSERT INTO private.coach_chat_turns(thread_id,content_id,turn_id,request_id,role,sequence,revision,content_hash,current) VALUES($1,$2,$3,$4,'user',1,$5,$6,true)",[thread,id,randomUUID(),randomUUID(),randomUUID(),createHash('sha256').update(text).digest('hex')]);
   assert.equal(await visible(c,actorId,id),0);assert.equal(await visible(c,actorId,legacyId),1);
  }
 });pass();
 check='real_role_and_membership_aba_latches_revocation';
 for(const kind of ['profile_role','membership_role','membership_recreate'] as const)await rollbackProbe(async c=>{
  if(kind==='profile_role'){await c.query("UPDATE public.profiles SET role='coach' WHERE id=$1",[actorId]);await c.query("UPDATE public.profiles SET role='client' WHERE id=$1",[actorId]);}
  else if(kind==='membership_role'){await c.query("UPDATE public.organization_members SET role='coach' WHERE user_id=$1 AND org_id=$2",[actorId,organizationId]);await c.query("UPDATE public.organization_members SET role='client' WHERE user_id=$1 AND org_id=$2",[actorId,organizationId]);}
  else {const row=(await c.query('SELECT to_jsonb(m) AS row FROM public.organization_members m WHERE user_id=$1 AND org_id=$2',[actorId,organizationId])).rows[0].row;await c.query('DELETE FROM public.organization_members WHERE user_id=$1 AND org_id=$2',[actorId,organizationId]);await c.query('INSERT INTO public.organization_members SELECT (jsonb_populate_record(NULL::public.organization_members,$1::jsonb)).*',[JSON.stringify(row)]);}
  assert.equal((await c.query('SELECT access_revoked FROM private.coach_chat_threads WHERE id=$1',[a.thread.id])).rows[0].access_revoked,true);
  assert.equal(await visible(c,actorId,u.message.id),0);assert.equal(await visible(c,actorId,legacyId),1);
 });
 // The role/ABA probe transactions roll back: parent lineage and fixture remain intact.
 await rollbackProbe(async c=>assert.equal(await visible(c,actorId,u.message.id),1));pass();
 check='confirmed_thread_memory_exists_before_erasure';
 const memoryService=createPersistentMemoryService(database),memoryHeader={version:'coach-assistant.v2' as const,conversationId:a.thread.id,turnId:randomUUID()};
 const memoryScope={actorId,subjectId:actorId,organizationId,signal:signal()};
 const proposedMemory=await memoryService.execute({...memoryScope,operation:{...memoryHeader,operation:'memory.propose',action:'memory.confirm',after:{text:'Synthetic exclusively bound chat memory',source:'user_input',retention:'persistent'}}});
 assert.ok(proposedMemory.ok&&'proposal'in proposedMemory);const mp=proposedMemory.proposal;
 memoryIds.push(mp.resource.id);memoryProposals.push(mp.id);const memoryAction=randomUUID();memoryActions.push(memoryAction);
 const confirmedMemory=await memoryService.execute({...memoryScope,operation:{...memoryHeader,operation:'memory.apply',proposalId:mp.id,hash:mp.hash,resourceVersion:mp.resource.version,actionId:memoryAction,reviewed:true}});
 assert.ok(confirmedMemory.ok&&'receipt'in confirmedMemory);
 assert.equal((await pool.query('SELECT fact_text FROM public.memory_chunks WHERE id=$1 AND user_id=$2',[mp.resource.id,actorId])).rows[0]?.fact_text,mp.after!.text);
 const bindingBefore=(await pool.query('SELECT revision::text FROM private.coach_memory_bindings WHERE memory_id=$1 AND actor_id=$2 AND subject_id=$2 AND organization_id=$3 AND conversation_id=$4',[mp.resource.id,actorId,organizationId,a.thread.id])).rows[0]?.revision;
 assert.ok(bindingBefore!==undefined);assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2 AND proposal_id=$3',[actorId,memoryAction,mp.id])).rowCount,1);pass();
 check='delete_removes_content_and_invalidates_lookup';const deleted=await execute({operation:'delete',threadId:a.thread.id,reviewed:true});assert.ok(deleted.ok&&'thread'in deleted.value);assert.equal(deleted.value.thread.state,'deleted');
 assert.equal((await pool.query('SELECT id FROM public.agent_conversation WHERE id=ANY($1::uuid[])',[contentIds.filter(id=>id!==legacyId)])).rowCount,0);
 assert.ok(!(await service.lookupFinal(scope,a.thread.id,final.value.message.id,signal())).ok);
 await rollbackProbe(async c=>{assert.equal(await visible(c,actorId,u.message.id),0);assert.equal(await visible(c,actorId,legacyId),1);
  await asActor(c,actorId,async()=>assert.equal((await c.query('SELECT private.coach_chat_content_visible($1,$2,$3,$4) AS visible',[u.message.id,actorId,a.thread.id,'user'])).rows[0].visible,false));});
 assert.ok(!(await execute({operation:'create',requestId:a.requestId,title:'Synthetic chat A'})).ok);pass();
 check='thread_erasure_removes_memory_envelope_receipt_but_advances_tombstone';
 assert.equal((await pool.query('SELECT id FROM public.memory_chunks WHERE id=$1',[mp.resource.id])).rowCount,0);
 assert.equal((await pool.query('SELECT id FROM private.coach_action_proposals WHERE id=$1',[mp.id])).rowCount,0);
 assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2',[actorId,memoryAction])).rowCount,0);
 const tombstone=(await pool.query('SELECT revision::text FROM private.coach_memory_bindings WHERE memory_id=$1 AND actor_id=$2 AND subject_id=$2 AND organization_id=$3 AND conversation_id=$4',[mp.resource.id,actorId,organizationId,a.thread.id])).rows;
 assert.equal(tombstone.length,1);assert.ok(BigInt(tombstone[0].revision)>BigInt(bindingBefore));
 // Audit has no memory text and remains immutable through product deletion.
 assert.equal((await pool.query("SELECT id FROM public.audit_log WHERE actor_id=$1 AND record_id=$2 AND table_name='memory_chunks' AND new_value->>'actionId'=$3",[actorId,mp.resource.id,memoryAction])).rowCount,1);
 const afterErasure=await parent(),beforeErasure=baseline as Awaited<ReturnType<typeof parent>>;
 assert.deepEqual(afterErasure.profile,beforeErasure.profile);assert.deepEqual(afterErasure.receipts,beforeErasure.receipts);assert.deepEqual(afterErasure.proposals,beforeErasure.proposals);pass();
}
main().catch(error=>{process.stderr.write(JSON.stringify({event:'coach_chat_sql',check,outcome:'failed',...(typeof error?.code==='string'?{sqlstate:error.code}:{})})+'\n');process.exitCode=1;}).finally(async()=>{
 try{
  const c=await pool.connect();try{await c.query('BEGIN');
   // Fixture cleanup also runs when main fails before the product delete.
   if(memoryIds.length){
    await c.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
    const enabled=async()=>(await c.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
    assert.equal(await enabled(),'O');await c.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
    await c.query("DELETE FROM public.audit_log WHERE actor_id=$1 AND table_name='memory_chunks' AND record_id=ANY($2::uuid[]) AND action='memory.confirm' AND new_value->>'actionId'=ANY($3::text[])",[actorId,memoryIds,memoryActions]);
    await c.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable');assert.equal(await enabled(),'O');
    await c.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND proposal_id=ANY($4::uuid[]) AND action_id=ANY($5::uuid[])',[actorId,organizationId,threadIds,memoryProposals,memoryActions]);
    await c.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND id=ANY($4::uuid[])',[actorId,organizationId,threadIds,memoryProposals]);
    await c.query("DELETE FROM public.memory_chunks WHERE user_id=$1 AND id=ANY($2::uuid[]) AND agent_name='coach-assistant-confirmed' AND session_id=ANY($3::text[])",[actorId,memoryIds,threadIds]);
    await c.query('DELETE FROM private.coach_memory_bindings WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND memory_id=ANY($4::uuid[])',[actorId,organizationId,threadIds,memoryIds]);
   }
   await c.query('DELETE FROM public.agent_conversation c USING private.coach_chat_turns t,private.coach_chat_threads h WHERE c.id=t.content_id AND t.thread_id=h.id AND c.user_id=$1 AND h.actor_id=$1 AND h.subject_id=$1 AND h.organization_id=$2 AND h.id=ANY($3::uuid[])',[actorId,organizationId,threadIds]);
   await c.query('DELETE FROM public.agent_conversation WHERE user_id=$1 AND id=ANY($2::uuid[])',[actorId,contentIds]);
   await c.query('DELETE FROM private.coach_chat_turns t USING private.coach_chat_threads h WHERE t.thread_id=h.id AND h.actor_id=$1 AND h.subject_id=$1 AND h.organization_id=$2 AND h.id=ANY($3::uuid[])',[actorId,organizationId,threadIds]);
   await c.query('DELETE FROM private.coach_chat_threads WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND id=ANY($3::uuid[])',[actorId,organizationId,threadIds]);
   await c.query('COMMIT');}catch(error){await c.query('ROLLBACK');throw error;}finally{c.release();}
  assert.equal((await pool.query('SELECT id FROM public.agent_conversation WHERE user_id=$1 AND id=ANY($2::uuid[])',[actorId,contentIds])).rowCount,0);
  assert.equal((await pool.query('SELECT id FROM private.coach_chat_threads WHERE actor_id=$1 AND id=ANY($2::uuid[])',[actorId,threadIds])).rowCount,0);
  assert.equal((await pool.query('SELECT memory_id FROM private.coach_memory_bindings WHERE actor_id=$1 AND memory_id=ANY($2::uuid[])',[actorId,memoryIds])).rowCount,0);
  assert.equal((await pool.query('SELECT id FROM public.memory_chunks WHERE user_id=$1 AND id=ANY($2::uuid[])',[actorId,memoryIds])).rowCount,0);
  if(baseline)assert.deepEqual(await parent(),baseline);
  check='own_chat_fixture_removed_parent_preserved';pass();
 }catch{process.stderr.write('Isolated chat cleanup failed.\n');process.exitCode=1;}
 await pool.end();
});
