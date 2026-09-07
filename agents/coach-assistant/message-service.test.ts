import { runConversation } from './conversation';
import { createCoachCapabilityRegistry } from './capability-registry';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
import { describe,it,expect,vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createCoachMessageService } from './message-service';
import type { CoachMessageOperation } from './message-actions';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),coach=id(2),org=id(3);const base={version:'coach-assistant.v2' as const,conversationId:id(4),turnId:id(5)};
function fixture(){
 let revision='1';let allowed=true;let coachId=coach;let lost=false;let receiptFails=false;
 let proposals:Record<string,unknown>={};let messages:Record<string,unknown>={};let receipts:Record<string,unknown>={};
 const rate=vi.fn(async()=>({allowed:true,retryAfter:0}));
 const tx={execute:async(q:Parameters<PgDialect['sqlToQuery']>[0])=>{const {sql,params:p}=new PgDialect().sqlToQuery(q);
  if(sql.includes('SELECT cp.coach_id'))return {rows:allowed?[{coach_id:coachId,full_name:'Test Coach',revision}]:[]};
  if(sql.includes('FROM private.coach_action_receipts r'))return {rows:receipts[String(p[1])]?[receipts[String(p[1])]]:[]};
  if(sql.includes('count(*)'))return {rows:[{count:'0'}]};
  if(sql.includes("interval '5 minutes'"))return {rows:[{expires:'2026-09-08T00:05:00Z'}]};
  if(sql.includes('INSERT INTO private.coach_action_proposals')){proposals[String(p[0])]=JSON.parse(String(p[7]));return {rows:[]};}
  if(sql.includes('SELECT envelope,'))return {rows:proposals[String(p[0])]?[{envelope:proposals[String(p[0])],expired:false}]:[]};
  if(sql.includes('SELECT id FROM private.coach_action_receipts'))return {rows:Object.values(receipts).filter(row=>(row as {proposal_id:string}).proposal_id===p[1]).slice(0,1)};
  if(sql.includes('SELECT id FROM public.messages'))return {rows:messages[String(p[0])]?[{id:p[0]}]:[]};
  if(sql.includes('INSERT INTO public.messages')){messages[String(p[0])]={id:p[0],body:p[1],coachId:p[3]};return {rows:[{id:p[0]}]};}
  if(sql.includes('AS expired'))return {rows:[{expired:false}]};
  if(sql.includes('AS recorded'))return {rows:[{recorded:'2026-09-08T00:01:00Z'}]};
  if(sql.includes('INSERT INTO private.coach_action_receipts')){if(receiptFails)throw new Error('receipt fail');receipts[String(p[5])]={subject_id:p[2],organization_id:p[3],conversation_id:p[4],proposal_id:p[6],request_hash:p[7],resource_version:p[8],result:JSON.parse(String(p[9])),action:'chat.message.send'};}
  return {rows:[]};
 }};
 const database={transaction:async(fn:(connection:typeof tx)=>Promise<unknown>)=>{const before=structuredClone({proposals,messages,receipts});let result;try{result=await fn(tx);}catch(error){({proposals,messages,receipts}=before);throw error;}if(lost){lost=false;throw new Error('response lost after fixture commit');}return result;}} as unknown as Parameters<typeof createCoachMessageService>[0];
 const service=createCoachMessageService(database,rate);
 const execute=(operation:CoachMessageOperation)=>service.execute({actorId:actor,subjectId:actor,organizationId:org,operation,signal:new AbortController().signal});
 return {service,execute,rate,deleteMessage:(messageId:string)=>{delete messages[messageId];},state:()=>({messages,receipts}),lose:()=>{lost=true;},fail:()=>{receiptFails=true;},revoke:()=>{allowed=false;},aba:()=>{revision='3';coachId=coach;}};
}
async function proposal(f:ReturnType<typeof fixture>){const recipient=await f.execute({...base,operation:'message.recipient'});if(!recipient.ok||!('recipient'in recipient))throw Error('recipient');const result=await f.execute({...base,operation:'message.propose',coachId:coach,resourceVersion:recipient.recipient.version,after:{message:'  Exact reviewed text  '}});if(!result.ok||!('proposal'in result))throw Error('proposal');return {...base,operation:'message.apply' as const,coachId:coach,proposalId:result.proposal.id,hash:result.proposal.hash,resourceVersion:recipient.recipient.version,actionId:id(6),reviewed:true as const};}
describe('human message SQL transaction double (no real sends)',()=>{
 it('stores exact reviewed text once; recovers lost response without a second rate charge or insert',async()=>{const f=fixture();const apply=await proposal(f);expect(f.state().messages).toEqual({});f.lose();expect(await f.execute(apply)).toMatchObject({error:'uncertain'});const receipt=await f.execute({...base,operation:'message.receipt',coachId:coach,actionId:id(6)});expect(receipt).toMatchObject({ok:true,receipt:{status:'stored'}});expect(await f.execute(apply)).toEqual(receipt);expect(Object.values(f.state().messages)).toEqual([{id:apply.proposalId,body:'Exact reviewed text',coachId:coach}]);expect(f.rate).toHaveBeenCalledExactlyOnceWith(`client-message:${actor}`,30,900);expect(await f.execute({...apply,actionId:id(7)})).toMatchObject({error:'idempotency_conflict'});expect(f.rate).toHaveBeenCalledTimes(1);});
 it('rolls back message and receipt together on precommit failure, without claiming delivery',async()=>{const f=fixture();const apply=await proposal(f);f.fail();expect(await f.execute(apply)).toMatchObject({error:'uncertain'});expect(f.state()).toEqual({messages:{},receipts:{}});});
 it('rejects assignment ABA, revocation, unreviewed apply and rate denial before storing',async()=>{const f=fixture();const apply=await proposal(f);f.aba();expect(await f.execute(apply)).toMatchObject({error:'version_conflict'});expect(f.rate).not.toHaveBeenCalled();f.revoke();expect(await f.execute(apply)).toMatchObject({error:'forbidden'});const g=fixture();const second=await proposal(g);expect(await g.execute({...second,reviewed:false} as unknown as CoachMessageOperation)).toMatchObject({error:'invalid_input'});g.rate.mockResolvedValue({allowed:false,retryAfter:60});expect(await g.execute(second)).toMatchObject({error:'rate_limited'});expect(g.state().messages).toEqual({});});
 it('retains durable proposal consumption after the canonical message is deleted',async()=>{
  const f=fixture();const apply=await proposal(f);const first=await f.execute(apply);expect(first).toMatchObject({ok:true});
  f.deleteMessage(apply.proposalId);
  expect(await f.execute({...apply,actionId:id(88)})).toMatchObject({error:'idempotency_conflict'});
  expect(await f.execute(apply)).toEqual(first);
  expect(await f.execute({...base,operation:'message.receipt',coachId:coach,actionId:apply.actionId})).toEqual(first);
  expect(f.state().messages).toEqual({});expect(f.rate).toHaveBeenCalledTimes(1);
 });

 it('uses injected open-model intent and the concrete message service to prepare review only',async()=>{
  const f=fixture();const repo=fixtureRepository();repo.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:org,timezone:'UTC',language:'en'});
  let calls=0;const provider:OfflineConversationProvider=async input=>{calls++;if(calls===2)expect(JSON.parse(input.prompt).capabilityResult.status).toBe('review_required');return {output:calls===1?{tool:'coach.message.propose',args:{message:'Please help review my plan.'}}:{answer:'Please review the proposal before deciding.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:null,limitations:[],escalation:false},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};};
  const result=await runConversation({...base,message:'Draft a message asking my coach to review my plan',context:{surface:'progress',includeScreen:true}},{actorId:actor,repository:repo,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({message:f.service}),signal:new AbortController().signal,now:new Date('2026-09-07T12:00:00Z')});
  expect(result.ok,JSON.stringify(result.error)).toBe(true);expect(result.capabilityResult).toMatchObject({status:'review_required',applied:false});expect(result.telemetry).toMatchObject({modelCalls:2,dataReads:2});expect(result.receipts).toEqual([]);expect(f.state().receipts).toEqual({});expect(f.state().messages).toEqual({});expect(f.rate).not.toHaveBeenCalled();
 });

});
