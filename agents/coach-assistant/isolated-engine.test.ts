import { afterEach,describe,it,expect,vi } from 'vitest';
import { createIsolatedCoachEngineBinding,verifyIsolatedCoachEngineExecution } from './isolated-engine';
import { readVerifiedChatFinal,runVerifiedChatFinalWithIsolatedEngine,type VerifiedChatFinal } from './chat-final';
import { createIsolatedEngineBoundary } from './isolated-engine-boundary';
import { runConversationCandidate } from './conversation-candidate';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const config=()=>({CI:'true',GITHUB_ACTIONS:'true',CI_REAL_SUPABASE:'1',COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id(1),COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED:'1',COACH_ASSISTANT_DATA_SOURCE:'authorized_records',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:54322/postgres',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321',VERCEL_ENV:'preview'});
const input={version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'How should I review food records this week?'};
function repository(){const repo=fixtureRepository();repo.dataSource='authorized_records';repo.authorize=async()=>({actorId:id(1),subjectId:id(1),organizationId:id(4),timezone:'UTC',language:'en'});repo.plan=async()=>({rows:[],truncated:false});repo.workouts=async()=>({rows:[],truncated:false});repo.nutrition=async()=>({rows:[{id:id(5),userId:id(1),date:'2026-09-06',calories:500,proteinG:30}],truncated:false});repo.personalContext=async()=>({rows:[{userId:id(1),preferences:defaultWorkoutPreferences,memories:[]}],truncated:false});return repo;}
const options=()=>({mode:'model' as const,actorId:id(1),repository:repository(),now:new Date('2026-09-07T03:30:00Z'),signal:new AbortController().signal});
afterEach(()=>vi.unstubAllGlobals());
describe('disposable CI authorized-records engine composition',()=>{
 it('mints a chat-final proof from the exact isolated-engine run',async()=>{
  const env=config(),engine=createIsolatedCoachEngineBinding(env);
  const scope={actorId:id(1),subjectId:id(1),organizationId:id(4),actorRole:'client' as const};
  const result=await runVerifiedChatFinalWithIsolatedEngine(input,options(),scope,engine);
  expect(result.response.ok).toBe(true);expect(result.final).not.toBeNull();
  expect(readVerifiedChatFinal(result.final!)).toMatchObject({scope,threadId:id(2),turnId:id(3),pipelineVersion:'coach-assistant.v2'});
 });
 it('does not invoke a forged engine and cannot attest copied or mismatched output',async()=>{
  const forged={kind:'isolated_coach_engine_binding' as const,run:vi.fn()};
  const scope={actorId:id(1),subjectId:id(1),organizationId:id(4),actorRole:'client' as const};
  await expect(runVerifiedChatFinalWithIsolatedEngine(input,options(),scope,forged as unknown as ReturnType<typeof createIsolatedCoachEngineBinding>)).rejects.toThrow('forbidden');expect(forged.run).not.toHaveBeenCalled();
  const engine=createIsolatedCoachEngineBinding(config()),response=await engine.run(input,options());
  const copied=structuredClone(response),substitute=Object.freeze({kind:'isolated_coach_engine_binding',run:vi.fn(async()=>copied)});
  expect(verifyIsolatedCoachEngineExecution(engine,input,id(1),response)).toBe(true);
  expect(verifyIsolatedCoachEngineExecution(engine,input,id(1),copied)).toBe(false);
  expect(verifyIsolatedCoachEngineExecution(engine,{...input,message:'substitute'},id(1),response)).toBe(false);
  expect(verifyIsolatedCoachEngineExecution(engine,input,id(99),response)).toBe(false);
  const otherEngine=createIsolatedCoachEngineBinding(config());
  expect(verifyIsolatedCoachEngineExecution(otherEngine,input,id(1),response)).toBe(false);
  await expect(runVerifiedChatFinalWithIsolatedEngine(input,options(),scope,substitute as unknown as ReturnType<typeof createIsolatedCoachEngineBinding>)).rejects.toThrow('forbidden');expect(substitute.run).not.toHaveBeenCalled();
  expect(readVerifiedChatFinal({kind:'verified_coach_chat_final'} as VerifiedChatFinal)).toBeNull();
 });
 it('creates the isolated binding lazily only after request authentication and flag checks',async()=>{
  const env=config();
  const factory=vi.fn(()=>createIsolatedCoachEngineBinding(env));
  const deps={env,createIsolatedEngine:factory,guard:async()=>({userId:id(1)}),createRepository:repository,now:()=>options().now};
  const request=()=>new Request('http://127.0.0.1:3000/api/coach-assistant',{method:'POST',body:JSON.stringify(input)});
  expect((await handleCoachRequest(request(),{...deps,guard:async()=>new Response('',{status:401})})).status).toBe(401);
  expect(factory).not.toHaveBeenCalled();
  expect((await handleCoachRequest(request(),{...deps,env:{...env,COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED:'0'}})).status).toBe(200);
  expect(factory).not.toHaveBeenCalled();
  const result=await (await handleCoachRequest(request(),deps)).json();
  expect(result.ok).toBe(true);
  expect(result.evaluation.transport).toBe('injected_fixture');
  expect(factory).toHaveBeenCalledTimes(1);
 });
 it('executes actual handler/engine with authorized facts, explicit fixture metadata and no network',async()=>{
  const fetch=vi.fn(()=>{throw new Error('network forbidden');});vi.stubGlobal('fetch',fetch);
  const env=config();const engine=createIsolatedCoachEngineBinding(env);const deps={env,isolatedEngine:engine,guard:async()=>({userId:id(1)}),createRepository:repository,now:()=>options().now};
  const request=(body:unknown)=>new Request('http://127.0.0.1:3000/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
  const body=await (await handleCoachRequest(request(input),deps)).json();expect(body.ok).toBe(true);expect(body.dataSource).toBe('authorized_records');expect(body.evaluation).toMatchObject({transport:'injected_fixture',records:'authorized_records',semanticQualityVerified:false});expect(body.output.answer).toContain('500');expect(body.output.answer).toContain('Isolated transport fixture');expect(body.snapshot.subjectId).toBe(id(1));expect(body.proposals).toEqual([]);expect(body.receipts).toEqual([]);expect(fetch).not.toHaveBeenCalled();
  expect((await handleCoachRequest(request({...input,isolatedFixtureBoundary:{kind:'isolated_authorized_fixture'}}),deps)).status).toBe(400);
  expect((await handleCoachRequest(request(input),{...deps,isolatedEngine:undefined})).status).toBe(503);
  expect((await handleCoachRequest(request(input),{...deps,guard:async()=>new Response('',{status:401})})).status).toBe(401);
 });
 it('emits the bound draft tool output only through the existing isolated action path',async()=>{
  const fetch=vi.fn(()=>{throw new Error('network forbidden');});vi.stubGlobal('fetch',fetch);
  const env=config(),engine=createIsolatedCoachEngineBinding(env),version='a'.repeat(64);
  const request={version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'I only have 35 minutes and dumbbells.',context:{surface:'plan' as const,includeScreen:true,workspace:{kind:'draft' as const,version}}};
  const response=await engine.run(request,{...options(),isolatedActionsEnabled:true});
  expect(response.ok).toBe(true);
  expect(response.actionIntents).toEqual([expect.objectContaining({action:'draft.update',source:'provider_tool',subjectId:id(1),surface:'plan',resource:{kind:'draft',id:id(1),version},target:{durationMinutes:35,equipment:['dumbbells']},reviewRequired:true})]);
  expect(response.proposals).toEqual([]);expect(response.receipts).toEqual([]);
  expect(response.telemetry).toMatchObject({modelCalls:1,costUsd:0});expect(fetch).not.toHaveBeenCalled();
  const unbound=await engine.run({...request,turnId:id(6),context:{surface:'plan' as const,includeScreen:false,workspace:{kind:'draft' as const,version}}},{...options(),isolatedActionsEnabled:true});
  expect(unbound.ok).toBe(true);expect(unbound.actionIntents).toEqual([]);
 });
 it.each([{CI:'false'},{GITHUB_ACTIONS:'false'},{CI_REAL_SUPABASE:'0'},{VERCEL_ENV:'production'},{TROPHE_ALLOW_PAID_AI:'1'},{NEXT_PUBLIC_SUPABASE_URL:'https://remote.invalid'},{DATABASE_URL:'postgresql://fixture@127.0.0.1:54323/postgres'},{COACH_ASSISTANT_DATA_SOURCE:'synthetic'}])('rejects mismatched server guard %j',override=>{expect(()=>createIsolatedCoachEngineBinding({...config(),...override})).toThrow('isolated_engine_disabled');});
 it('does not accept a forged capability or substitute transport and rechecks guard validity',async()=>{
  const env=config();const {boundary,provider}=createIsolatedEngineBoundary(env);const fake=vi.fn(provider);
  const forged=await runConversationCandidate(input,{...options(),isolatedFixtureBoundary:{kind:'isolated_authorized_fixture'},offlineConversationProvider:fake});expect(forged.error?.code).toBe('budget_blocked');expect(fake).not.toHaveBeenCalled();
  expect((await runConversationCandidate(input,{...options(),isolatedFixtureBoundary:boundary,offlineConversationProvider:fake})).error?.code).toBe('budget_blocked');expect(fake).not.toHaveBeenCalled();
  const engine=createIsolatedCoachEngineBinding(env);env.CI='false';expect((await engine.run(input,options())).error?.code).toBe('budget_blocked');
 });
});
