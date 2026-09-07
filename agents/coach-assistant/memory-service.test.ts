import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createPersistentMemoryService } from './memory-service';
import { persistentMemoryOperationSchema,type PersistentMemoryOperation } from './memory-contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),org=id(2),conversationId=id(3);
const base={version:'coach-assistant.v2' as const,conversationId,turnId:id(4)};
/** Transaction double exercises concrete SQL service. Does not prove PostgreSQL/RLS. */
function fixture(){
 let memories:Record<string,Record<string,unknown>>={},bindings:Record<string,Record<string,unknown>>={},proposals:Record<string,Record<string,unknown>>={},receipts:Record<string,Record<string,unknown>>={};let revoked=false,failAudit=false;let loseResult:(()=>void)|undefined;
 const tx={execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{
  const {sql,params:p}=new PgDialect().sqlToQuery(query);
  if(sql.includes('FROM public.profiles actor'))return {rows:revoked?[]:[{id:actor}]};
  if(sql.includes('FROM public.memory_chunks m JOIN'))return {rows:Object.values(memories).filter(m=>{const b=bindings[String(m.id)];return b&&b.actor===p[0]&&b.subject===p[1]&&b.org===p[2]&&b.conversation===p[3]&&(p.length>4?m.id===p[4]:m.active);}).map(m=>({...m,revision:String(bindings[String(m.id)].revision),confirmed_text_hash:bindings[String(m.id)].hash}))};
  if(sql.includes('FROM private.coach_action_receipts r'))return {rows:receipts[String(p[1])]?[receipts[String(p[1])]]:[]};
  if(sql.includes('SELECT count(*)::text'))return {rows:[{count:String(Object.keys(proposals).length)}]};
  if(sql.includes("interval '5 minutes'"))return {rows:[{expires:'2026-09-07T12:05:00Z'}]};
  if(sql.includes('INSERT INTO private.coach_action_proposals')){proposals[String(p[0])]={envelope:JSON.parse(String(p[8])),expired:false,request_hash:p[6],resource_version:p[7],actor:p[1],subject:p[2],org:p[3],conversation:p[4]};return {rows:[]};}
  if(sql.includes('SELECT envelope,expires_at')){const r=proposals[String(p[0])];return {rows:r&&r.actor===p[1]&&r.subject===p[2]&&r.org===p[3]&&r.conversation===p[4]?[r]:[]};}
  if(sql.includes('INSERT INTO public.memory_chunks'))memories[String(p[0])]={id:p[0],fact_text:p[3],active:true,source:'user_input',fact_type:'preference',scope:'agent',agent_name:'coach-assistant-confirmed',session_id:p[2],superseded_by:null,expired:false};
  if(sql.includes('INSERT INTO private.coach_memory_bindings'))bindings[String(p[0])]={actor:p[1],subject:p[2],org:p[3],conversation:p[4],revision:0,hash:p[5]};
  if(sql.includes('UPDATE public.memory_chunks SET fact_text')){memories[String(p[1])].fact_text=p[0];bindings[String(p[1])].revision=Number(bindings[String(p[1])].revision)+1;}
  if(sql.includes('UPDATE public.memory_chunks SET active=false')){memories[String(p[0])].active=false;bindings[String(p[0])].revision=Number(bindings[String(p[0])].revision)+1;}
  if(sql.includes('UPDATE private.coach_memory_bindings SET confirmed_text_hash'))bindings[String(p[1])].hash=p[0];
  if(sql.includes('SELECT clock_timestamp()::text AS recorded'))return {rows:[{recorded:'2026-09-07T12:01:00Z'}]};
  if(sql.includes('INSERT INTO private.coach_action_receipts'))receipts[String(p[5])]={subject_id:p[2],organization_id:p[3],conversation_id:p[4],proposal_id:p[6],request_hash:p[7],resource_version:p[8],result:JSON.parse(String(p[9])),envelope:proposals[String(p[6])].envelope};
  if(sql.includes('INSERT INTO public.audit_log')&&failAudit)throw new Error('injected audit failure');
  return {rows:[]};
 }};
 const database={transaction:async(work:(value:typeof tx)=>Promise<unknown>)=>{const prior=structuredClone({memories,bindings,proposals,receipts});let result:unknown;try{result=await work(tx);}catch(e){({memories,bindings,proposals,receipts}=prior);throw e;}if(loseResult){const lose=loseResult;loseResult=undefined;lose();throw new Error('commit result lost');}return result;}} as unknown as Parameters<typeof createPersistentMemoryService>[0];
 const service=createPersistentMemoryService(database);
 const execute=(operation:PersistentMemoryOperation,organizationId=org,signal=new AbortController().signal)=>service.execute({actorId:actor,subjectId:actor,organizationId,operation,signal});
 const propose=async(text='Prefiero comidas vegetarianas')=>{const r=await execute({...base,operation:'memory.propose',action:'memory.confirm',after:{text,source:'user_input',retention:'persistent'}});if(!r.ok||!('proposal' in r))throw new Error('proposal');return r.proposal;};
 return {execute,propose,loseCommit:(callback:()=>void)=>{loseResult=callback;},state:()=>({memories,bindings,receipts}),revoke:()=>{revoked=true;},failAudit:()=>{failAudit=true;},manualChange:(memoryId:string)=>{memories[memoryId].fact_text='Changed elsewhere';bindings[memoryId].revision=Number(bindings[memoryId].revision)+1;}};
}
describe('persistent reviewed memory service',()=>{
 it('confirms only after review, corrects and deletes canonical memory with stable receipts',async()=>{
  const f=fixture();const p=await f.propose();expect(Object.keys(f.state().memories)).toHaveLength(0);
  const apply={...base,operation:'memory.apply' as const,proposalId:p.id,hash:p.hash,resourceVersion:'0',actionId:id(5),reviewed:true as const};
  const first=await f.execute(apply);expect(first).toMatchObject({ok:true,receipt:{status:'applied'}});expect(await f.execute(apply)).toEqual(first);
  expect(await f.execute({...base,operation:'memory.read'})).toMatchObject({memories:[{text:p.after!.text,confirmation:'confirmed'}],derivedContext:'excluded'});
  const correction=await f.execute({...base,operation:'memory.correct',memoryId:p.resource.id,resourceVersion:'0',after:{text:'Prefiero comidas veganas',source:'user_input',retention:'persistent'}});if(!correction.ok||!('proposal' in correction))throw new Error('proposal');
  expect(await f.execute({...apply,proposalId:correction.proposal.id,hash:correction.proposal.hash,actionId:id(6)})).toMatchObject({refresh:{discardDerivedContext:true,invalidatedMemoryVersions:[{id:p.resource.id,version:'0'}]}});
  const deletion=await f.execute({...base,operation:'memory.delete',memoryId:p.resource.id,resourceVersion:'1'});if(!deletion.ok||!('proposal' in deletion))throw new Error('proposal');
  expect(await f.execute({...apply,proposalId:deletion.proposal.id,hash:deletion.proposal.hash,resourceVersion:'1',actionId:id(7)})).toMatchObject({ok:true});
  expect(await f.execute({...base,operation:'memory.read'})).toMatchObject({memories:[]});expect(JSON.stringify(Object.values(f.state().receipts).map(row=>row.result))).not.toContain('Prefiero');
 });
 it('isolates same-user org/thread reads and proposal use, and reauthorizes receipt recovery',async()=>{
  const f=fixture();const p=await f.propose();const apply={...base,operation:'memory.apply' as const,proposalId:p.id,hash:p.hash,resourceVersion:'0',actionId:id(5),reviewed:true as const};
  expect(await f.execute({...apply,conversationId:id(8)})).toMatchObject({ok:false,error:'not_found'});await f.execute(apply);
  expect(await f.execute({...base,operation:'memory.read'},id(9))).toMatchObject({memories:[]});expect(await f.execute({...base,conversationId:id(8),operation:'memory.read'})).toMatchObject({memories:[]});
  f.revoke();expect(await f.execute(apply)).toMatchObject({error:'forbidden'});
 });
 it('rolls back confirmation and receipt on audit failure',async()=>{
  const f=fixture();const p=await f.propose();f.failAudit();expect(await f.execute({...base,operation:'memory.apply',proposalId:p.id,hash:p.hash,resourceVersion:'0',actionId:id(5),reviewed:true})).toMatchObject({error:'uncertain'});expect(f.state()).toEqual({memories:{},bindings:{},receipts:{}});
 });
 it('excludes changed unconfirmed content and rejects stale deletion',async()=>{
  const f=fixture();const p=await f.propose();await f.execute({...base,operation:'memory.apply',proposalId:p.id,hash:p.hash,resourceVersion:'0',actionId:id(5),reviewed:true});f.manualChange(p.resource.id);
  expect(await f.execute({...base,operation:'memory.read'})).toMatchObject({memories:[]});expect(await f.execute({...base,operation:'memory.delete',memoryId:p.resource.id,resourceVersion:'0'})).toMatchObject({error:'version_conflict'});
 });
 it('reports lost commit plus cancellation as uncertain and recovers the committed receipt',async()=>{
  const f=fixture();const p=await f.propose();const controller=new AbortController();
  const apply={...base,operation:'memory.apply' as const,proposalId:p.id,hash:p.hash,resourceVersion:'0',actionId:id(5),reviewed:true as const};
  f.loseCommit(()=>controller.abort());expect(await f.execute(apply,org,controller.signal)).toMatchObject({error:'uncertain'});
  expect(Object.keys(f.state().memories)).toHaveLength(1);
  expect(await f.execute({...base,operation:'memory.receipt',actionId:id(5)})).toMatchObject({ok:true,receipt:{status:'applied'}});
  expect(await f.execute(apply,org,controller.signal)).toMatchObject({error:'cancelled'});
 });
 it('rejects temporary, inferred or unreviewed operation envelopes',()=>{
  for(const after of [{text:'Today only',source:'user_input',retention:'temporary'},{text:'Inferred',source:'agent_inference',retention:'persistent'}])expect(persistentMemoryOperationSchema.safeParse({...base,operation:'memory.propose',action:'memory.confirm',after}).success).toBe(false);
  expect(persistentMemoryOperationSchema.safeParse({...base,operation:'memory.apply',proposalId:id(7),hash:'a'.repeat(64),actionId:id(5),resourceVersion:'0',reviewed:false}).success).toBe(false);
 });
});
