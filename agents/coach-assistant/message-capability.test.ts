import {describe,expect,it,vi} from 'vitest';
import {runConversation} from './conversation';
import {createCoachCapabilityRegistry} from './capability-registry';
import {fixtureRepository} from './fixtures';
import type {OfflineConversationProvider} from './open-conversation';
import type {CoachMessageService} from './message-actions';

const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),coach=id(2),conversationId=id(3),turnId=id(4),proposalId=id(5);
describe('Ask Trophē human message proposal capability',()=>{
 it('resolves the recipient on the server and returns exact review content without sending',async()=>{
  const repository=fixtureRepository({nutrition:[],workouts:[],plans:[]});repository.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:id(6),timezone:'UTC',language:'es'});
  const execute=vi.fn<CoachMessageService['execute']>(async scope=>scope.operation.operation==='message.recipient'
   ?{ok:true,recipient:{coachId:coach,name:'Coach Fixture',version:'1'}}
   :scope.operation.operation==='message.propose'
    ?{ok:true,proposal:{id:proposalId,hash:'a'.repeat(64),action:'chat.message.send',recipient:{coachId:coach,name:'Coach Fixture',version:'1'},after:{message:scope.operation.after.message},expiresAt:'2026-09-08T12:05:00Z',reviewRequired:true}}
    :{ok:false,error:'invalid_input'});
  let calls=0;const provider:OfflineConversationProvider=vi.fn(async()=>{calls++;return {output:calls===1?{tool:'coach.message.propose',args:{message:'Hola, ¿podrías ayudarme a revisar mi plan?'}}:{answer:'Preparé un borrador para revisión.',evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],followUp:null,limitations:[],escalation:false,actionIntent:null},usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1};});
  const result=await runConversation({version:'coach-assistant.v2',conversationId,turnId,message:'Redacta un mensaje a mi coach',context:{surface:'messages',includeScreen:true}},{actorId:actor,repository,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({message:{execute}}),signal:new AbortController().signal,now:new Date('2026-09-08T12:00:00Z')});
  expect(result.ok,JSON.stringify(result.error)).toBe(true);expect(result.capabilityResult).toMatchObject({tool:'coach.message.propose',status:'review_required',applied:false,result:{proposal:{recipient:{coachId:coach,name:'Coach Fixture',version:'1'},after:{message:'Hola, ¿podrías ayudarme a revisar mi plan?'},reviewRequired:true}}});
  expect(result.receipts).toEqual([]);expect(result.telemetry).toMatchObject({modelCalls:2,dataReads:2,costUsd:0});expect(execute).toHaveBeenCalledTimes(2);
  expect(execute.mock.calls.map(([scope])=>scope.operation.operation)).toEqual(['message.recipient','message.propose']);
 });
 it.each([{tool:'coach.message.apply',args:{}},{tool:'coach.message.propose',args:{message:'Hi',coachId:id(9)}},{tool:'sql',args:{}}])('rejects model-selected execution or identity arguments before service access',async choice=>{
  const repository=fixtureRepository({nutrition:[],workouts:[],plans:[]});repository.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:id(6),timezone:'UTC',language:'es'});const execute=vi.fn();
  const provider:OfflineConversationProvider=async()=>({output:choice,usage:{inputTokens:100,outputTokens:50},rawStatus:200,latencyMs:1});
  const result=await runConversation({version:'coach-assistant.v2',conversationId,turnId,message:'Redacta un mensaje a mi coach'},{actorId:actor,repository,mode:'model',offlineCandidateEvaluation:true,offlineConversationProvider:provider,capabilityRegistry:createCoachCapabilityRegistry({message:{execute}}),signal:new AbortController().signal,now:new Date('2026-09-08T12:00:00Z')});
  expect(result.error?.code).toBe('invalid_output');expect(execute).not.toHaveBeenCalled();
 });
});
