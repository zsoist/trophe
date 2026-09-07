import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createWorkoutSetService } from './set-service';
import type { WorkoutSetOperation } from './set-contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),entry=id(2),org=id(3);
const base={version:'coach-assistant.v2' as const,conversationId:id(4),turnId:id(5),setId:entry};
/** SQL statements execute against a transactional test double, NOT PostgreSQL. */
function fixture() {
  let row={id:entry,sessionId:id(7),exerciseId:id(8),setNumber:2,reps:8,weightKg:50,rpe:7,isWarmup:false,isPr:false,supersetGroup:null,notes:null,clientRequest:{reps:8},createdAt:'2026-09-07T12:00:00Z'};
  let completedAt:string|null=null;let revision=1;let receiptFails=false;let lostCommit=false;let authorized=true;let owned=true;let candidates:Array<{id:string;created_at:string|null}>=[{id:entry,created_at:row.createdAt}];
  let proposals:Record<string,Record<string,unknown>>={};let receipts:Record<string,Record<string,unknown>>={};
  const tx={
    select:()=>({from:()=>({where:()=>({limit:()=>({for:async()=>[structuredClone(row)]})})})}),
    update:()=>({set:(next:object)=>({where:()=>({returning:async()=>{row={...row,...next};revision++;return [structuredClone(row)];}})})}),
    execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{
      const {sql,params:p}=new PgDialect().sqlToQuery(query);
      if(sql.includes('SELECT s.id,s.completed_at FROM public.workout_sessions'))return {rows:owned?[{id:id(7),completed_at:completedAt}]:[]};
      if(sql.includes('SELECT id,created_at::text'))return {rows:candidates};
      if(sql.includes('FROM public.profiles actor'))return {rows:authorized?[{id:actor}]:[]};
      if(sql.includes('FROM private.coach_action_receipts r'))return {rows:receipts[String(p[1])]?[receipts[String(p[1])]]:[]};
      if(sql.includes('SELECT revision::text'))return {rows:[{revision:String(revision)}]};
      if(sql.includes('SELECT count(*)::text'))return {rows:[{count:String(Object.keys(proposals).length)}]};
      if(sql.includes("interval '5 minutes'"))return {rows:[{expires:'2026-09-07T12:05:00Z'}]};
      if(sql.includes('INSERT INTO private.coach_action_proposals')) {proposals[String(p[0])]={envelope:JSON.parse(String(p[8])),expired:false,request_hash:p[6],resource_version:p[7],action:p[5]};return {rows:[]};}
      if(sql.includes('SELECT envelope,expires_at'))return {rows:proposals[String(p[0])]?[proposals[String(p[0])]]:[]};
      if(sql.includes('SELECT clock_timestamp()::text AS recorded'))return {rows:[{recorded:'2026-09-07T12:01:00Z'}]};
      if(sql.includes('INSERT INTO private.coach_action_receipts')) {
        if(receiptFails)throw new Error('injected receipt failure');
        receipts[String(p[5])]={subject_id:p[2],organization_id:p[3],conversation_id:p[4],proposal_id:p[6],request_hash:p[7],resource_version:p[8],result:JSON.parse(String(p[9])),action:'workout.set.reps.update',envelope:proposals[String(p[6])].envelope};
      }
      return {rows:[]};
    },
  };
  const database={transaction:async(work:(value:typeof tx)=>Promise<unknown>)=>{
    const previous=structuredClone({row,revision,proposals,receipts});
    let output:unknown;try{output=await work(tx);}catch(error){({row,revision,proposals,receipts}=previous);throw error;}
    if(lostCommit){lostCommit=false;throw new Error("response lost after fixture commit");}return output;
  }} as unknown as Parameters<typeof createWorkoutSetService>[0];
  const service=createWorkoutSetService(database);
  const execute=(operation:WorkoutSetOperation)=>service.execute({actorId:actor,subjectId:actor,organizationId:org,signal:new AbortController().signal,operation});
  return {execute,finish:()=>{completedAt="2026-09-07T12:02:00Z";},revoke:()=>{authorized=false;},foreign:()=>{owned=false;},loseCommit:()=>{lostCommit=true;},candidates:(rows:typeof candidates)=>{candidates=rows;},state:()=>({row,revision,receipts}),failReceipt:()=>{receiptFails=true;},manualEdit:()=>{row.reps=12;revision++;}};
}
describe('concrete Workout transaction service through an injected SQL transaction',()=>{
  it('prepares canonical 8→10 review, applies the shared writer and recovers the same receipt',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    expect(f.state().row.reps).toBe(8);
    const apply={...base,operation:'set.apply' as const,proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    const first=await f.execute(apply);
    expect(first).toMatchObject({ok:true,receipt:{status:'applied',resourceVersion:'2'},refresh:{setId:entry,strategy:'refetch'}});
    expect(f.state().row).toMatchObject({reps:10,clientRequest:{reps:8}});
    expect(await f.execute(apply)).toEqual(first);expect(f.state().revision).toBe(2);
  });
  it('rolls back the shared update when receipt insertion fails in the test transaction',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    f.failReceipt();
    expect(await f.execute({...base,operation:'set.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({ok:false,error:'uncertain'});
    expect(f.state()).toMatchObject({row:{reps:8},revision:1,receipts:{}});
  });
  it('rejects a proposal after an ordinary set change',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    f.manualEdit();
    expect(await f.execute({...base,operation:'set.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({error:'version_conflict'});
    expect(f.state().row.reps).toBe(12);
  });
  it('reports uncertain after a committed fixture response is lost and recovers the durable receipt',async()=>{
    const f=fixture();const p=await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    const apply={...base,operation:'set.apply' as const,proposalId:p.proposal.id,hash:p.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    f.loseCommit();expect(await f.execute(apply)).toMatchObject({error:'uncertain'});expect(f.state().row.reps).toBe(10);
    const recovered=await f.execute({...base,operation:'set.receipt',actionId:id(6)});expect(recovered).toMatchObject({ok:true,receipt:{status:'applied'}});
    expect(await f.execute(apply)).toEqual(recovered);expect(f.state().revision).toBe(2);
    expect(await f.execute({...apply,conversationId:id(99)})).toMatchObject({error:'idempotency_conflict'});
    f.revoke();expect(await f.execute(apply)).toMatchObject({error:'forbidden'});
  });
  it('rejects foreign ownership, unreviewed apply and ambiguous last-set hints',async()=>{
    const f=fixture();const resolveBase={version:base.version,conversationId:base.conversationId,turnId:base.turnId};
    const resolve={...resolveBase,operation:'set.resolve' as const,sessionId:id(7),exerciseId:id(8)};
    expect(await f.execute(resolve)).toMatchObject({ok:true,snapshot:{setId:entry}});
    f.candidates([{id:entry,created_at:null}]);expect(await f.execute(resolve)).toMatchObject({error:'ambiguous_selection'});
    f.candidates([{id:entry,created_at:'same'},{id:id(9),created_at:'same'}]);expect(await f.execute(resolve)).toMatchObject({error:'ambiguous_selection'});
    f.foreign();expect(await f.execute({...base,operation:'set.read'})).toMatchObject({error:'not_found'});
    expect(await f.execute({...base,operation:'set.apply',proposalId:id(10),hash:'0'.repeat(64),actionId:id(11),resourceVersion:'1',reviewed:false} as unknown as WorkoutSetOperation)).toMatchObject({error:'invalid_input'});
  });

  it('rejects completed sessions before proposal or write but still recovers an earlier receipt',async()=>{
    const f=fixture();const p=await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    const apply={...base,operation:'set.apply' as const,proposalId:p.proposal.id,hash:p.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    f.finish();
    expect(await f.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}})).toMatchObject({error:'session_completed'});
    expect(await f.execute(apply)).toMatchObject({error:'session_completed'});
    expect(f.state()).toMatchObject({row:{reps:8},revision:1,receipts:{}});
    const g=fixture();const q=await g.execute({...base,operation:'set.propose',resourceVersion:'1',after:{reps:10}}) as {proposal:{id:string;hash:string}};
    const applied=await g.execute({...apply,proposalId:q.proposal.id,hash:q.proposal.hash});g.finish();
    expect(await g.execute({...base,operation:'set.receipt',actionId:id(6)})).toEqual(applied);
  });

});
