import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';
import type {db} from '@/db/client';
import {createCoachChatService,createDurableCoachSpeechTextPort,COACH_CHAT_NAMESPACE} from './chat-service';
import {COACH_CHAT_VERSION,type CoachChatScope} from './chat-contract';
import {runVerifiedChatFinal,type VerifiedChatFinal} from './chat-final';
import {fixtureRepository} from './fixtures';
import type {CoachRepository} from './repository';
const scope=():CoachChatScope=>({actorId:randomUUID(),subjectId:'',organizationId:randomUUID(),actorRole:'client'});
interface ThreadRow {id:string;actorId:string;subjectId:string;organizationId:string;actorRole:string;request_id:string;create_hash:string;title:string;state:string;created_at:string;revision:string;next_sequence:number;access_revoked:boolean}
interface TurnRow {threadId:string;id:string;turn_id:string;request_id:string;role:string;sequence:number;revision:string;content_hash:string;pipeline_version:string|null;current:boolean;outcome:'inflight'|'failed'|'settled'}
/** A stateful SQL double runs the real service and bound statements, not PostgreSQL. */
function backend(){
 const dialect=new PgDialect(),threads=new Map<string,ThreadRow>(),turns=new Map<string,TurnRow>(),contents=new Map<string,{owner:string;session:string;agent:string;role:string;content:string}>(),valid=new Set<string>(),queries:string[]=[];
 let connected=true;
 const samescope=(t:ThreadRow,p:unknown[])=>[t.actorId,t.subjectId,t.organizationId,t.actorRole].every((x,i)=>x===p[i]);
 const database={transaction:async(work:(tx:{execute:(s:SQL)=>Promise<unknown>})=>Promise<unknown>)=>{
  const snapshots=[structuredClone(threads),structuredClone(turns),structuredClone(contents)];
  try{return await work({execute:async q=>{
   const {sql:s,params:p}=dialect.sqlToQuery(q);queries.push(s);const rows=(value:unknown[])=>({rows:value});
   if(s.includes('FROM public.profiles a')){expect(s).toContain('FOR SHARE OF a,am,s,cp,sm');expect(s).toContain('cp.coach_id=a.id');return rows(valid.has([p[2],p[1],p[0],p[3]].join(':'))?[{id:p[2]}]:[]);}
   if(s.includes('coach_chat_contract_version'))return rows(connected?[{version:COACH_CHAT_VERSION}]:[]);
   if(s.includes('pg_advisory_xact_lock')||s.startsWith('SET LOCAL'))return rows([]);
   if(s.startsWith('INSERT INTO private.coach_chat_threads')){const [id,actorId,subjectId,organizationId,actorRole,request_id,create_hash,title]=p as string[];threads.set(id,{id,actorId,subjectId,organizationId,actorRole,request_id,create_hash,title,state:'active',created_at:'2026-09-07 12:00:00+00',revision:'0',next_sequence:0,access_revoked:false});return rows([]);}
   if(s.startsWith('SELECT access_revoked')&&s.includes('FROM private.coach_chat_threads')){
    let all=[...threads.values()];
    if(s.includes('WHERE actor_id=')&&s.includes('request_id='))all=all.filter(t=>t.actorId===p[0]&&t.request_id===p[1]);
    else if(s.includes('WHERE id='))all=all.filter(t=>t.id===p[0]&&samescope(t,p.slice(1)));
    else {expect(s).toContain("state IN ('active','cleanup_pending') AND access_revoked=false");all=all.filter(t=>samescope(t,p)&&(t.state==='active'||t.state==='cleanup_pending')&&!t.access_revoked).sort((a,b)=>b.id.localeCompare(a.id));if(s.includes('(created_at,id)<'))all=all.filter(t=>t.id<String(p[5]));all=all.slice(0,Number(p.at(-1)));}
    return rows(all.map(t=>({...t})));
   }
   if(s.startsWith('UPDATE private.coach_chat_threads')){
    const t=threads.get(String(p.at(-1)))!;if(!t)throw new Error('missing thread');
    if(s.includes('next_sequence=next_sequence+1')){t.next_sequence++;t.revision=String(Number(t.revision)+1);if(s.includes('title='))t.title=String(p[0]);return rows([{sequence:t.next_sequence}]);}
    if(s.includes("state='cleanup_pending'")){t.state='cleanup_pending';t.title='';t.revision=String(Number(t.revision)+1);}
    else if(s.includes("state='deleted'"))t.state='deleted';else {t.title=String(p[0]);t.revision=String(Number(t.revision)+1);}return rows([]);
   }
   if(s.startsWith('INSERT INTO public.agent_conversation')){const [id,owner,agent,session,role,content]=p as string[];contents.set(id,{owner,agent,session,role,content});return rows([]);}
   if(s.startsWith('INSERT INTO private.coach_chat_turns')){const [threadId,id,turn_id,request_id,role,sequence,revision,content_hash,pipeline_version,outcome]=p;turns.set(String(id),{threadId:String(threadId),id:String(id),turn_id:String(turn_id),request_id:String(request_id),role:String(role),sequence:Number(sequence),revision:String(revision),content_hash:String(content_hash),pipeline_version:pipeline_version as string|null,current:true,outcome:String(outcome) as TurnRow['outcome']});return rows([]);}
   if(s.startsWith('UPDATE private.coach_chat_turns')){
    if(s.includes("outcome='failed'")){const turn=[...turns.values()].find(t=>t.threadId===p[0]&&t.turn_id===p[1]&&t.role==='user');if(turn)turn.outcome='failed';return rows(turn?[{content_id:turn.id}]:[]);}
    if(s.includes("outcome='settled'")){const turn=[...turns.values()].find(t=>t.threadId===p[0]&&t.turn_id===p[1]&&t.role==='user');if(turn)turn.outcome='settled';return rows(turn?[{content_id:turn.id}]:[]);}
    turns.get(String(p[1]))!.current=false;return rows([]);
   }
   if(s.startsWith('DELETE FROM public.agent_conversation')){for(const t of turns.values())if(t.threadId===p[0]&&contents.get(t.id)?.owner===p[1])contents.delete(t.id);return rows([]);}
   if(s.includes('t LEFT JOIN public.agent_conversation')){
    expect(s).toContain('c.role=t.role');expect(p.slice(1,4)).toEqual([threads.get(String(p[0]))!.actorId,p[0],COACH_CHAT_NAMESPACE]);
    let all=[...turns.values()].filter(t=>t.threadId===p[0]);
    if(s.includes('t.request_id='))all=all.filter(t=>t.request_id===p[4]);
    else if(s.includes('t.content_id='))all=all.filter(t=>t.id===p[4]);
    else if(s.includes('t.turn_id='))all=all.filter(t=>t.turn_id===p[4]&&(!s.includes('t.role=')||t.role===(s.includes("t.role='user'")?'user':p[5])));
    if(s.includes('t.current=true'))all=all.filter(t=>t.current);
    if(s.includes("t.role='assistant'"))all=all.filter(t=>t.role==='assistant');
    if(s.includes('t.sequence>'))all=all.filter(t=>t.sequence>Number(p[4]));
    if(s.includes("t.pipeline_version='coach-assistant.v2'"))all=all.filter(t=>t.pipeline_version==='coach-assistant.v2');
    return rows(all.sort((a,b)=>a.sequence-b.sequence).slice(0,Number(p.at(-1))).map(t=>({...t,id:contents.has(t.id)?t.id:null,content:contents.get(t.id)?.content??null,created_at:'2026-09-07 12:00:00+00'})));
   }
   throw new Error('unhandled SQL '+s);
  }});}catch(error){threads.clear();turns.clear();contents.clear();for(const [k,v] of snapshots[0] as Map<string,ThreadRow>)threads.set(k,v);for(const [k,v] of snapshots[1] as Map<string,TurnRow>)turns.set(k,v);for(const [k,v] of snapshots[2] as typeof contents)contents.set(k,v);throw error;}
 }};
 return {database:database as unknown as typeof db,threads,turns,contents,valid,queries,setConnected:(v:boolean)=>{connected=v;},allow:(s:CoachChatScope)=>valid.add([s.actorId,s.subjectId,s.organizationId,s.actorRole].join(':')),revoke:(s:CoachChatScope)=>valid.delete([s.actorId,s.subjectId,s.organizationId,s.actorRole].join(':'))};
}
const signal=()=>new AbortController().signal;
function setup(){const b=backend(),s=scope();s.subjectId=s.actorId;b.allow(s);return {b,s,service:createCoachChatService(b.database)};}
async function create(x:ReturnType<typeof setup>,requestId=randomUUID(),title='Mi conversación'){
 const r=await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'create',requestId,title},signal());expect(r.ok).toBe(true);if(!r.ok||!('thread'in r.value))throw new Error('create failed');return {thread:r.value.thread,requestId};
}
const user=async(x:ReturnType<typeof setup>,threadId:string,turnId=randomUUID(),text='Cómo fue mi semana')=>{const requestId=randomUUID();const op={version:COACH_CHAT_VERSION,operation:'append_user',threadId,turnId,requestId,text};const r=await x.service.execute(x.s,op,signal());expect(r.ok).toBe(true);return {op,r};};
async function final(s:CoachChatScope,threadId:string,turnId:string,message:string){
 const empty=async()=>({rows:[],truncated:false});const repository:CoachRepository={...fixtureRepository(),authorize:async()=>({actorId:s.actorId,subjectId:s.subjectId,organizationId:s.organizationId,timezone:'UTC',language:'es'}),nutrition:empty,plan:empty,workouts:empty,exercise:empty,personalContext:empty};
 const r=await runVerifiedChatFinal({version:'coach-assistant.v2',conversationId:threadId,turnId,message},{actorId:s.actorId,repository,mode:'offline',now:new Date('2026-09-07T12:00:00Z'),signal:signal()},s);expect(r.final).not.toBeNull();return r.final!;
}
describe('durable coach chat service using injected SQL',()=>{
 it('creates idempotently, paginates stable thread keys and renames with CAS',async()=>{
  const x=setup(),a=await create(x),b=await create(x);const again=await create(x,a.requestId);expect(again.thread.id).toBe(a.thread.id);
  const list=await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'list',limit:1},signal());expect(list.ok).toBe(true);if(!list.ok||!('threads'in list.value))throw new Error();expect(list.value.threads).toHaveLength(1);expect(list.value.nextCursor).not.toBeNull();
  const next=await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'list',limit:1,before:list.value.nextCursor},signal());if(!next.ok||!('threads'in next.value))throw new Error();expect(new Set([list.value.threads[0].id,next.value.threads[0].id])).toEqual(new Set([a.thread.id,b.thread.id]));
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'rename',threadId:a.thread.id,title:'Nuevo título',expectedRevision:'0'},signal())).toMatchObject({ok:true,value:{thread:{title:'Nuevo título',revision:'1'}}});
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'rename',threadId:a.thread.id,title:'Stale',expectedRevision:'0'},signal())).toMatchObject({error:'version_conflict'});
 });
 it('isolates actors/tenants/roles/subjects and denies history after revocation or lineage ABA',async()=>{
  const x=setup(),a=await create(x);await user(x,a.thread.id);
  for(const other of [{...x.s,actorId:randomUUID()},{...x.s,organizationId:randomUUID()},{...x.s,actorRole:'coach' as const},{...x.s,subjectId:randomUUID()}]){x.b.allow(other);expect(await x.service.execute(other,{version:COACH_CHAT_VERSION,operation:'read',threadId:a.thread.id},signal())).toMatchObject({error:'not_found'});}
  x.b.revoke(x.s);expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'delete',threadId:a.thread.id,reviewed:true},signal())).toMatchObject({error:'forbidden'});expect(x.b.contents.size).toBe(1);
  x.b.allow(x.s);x.b.threads.get(a.thread.id)!.access_revoked=true;expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'read',threadId:a.thread.id},signal())).toMatchObject({error:'not_found'});
 });
 it('appends user/final idempotently and never trusts browser finality or mismatched user turn',async()=>{
  const x=setup(),a=await create(x),u=await user(x,a.thread.id);expect(await x.service.execute(x.s,u.op,signal())).toMatchObject({ok:true,value:{replayed:true}});
  expect(await x.service.execute(x.s,{...u.op,text:'changed'},signal())).toMatchObject({error:'idempotency_conflict'});
  expect(await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID()},{kind:'verified_coach_chat_final'} as VerifiedChatFinal,signal())).toMatchObject({error:'invalid_input'});
  const proof=await final(x.s,a.thread.id,u.op.turnId,u.op.text),requestId=randomUUID();const r=await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId},proof,signal());expect(r).toMatchObject({ok:true,value:{message:{role:'assistant'},replayed:false}});
  expect(await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId},proof,signal())).toMatchObject({ok:true,value:{replayed:true}});expect(x.b.contents.size).toBe(2);expect(await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID()},proof,signal())).toMatchObject({error:'idempotency_conflict'});
  const wrong=await final(x.s,a.thread.id,u.op.turnId,'Otra pregunta');expect(await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID()},wrong,signal())).toMatchObject({error:'idempotency_conflict'});
 });
 it('recovers an uncertain turn by exact IDs without another generation or write',async()=>{
  const x=setup(),a=await create(x,randomUUID(),'New conversation'),turnId=randomUUID();
  await user(x,a.thread.id,turnId,'  Cuánto me falta   de proteína hoy  ');
  expect(x.b.threads.get(a.thread.id)?.title).toBe('Cuánto me falta de proteína hoy');
  const sizes=()=>({contents:x.b.contents.size,turns:x.b.turns.size});
  const before=sizes();
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'recover',threadId:a.thread.id,turnId},signal())).toMatchObject({ok:true,value:{thread:{id:a.thread.id},turnId,status:'inflight',user:{turnId,role:'user'},assistant:null}});
  expect(sizes()).toEqual(before);
  await (x.service as unknown as {markFailed(scope:CoachChatScope,threadId:string,turnId:string,signal:AbortSignal):Promise<unknown>}).markFailed(x.s,a.thread.id,turnId,signal());
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'recover',threadId:a.thread.id,turnId},signal())).toMatchObject({ok:true,value:{turnId,status:'failed',assistant:null}});
  const secondTurn=randomUUID(),second=await user(x,a.thread.id,secondTurn,'¿Qué ves en esta foto?'),proof=await final(x.s,a.thread.id,secondTurn,second.op.text);
  await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID()},proof,signal());
  const settledSizes=sizes();
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'recover',threadId:a.thread.id,turnId:secondTurn},signal())).toMatchObject({ok:true,value:{turnId:secondTurn,status:'settled',user:{turnId:secondTurn,role:'user'},assistant:{turnId:secondTurn,role:'assistant'}}});
  expect(sizes()).toEqual(settledSizes);
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'recover',threadId:a.thread.id,turnId:randomUUID()},signal())).toMatchObject({error:'not_found'});
 });
 it('looks up exact final text for current session and invalidates regeneration/deletion/logout',async()=>{
  const x=setup(),a=await create(x),u=await user(x,a.thread.id),proof=await final(x.s,a.thread.id,u.op.turnId,u.op.text);const first=await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID()},proof,signal());if(!first.ok||!('message'in first.value))throw new Error();
  let epoch:string|null='session-1';const port=createDurableCoachSpeechTextPort(x.service,x.s,async()=>epoch),voiceScope={actorId:x.s.actorId,organizationId:x.s.organizationId,conversationId:a.thread.id};
  expect(await port.load(first.value.message.id,voiceScope,signal())).toMatchObject({kind:'final_answer',text:first.value.message.text,sessionEpoch:'session-1'});
  const second=await x.service.appendFinal(x.s,{threadId:a.thread.id,requestId:randomUUID(),expectedAssistantRevision:first.value.message.revision},await final(x.s,a.thread.id,u.op.turnId,u.op.text),signal());expect(second.ok).toBe(true);if(!second.ok||!('message'in second.value))throw new Error();
  expect(await port.load(first.value.message.id,voiceScope,signal())).toBeNull();expect(await port.load(second.value.message.id,voiceScope,signal())).not.toBeNull();epoch=null;expect(await port.load(second.value.message.id,voiceScope,signal())).toBeNull();
 epoch='session-2';expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'delete',threadId:a.thread.id,reviewed:true},signal())).toMatchObject({ok:true,value:{thread:{state:'cleanup_pending'},cleanup:'pending'}});expect(await port.load(second.value.message.id,voiceScope,signal())).toBeNull();expect(x.b.contents.size).toBe(0);
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'list',limit:20},signal())).toMatchObject({ok:true,value:{threads:[{id:a.thread.id,title:'',state:'cleanup_pending'}]}});
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'create',requestId:a.requestId,title:'Mi conversación'},signal())).toMatchObject({error:'not_found'});
 });
 it('requires cleanup confirmation before deleted and paginates message sequences',async()=>{
  const x=setup(),a=await create(x);await user(x,a.thread.id);await user(x,a.thread.id);
  const first=await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'read',threadId:a.thread.id,limit:1},signal());expect(first).toMatchObject({ok:true,value:{nextSequence:1}});
  const second=await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'read',threadId:a.thread.id,limit:1,afterSequence:1},signal());expect(second).toMatchObject({ok:true,value:{nextSequence:null,messages:[{sequence:2}]}});
  let complete=false;const service=createCoachChatService(x.b.database,{cleanup:async()=>({complete})}),op={version:COACH_CHAT_VERSION,operation:'delete',threadId:a.thread.id,reviewed:true};
  expect(await service.execute(x.s,op,signal())).toMatchObject({ok:true,value:{cleanup:'pending'}});complete=true;expect(await service.execute(x.s,op,signal())).toMatchObject({ok:true,value:{thread:{state:'deleted'},cleanup:'complete'}});
 });
 it('rejects an active transcript whose canonical content is missing instead of returning a false empty page',async()=>{
  const x=setup(),a=await create(x);await user(x,a.thread.id);x.b.contents.clear();expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'read',threadId:a.thread.id},signal())).toMatchObject({error:'uncertain'});
 });
 it('reports not_connected for unknown schema, never fabricates success or accepts arbitrary roles',async()=>{
  const x=setup();x.b.setConnected(false);expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'list'},signal())).toMatchObject({error:'not_connected'});expect(x.b.threads.size).toBe(0);
  expect(await x.service.execute(x.s,{version:COACH_CHAT_VERSION,operation:'append_user',threadId:randomUUID(),requestId:randomUUID(),turnId:randomUUID(),text:'x',role:'system',final:true},signal())).toMatchObject({error:'invalid_input'});
 });
});
