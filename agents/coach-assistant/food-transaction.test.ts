import { runConversation } from './conversation';
import { createCoachCapabilityRegistry } from './capability-registry';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
import { describe,it,expect } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createFoodQuantityService } from './food-service';
import type { FoodQuantityOperation } from './food-contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),entry=id(2),org=id(3);
const base={version:'coach-assistant.v2' as const,conversationId:id(4),turnId:id(5),entryId:entry};
/** SQL statements execute against a transactional test double, NOT PostgreSQL. */
function fixture() {
  let row={id:entry,userId:actor,loggedDate:'2026-09-07',foodId:null,foodName:'Fixture rice',quantity:1,qtyG:'250',calories:500,proteinG:10,carbsG:100,fatG:5,fiberG:2,sugarG:1,source:'manual',parseConfidence:null};
  let revision=1;let receiptFails=false;
  let proposals:Record<string,Record<string,unknown>>={};let receipts:Record<string,Record<string,unknown>>={};
  const tx={
    select:()=>({from:()=>({where:()=>({limit:()=>({for:async()=>[structuredClone(row)]})})})}),
    update:()=>({set:(next:object)=>({where:()=>({returning:async()=>{row={...row,...next};revision++;return [structuredClone(row)];}})})}),
    execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{
      const {sql,params:p}=new PgDialect().sqlToQuery(query);
      if(sql.includes('FROM public.profiles actor'))return {rows:[{id:actor}]};
      if(sql.includes('FROM private.coach_action_receipts r'))return {rows:receipts[String(p[1])]?[receipts[String(p[1])]]:[]};
      if(sql.includes('SELECT revision::text'))return {rows:[{revision:String(revision)}]};
      if(sql.includes('SELECT count(*)::text'))return {rows:[{count:String(Object.keys(proposals).length)}]};
      if(sql.includes("interval '5 minutes'"))return {rows:[{expires:'2026-09-07T12:05:00Z'}]};
      if(sql.includes('INSERT INTO private.coach_action_proposals')) {proposals[String(p[0])]={envelope:JSON.parse(String(p[8])),expired:false,request_hash:p[6],resource_version:p[7],action:p[5]};return {rows:[]};}
      if(sql.includes('SELECT envelope,expires_at'))return {rows:proposals[String(p[0])]?[proposals[String(p[0])]]:[]};
      if(sql.includes('SELECT clock_timestamp()::text AS recorded'))return {rows:[{recorded:'2026-09-07T12:01:00Z'}]};
      if(sql.includes('INSERT INTO private.coach_action_receipts')) {
        if(receiptFails)throw new Error('injected receipt failure');
        receipts[String(p[5])]={subject_id:p[2],organization_id:p[3],conversation_id:p[4],proposal_id:p[6],request_hash:p[7],resource_version:p[8],result:JSON.parse(String(p[9])),action:'food.quantity.update',envelope:proposals[String(p[6])].envelope};
      }
      return {rows:[]};
    },
  };
  const database={transaction:async(work:(value:typeof tx)=>Promise<unknown>)=>{
    const previous=structuredClone({row,revision,proposals,receipts});
    try{return await work(tx);}catch(error){({row,revision,proposals,receipts}=previous);throw error;}
  }} as unknown as Parameters<typeof createFoodQuantityService>[0];
  const service=createFoodQuantityService(database);
  const execute=(operation:FoodQuantityOperation)=>service.execute({actorId:actor,subjectId:actor,organizationId:org,signal:new AbortController().signal,operation});
  return {service,execute,state:()=>({row,revision,receipts}),failReceipt:()=>{receiptFails=true;},manualEdit:()=>{row.foodName='Manually changed';revision++;}};
}
describe('concrete Food transaction service through an injected SQL transaction',()=>{
  it('prepares canonical 250→150 review, applies the shared writer and recovers the same receipt',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'food.propose',resourceVersion:'1',after:{grams:150}}) as {proposal:{id:string;hash:string}};
    expect(f.state().row.qtyG).toBe('250');
    const apply={...base,operation:'food.apply' as const,proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true as const};
    const first=await f.execute(apply);
    expect(first).toMatchObject({ok:true,receipt:{status:'applied',resourceVersion:'2'},refresh:{entryId:entry,strategy:'refetch'}});
    expect(f.state().row).toMatchObject({qtyG:'150',calories:300,proteinG:6});
    expect(await f.execute(apply)).toEqual(first);expect(f.state().revision).toBe(2);
  });
  it('rolls back the shared update when receipt insertion fails in the test transaction',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'food.propose',resourceVersion:'1',after:{grams:150}}) as {proposal:{id:string;hash:string}};
    f.failReceipt();
    expect(await f.execute({...base,operation:'food.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({ok:false,error:'uncertain'});
    expect(f.state()).toMatchObject({row:{qtyG:'250',calories:500},revision:1,receipts:{}});
  });
  it('rejects a proposal after an ordinary entry change',async()=>{
    const f=fixture();const proposed=await f.execute({...base,operation:'food.propose',resourceVersion:'1',after:{grams:150}}) as {proposal:{id:string;hash:string}};
    f.manualEdit();
    expect(await f.execute({...base,operation:'food.apply',proposalId:proposed.proposal.id,hash:proposed.proposal.hash,actionId:id(6),resourceVersion:'1',reviewed:true})).toMatchObject({error:'version_conflict'});
    expect(f.state().row.qtyG).toBe('250');
  });
 it('runs natural request through the open model, canonical food proposal and continuation without applying',async()=>{
  const f=fixture();const repo=fixtureRepository();repo.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:org,timezone:'UTC',language:'en'});
  let calls=0;const provider:OfflineConversationProvider=async input=>{calls++;if(calls===2)expect(JSON.parse(input.prompt).capabilityResult.status).toBe('review_required');return {output:calls===1?{tool:'food.quantity.propose',args:{entryId:entry,grams:150}}:{answer:'Please review the proposal before deciding.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:null,limitations:[],escalation:false},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};};
  const result=await runConversation({version:'coach-assistant.v2',conversationId:base.conversationId,turnId:base.turnId,message:'Please '+"change this rice portion to 150 grams",context:{surface:'food',includeScreen:true,entity:{kind:'meal',id:entry}}},{actorId:actor,repository:repo,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({food:f.service}),signal:new AbortController().signal,now:new Date('2026-09-07T12:00:00Z')});
  expect(result.ok).toBe(true);expect(result.capabilityResult).toMatchObject({status:'review_required',applied:false});expect(result.telemetry).toMatchObject({modelCalls:2,dataReads:2,tokensIn:200});expect(result.receipts).toEqual([]);expect(calls).toBe(2);expect(f.state().revision).toBe(1);
 });

});
