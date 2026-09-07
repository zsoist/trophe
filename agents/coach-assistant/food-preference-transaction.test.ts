import { runConversation } from './conversation';
import { createCoachCapabilityRegistry } from './capability-registry';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createFoodPreferenceService } from './food-preference-service';
import type { FoodPreferenceOperation } from './food-preference-contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),entry=id(1),org=id(3);
const base={version:'coach-assistant.v2' as const,conversationId:id(4),turnId:id(5),profileId:entry};
/** SQL statements execute against a transactional test double, NOT PostgreSQL. */
function fixture() {
  let row={version:1 as const,dietPattern:null as 'vegetarian'|'vegan'|null};
  let revision=1;let receiptFails=false;let lostCommit=false;let authorized=true;let missing=false;

  let proposals:Record<string,Record<string,unknown>>={};let receipts:Record<string,Record<string,unknown>>={};
  const tx={
    execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{
      const {sql,params:p}=new PgDialect().sqlToQuery(query);
      if(sql.includes('SELECT cp.food_preferences')){if(missing)throw Object.assign(new Error('column absent'),{code:'42703'});return {rows:[{food_preferences:structuredClone(row)}]};}
      if(sql.includes('UPDATE public.client_profiles')){row=JSON.parse(String(p[0]));revision++;return {rows:[{food_preferences:structuredClone(row)}]};}
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
        receipts[String(p[5])]={subject_id:p[2],organization_id:p[3],conversation_id:p[4],proposal_id:p[6],request_hash:p[7],resource_version:p[8],result:JSON.parse(String(p[9])),action:'food.preference.update',envelope:proposals[String(p[6])].envelope};
      }
      return {rows:[]};
    },
  };
  const database={transaction:async(work:(value:typeof tx)=>Promise<unknown>)=>{
    const previous=structuredClone({row,revision,proposals,receipts});
    let output:unknown;try{output=await work(tx);}catch(error){({row,revision,proposals,receipts}=previous);throw error;}
    if(lostCommit){lostCommit=false;throw new Error("response lost after fixture commit");}return output;
  }} as unknown as Parameters<typeof createFoodPreferenceService>[0];
  const service=createFoodPreferenceService(database);
  const execute=(operation:FoodPreferenceOperation)=>service.execute({actorId:actor,subjectId:actor,organizationId:org,signal:new AbortController().signal,operation});
  return {service,execute,missing:()=>{missing=true;},revoke:()=>{authorized=false;},loseCommit:()=>{lostCommit=true;},state:()=>({row,revision,receipts}),failReceipt:()=>{receiptFails=true;},manualEdit:()=>{row.dietPattern='vegan';revision++;}};
}
describe('concrete Food profile preference transaction service through an injected SQL transaction',()=>{
  it('prepares canonical undeclared→vegetarian review, applies the shared writer and recovers the same receipt',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'diet.propose',resourceVersion:'1',after:{version:1 as const,dietPattern:'vegetarian'}}) as {proposal:{id:string;hash:string}};
    expect(f.state().row.dietPattern).toBe(null);
    const apply={...base,operation:'diet.apply' as const,proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    const first=await f.execute(apply);
    expect(first).toMatchObject({ok:true,receipt:{status:'applied',resourceVersion:'2'},refresh:{profileId:entry,strategy:'refetch'}});
    expect(f.state().row).toMatchObject({version:1,dietPattern:'vegetarian'});
    expect(await f.execute(apply)).toEqual(first);expect(f.state().revision).toBe(2);
  });
  it('rolls back the shared update when receipt insertion fails in the test transaction',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'diet.propose',resourceVersion:'1',after:{version:1 as const,dietPattern:'vegetarian'}}) as {proposal:{id:string;hash:string}};
    f.failReceipt();
    expect(await f.execute({...base,operation:'diet.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({ok:false,error:'uncertain'});
    expect(f.state()).toMatchObject({row:{dietPattern:null},revision:1,receipts:{}});
  });
  it('rejects a proposal after an ordinary set change',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'diet.propose',resourceVersion:'1',after:{version:1 as const,dietPattern:'vegetarian'}}) as {proposal:{id:string;hash:string}};
    f.manualEdit();
    expect(await f.execute({...base,operation:'diet.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({error:'version_conflict'});
    expect(f.state().row.dietPattern).toBe('vegan');
  });
  it('reports uncertain after a committed fixture response is lost and recovers the durable receipt',async()=>{
    const f=fixture();const p=await f.execute({...base,operation:'diet.propose',resourceVersion:'1',after:{version:1 as const,dietPattern:'vegetarian'}}) as {proposal:{id:string;hash:string}};
    const apply={...base,operation:'diet.apply' as const,proposalId:p.proposal.id,hash:p.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    f.loseCommit();expect(await f.execute(apply)).toMatchObject({error:'uncertain'});expect(f.state().row.dietPattern).toBe('vegetarian');
    const recovered=await f.execute({...base,operation:'diet.receipt',actionId:id(6)});expect(recovered).toMatchObject({ok:true,receipt:{status:'applied'}});
    expect(await f.execute(apply)).toEqual(recovered);expect(f.state().revision).toBe(2);
    expect(await f.execute({...apply,conversationId:id(99)})).toMatchObject({error:'idempotency_conflict'});
    f.revoke();expect(await f.execute(apply)).toMatchObject({error:'forbidden'});
  });

 it('reports missing storage as not connected and rejects foreign profile IDs',async()=>{
  const f=fixture();f.missing();expect(await f.execute({...base,operation:'diet.read'})).toMatchObject({error:'not_connected'});
  expect(await f.execute({...base,profileId:id(22),operation:'diet.read'})).toMatchObject({error:'forbidden'});
 });

 it.each(['food','workout'])('runs natural preference request from %s through the open model and canonical proposal',async surface=>{
  const f=fixture();const repo=fixtureRepository();repo.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:org,timezone:'UTC',language:'en'});
  let calls=0;const provider:OfflineConversationProvider=async input=>{calls++;if(calls===2)expect(JSON.parse(input.prompt).capabilityResult.status).toBe('review_required');return {output:calls===1?{tool:'food.preference.propose',args:{dietPattern:'vegetarian'}}:{answer:'Please review the proposal before deciding.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:null,limitations:[],escalation:false},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};};
  const result=await runConversation({version:'coach-assistant.v2',conversationId:base.conversationId,turnId:base.turnId,message:'Please '+"change my dietary preference to vegetarian",context:{surface,includeScreen:true,entity:{kind:'meal',id:entry}}},{actorId:actor,repository:repo,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({preference:f.service}),signal:new AbortController().signal,now:new Date('2026-09-07T12:00:00Z')});
  expect(result.ok).toBe(true);expect(result.capabilityResult).toMatchObject({status:'review_required',applied:false});expect(result.telemetry).toMatchObject({modelCalls:2,dataReads:2,tokensIn:200});expect(result.receipts).toEqual([]);expect(calls).toBe(2);expect(f.state().revision).toBe(1);
 });

});
