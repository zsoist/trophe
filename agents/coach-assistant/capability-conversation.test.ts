import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
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
 it.each([{tool:'food.quantity.apply',args:{}},{tool:'sql',args:{}},{tool:'coach.message.apply',args:{}},{tool:'coach.message.propose',args:{message:'Hi',coachId:id(99)}},{tool:'workout.set.propose',args:{reps:10,setId:id(99)}},{tool:'food.preference.read',args:{subjectId:id(9)}}])('rejects invented tool or identity args before service access',async choice=>{const f=setup(choice);const execute=vi.fn();const result=await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({preference:{parsePreference:()=>({version:1,dietPattern:null}),execute}})});expect(result.error?.code).toBe('invalid_output');expect(execute).not.toHaveBeenCalled();expect(f.provider).toHaveBeenCalledTimes(1);});
 it('reports none honestly when registry is empty and rejects an unavailable requested tool',async()=>{const f=setup({tool:'none'});const result=await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({})});expect(result).toMatchObject({ok:true,capabilityResult:{status:'not_connected',applied:false},telemetry:{modelCalls:2,dataReads:3}});const g=setup({tool:'food.preference.read',args:{}});expect((await runConversation(input,{...g.options,capabilityRegistry:createCoachCapabilityRegistry({})})).error?.code).toBe('invalid_output');});
 it('rejects a different meal ID',async()=>{const f=setup({tool:'food.quantity.read',args:{entryId:id(99)}});const execute=vi.fn();const service={parseQuantityChange:()=>({grams:150}),execute};expect((await runConversation(input,{...f.options,capabilityRegistry:createCoachCapabilityRegistry({food:service})})).error?.code).toBe('forbidden');expect(execute).not.toHaveBeenCalled();});
 it('inherits deadline and medical referral before model selection',async()=>{const f=setup({tool:'none'});const stalled:OfflineConversationProvider=()=>new Promise(()=>{});const timed=await runConversation(input,{...f.options,deadlineMs:5,offlineConversationProvider:stalled,capabilityRegistry:createCoachCapabilityRegistry({})});expect(timed.error?.code).toBe('deadline');const result=await runConversation({...input,message:'I have chest pain and cannot breathe'},{...f.options,capabilityRegistry:createCoachCapabilityRegistry({})});expect(result.output?.escalation.required).toBe(true);expect(f.provider).not.toHaveBeenCalled();});
 it('requires a selected meal for quantity even when Food service exists',async()=>{
  const f=setup({tool:'none'});const execute=vi.fn();const registry=createCoachCapabilityRegistry({food:{parseQuantityChange:()=>({grams:150}),execute}});
  const request={...input,context:{surface:'workout',includeScreen:true}};
  const result=await runConversation(request,{...f.options,capabilityRegistry:registry});
  expect(result.capabilityResult).toMatchObject({status:'not_connected',result:{reason:'select_food_entry_for_quantity'}});expect(execute).not.toHaveBeenCalled();
 });

 it.each([false,true])('keeps grounded records and selection with registry connected (exercise=%s)',async exercise=>{
  const repo=fixtureRepository({workouts:[],plans:[],...(exercise?{nutrition:[]}: {})});repo.exercise=async args=>({rows:[{id:args.exerciseId!,name:'Bench Press',instructions:['Use a stable position.'],curated:true}],truncated:false});
  const personal=vi.fn(async()=>({rows:[{userId:'synthetic-client',preferences:defaultWorkoutPreferences,memories:[{id:'memory',userId:'synthetic-client',text:'Prefer short sessions',source:'user_input' as const,scope:'user' as const,version:'1',createdAt:'2026-09-07T00:00:00Z'}]}],truncated:false}));repo.personalContext=personal;
  let calls=0;const provider:OfflineConversationProvider=async args=>{calls++;const payload=JSON.parse(args.prompt);if(calls===2){expect(payload.evidence.length).toBeGreaterThan(0);if(exercise)expect(payload.selection.kind).toBe('exercise');else{expect(payload.profile).not.toBeNull();expect(payload.memories).toHaveLength(1);}}return {output:calls===1?{tool:'none'}:{...output,answer:'Let us review the recorded facts.',evidenceRefs:payload.evidence.map((f:{id:string})=>f.id),facts:payload.evidence.map((f:{id:string})=>({kind:'record_fact',evidenceId:f.id}))},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};};
  const result=await runConversation({...input,message:exercise?'Explain this exercise':'Explain my week',context:exercise?{surface:'exercise',includeScreen:true,entity:{kind:'exercise',id:id(9)}}:{surface:'home',includeScreen:true}},{actorId:'synthetic-client',repository:repo,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({}),signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z')});
  expect(result.ok,JSON.stringify(result)).toBe(true);expect(result.evidence.length).toBeGreaterThan(0);expect(result.telemetry.modelCalls).toBe(2);expect(result.telemetry.dataReads).toBeLessThanOrEqual(4);expect(personal).toHaveBeenCalledTimes(exercise?0:1);
 });

 it('does not infer an active set when the server selection is missing',()=>{
  const execute=vi.fn();const registry=createCoachCapabilityRegistry({set:{parseRepsChange:()=>({reps:10}),execute}});
  expect(registry.available({version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'Correct my last set'})).not.toContain('workout.set.propose');expect(execute).not.toHaveBeenCalled();
 });

});
