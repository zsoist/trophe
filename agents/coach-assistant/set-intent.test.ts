import {describe,expect,it,vi} from 'vitest';
import type {CoachConversationRequest} from './contracts';
import {runConversation} from './conversation';
import {fixtureRepository} from './fixtures';
import type {OfflineConversationProvider} from './open-conversation';

const conversationId='a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId='aac3a82e-898c-4907-b9b9-75133bb6d27f';
const output={answer:'I can prepare that correction for review.',evidenceRefs:[] as string[],entityRefs:[] as string[],facts:[] as Array<{kind:'record_fact';evidenceId:string}>,followUp:null,limitations:[] as string[],escalation:false};
const request=(message:string,surface:'live'|'home'='live'):CoachConversationRequest=>({version:'coach-assistant.v2',conversationId,turnId,message,context:{surface,includeScreen:false}});
const provider=(actionIntent:unknown):OfflineConversationProvider=>vi.fn(async input=>({output:{...output,evidenceRefs:(JSON.parse(input.prompt) as {evidence:Array<{id:string}>}).evidence.map(item=>item.id),actionIntent},usage:{inputTokens:300,outputTokens:80,reasoningTokens:10},latencyMs:1,rawStatus:200}));
const run=(message:string,reps:number,workoutSetIntentsEnabled=true,surface:'live'|'home'='live')=>runConversation(request(message,surface),{actorId:'synthetic-client',repository:fixtureRepository({nutrition:[],workouts:[],plans:[]}),mode:'model',now:new Date('2026-09-08T12:00:00Z'),signal:new AbortController().signal,offlineConversationProvider:provider({action:'workout.set.reps.update',target:{reps}}),offlineInterpretationReview:async()=>({approved:true}),workoutSetIntentsEnabled});

describe('provider-selected last-set correction intent',()=>{
 it('binds the explicit Spanish repetitions to a server-resolved latest open set without proposing or mutating',async()=>{
  const result=await run('Registré mal la última serie: fueron 10 repeticiones',10);
  expect(result.ok).toBe(true);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
  expect(result.actionIntents).toEqual([{id:expect.stringMatching(/^[a-f0-9]{64}$/),action:'workout.set.reps.update',source:'provider_tool',subjectId:'synthetic-client',scopeKey:result.snapshot?.scopeKey,surface:'live',target:{selection:'latest_open_session_set',reps:10},reviewRequired:true}]);
 });
 it.each(['La última serie fueron 10 o 12 repeticiones','La última serie no fueron 10 repeticiones','La serie fueron diez repeticiones'])('does not expose a correction from ambiguous, negated or non-explicit repetitions: %s',async message=>{
  const result=await run(message,10);expect(result.ok).toBe(true);expect(result.actionIntents).toEqual([]);
 });
 it('rejects a provider number that differs from the explicit user value',async()=>{
  const result=await run('Registré mal la última serie: fueron 10 repeticiones',12);expect(result.error?.code).toBe('invalid_output');expect(result.actionIntents).toEqual([]);
 });
 it('does not advertise the intent while the server action capability is disabled',async()=>{
  const result=await run('Registré mal la última serie: fueron 10 repeticiones',10,false);expect(result.ok).toBe(true);expect(result.actionIntents).toEqual([]);
 });
 it('keeps the server-resolved correction available from the global coach home surface',async()=>{
  const result=await run('Registré mal la última serie: fueron 10 repeticiones',10,true,'home');expect(result.actionIntents).toEqual([expect.objectContaining({action:'workout.set.reps.update',surface:'home'})]);
 });
});
