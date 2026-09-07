import { describe,it,expect,vi } from 'vitest';
import { runConversation } from './conversation';
import { createCoachCapabilityRegistry } from './capability-registry';
import { fixtureRepository } from './fixtures';
import type { OfflineConversationProvider } from './open-conversation';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'Adjust this portion',context:{surface:'food',includeScreen:true,entity:{kind:'meal',id:id(4)}}};
const output={answer:'This capability is not connected here.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:null,limitations:[],escalation:false};
function setup(choice:unknown){const repo=fixtureRepository();repo.plan=async()=>({rows:[],truncated:false});repo.workouts=async()=>({rows:[],truncated:false});repo.nutrition=async()=>({rows:[],truncated:false});repo.authorize=async()=>({actorId:id(1),subjectId:id(1),organizationId:id(5),timezone:'UTC',language:'en'});let calls=0;const provider:OfflineConversationProvider=vi.fn(async()=>({output:++calls===1?choice:output,usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1}));return {repo,provider,options:{actorId:id(1),repository:repo,mode:'model' as const,offlineCandidateEvaluation:true,offlineConversationProvider:provider,signal:new AbortController().signal,now:new Date('2026-09-07T12:00:00Z')}};}
describe('bounded capability selection',()=>{
 it.each([{tool:'food.quantity.apply',args:{}},{tool:'sql',args:{}},{tool:'food.preference.read',args:{subjectId:id(9)}}])('rejects invented tool or identity args before service access',async choice=>{const f=setup(choice);const execute=vi.fn();const result=await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({preference:{parsePreference:()=>({version:1,dietPattern:null}),execute}})});expect(result.error?.code).toBe('invalid_output');expect(execute).not.toHaveBeenCalled();expect(f.provider).toHaveBeenCalledTimes(1);});
 it('reports none honestly when registry is empty and rejects an unavailable requested tool',async()=>{const f=setup({tool:'none'});const result=await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({})});expect(result).toMatchObject({ok:true,capabilityResult:{status:'not_connected',applied:false},telemetry:{modelCalls:2,dataReads:0}});const g=setup({tool:'food.preference.read',args:{}});expect((await runConversation(input,{...g.options,capabilityRegistry:createCoachCapabilityRegistry({})})).error?.code).toBe('invalid_output');});
 it('rejects a different meal ID',async()=>{const f=setup({tool:'food.quantity.read',args:{entryId:id(99)}});const execute=vi.fn();const service={parseQuantityChange:()=>({grams:150}),execute};expect((await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({food:service})})).error?.code).toBe('forbidden');expect(execute).not.toHaveBeenCalled();});
 it('inherits deadline and medical referral before model selection',async()=>{const f=setup({tool:'none'});const stalled:OfflineConversationProvider=()=>new Promise(()=>{});const timed=await runConversation(input,{...f.options,deadlineMs:5,offlineConversationProvider:stalled,capabilityRegistry:createCoachCapabilityRegistry({})});expect(timed.error?.code).toBe('deadline');const result=await runConversation({...input,message:'I have chest pain and cannot breathe'},{...f.options,capabilityRegistry:createCoachCapabilityRegistry({})});expect(result.output?.escalation.required).toBe(true);expect(f.provider).not.toHaveBeenCalled();});
 it('requires a selected meal for quantity even when Food service exists',async()=>{
  const f=setup({tool:'none'});const execute=vi.fn();const registry=createCoachCapabilityRegistry({food:{parseQuantityChange:()=>({grams:150}),execute}});
  const request={...input,context:{surface:'workout',includeScreen:true}};
  const result=await runConversation(request,{...f.options,capabilityRegistry:registry});
  expect(result.capabilityResult).toMatchObject({status:'not_connected',result:{reason:'select_food_entry_for_quantity'}});expect(execute).not.toHaveBeenCalled();
 });

});
