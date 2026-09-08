import { describe,it,expect,vi } from 'vitest';
import { coachConversationPilotCandidate,runCoachConversationPilot } from './pilot-candidate';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { decidePilotBudgetCommand,type PilotAttemptRecord,type PilotBudgetStore } from './pilot-budget';
import type { PilotTransport } from './pilot-runner';
import type { CoachConversationRequest } from './contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function transport(){
 return vi.fn<PilotTransport>(async input=>{
  const data=JSON.parse(input.prompt);
  return {responseModel:'gpt-5.6-luna',output:{answer:'Reviewing recorded context can help organize a useful discussion.',followUp:'What would make this review useful?',evidenceRefs:data.evidence.map((e:{id:string})=>e.id),facts:data.evidence.map((e:{id:string})=>({kind:'record_fact',evidenceId:e.id})),entityRefs:[],generalExplanationRefs:['records_are_partial_view'],limitations:['incomplete_records'],escalation:false},usage:{inputTokens:1200,outputTokens:300,reasoningTokens:40},latencyMs:1,rawStatus:200};
 });
}
describe('actual guarded candidate composition, synthetic transports only',()=>{
 it('runs three real turns, follows food context then switches to workout and refreshes current memory/records',async()=>{
  const repository=fixtureRepository();let memoryText='Prefer vegetables';let memoryVersion='0';
  repository.personalContext=async()=>({rows:[{userId:'synthetic-client',preferences:defaultWorkoutPreferences,memories:memoryText?[{id:id(9),userId:'synthetic-client',text:memoryText,source:'user_input',createdAt:'2026-09-07T00:00:00Z',scope:'user',version:memoryVersion,confirmation:'confirmed'}]:[]}],truncated:false});
  const provider=transport();const options={mode:'model' as const,actorId:'synthetic-client',repository,signal:new AbortController().signal,now:new Date('2026-09-07T03:30:00Z'),offlineConversationProvider:provider};
  const history:NonNullable<CoachConversationRequest['history']>=[];
  for(const [i,message] of ['How should I interpret food records this week?','¿Y cómo podría organizarlo mejor?','How should I review workouts this week?'].entries()){
   if(i===1){memoryText='Prefer fish';memoryVersion='1';const read=repository.nutrition;repository.nutrition=async args=>{const result=await read(args);return {...result,rows:result.rows.map(row=>({...row,calories:(row.calories??0)+100}))};};}
   if(i===2)memoryText='';
   const result=await coachConversationPilotCandidate.run({version:'coach-assistant.v2',conversationId:id(1),turnId:id(i+2),message,history:[...history]},options);
   expect(result.error,`turn ${i}`).toBeUndefined();expect(result.ok).toBe(true);expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);expect(result.output?.suggestions).toEqual(['What would make this review useful?']);
   const payload=JSON.parse(provider.mock.calls[i][0].prompt);
   expect(payload.message).toBe(message);expect(payload.memories.map((m:{text:string})=>m.text)).toEqual(i===0?['Prefer vegetables']:i===1?['Prefer fish']:[]);
   expect(payload.actionsAvailable).toBe(false);expect(payload.history.length).toBeLessThanOrEqual(i*2);if(i>0)expect(payload.history.some((h:{role:string;text:string})=>h.role==='user'&&h.text===history[history.length-2].text)).toBe(true);
   expect(payload.evidence.length).toBeGreaterThan(0);
   expect(payload.evidence.every((e:{source:string})=>i<2?e.source==='nutrition':e.source==='workout'||e.source==='plan')).toBe(true);
   for(const evidence of payload.evidence)expect(result.output?.answer).toContain(evidence.statement);
   history.push({role:'user',text:message},{role:'assistant',text:result.output!.answer.slice(0,500)});
  }
  expect(provider).toHaveBeenCalledTimes(3);
  const first=JSON.parse(provider.mock.calls[0][0].prompt);const second=JSON.parse(provider.mock.calls[1][0].prompt);
  expect(second.evidence.map((e:{statement:string})=>e.statement)).not.toEqual(first.evidence.map((e:{statement:string})=>e.statement));
 });
 it('binds the real guarded engine to the existing synthetic handler only behind an explicit off-by-default flag',async()=>{
  const provider=transport();const deps={env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id(1),COACH_ASSISTANT_DATA_SOURCE:'synthetic',COACH_ASSISTANT_CANDIDATE_EVALUATION_ENABLED:'0',VERCEL_ENV:'preview'},guard:async()=>({userId:id(1)}),createRepository:()=>fixtureRepository(),candidateEvaluation:{kind:'injected_fixture' as const,transport:provider}};
  const body={version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'How should I interpret food records this week?'};
  const request=()=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
  expect((await handleCoachRequest(request(),deps)).status).toBe(200);expect(provider).not.toHaveBeenCalled();
  deps.env.COACH_ASSISTANT_CANDIDATE_EVALUATION_ENABLED='1';
  const result=await (await handleCoachRequest(request(),deps)).json();expect(result.ok).toBe(true);expect(result.output.answer).toContain('Reviewing recorded context');expect(result.evaluation.release).toBe('unapproved_candidate');expect(result.proposals).toEqual([]);expect(result.receipts).toEqual([]);
  expect((await handleCoachRequest(request(),{...deps,candidateEvaluation:undefined})).status).toBe(503);
  expect((await handleCoachRequest(request(),{...deps,env:{...deps.env,COACH_ASSISTANT_DATA_SOURCE:'authorized_records'}})).status).toBe(503);
  expect(provider).toHaveBeenCalledTimes(1);
 });
 it('runs the real engine through the existing budget/runner and rejects injected transport in live mode',async()=>{
  const records=new Map<string,PilotAttemptRecord>();const events:string[]=[];
  const store:PilotBudgetStore={execute:async command=>{
   events.push(command.operation);const decision=decidePilotBudgetCommand({pilotId:id(1),budgetDay:'2026-09-08',capNanoUsd:44_000_000,chargedNanoUsd:[...records.values()].reduce((n,r)=>n+r.chargedNanoUsd,0),turnAttemptCount:[...records.values()].filter(r=>r.binding.turnId===command.binding.turnId).length,accountingBlocked:[...records.values()].some(r=>r.accountingAlert),existing:records.get(command.binding.attemptId)},command);
   if(decision.ok&&decision.write!=='none')records.set(command.binding.attemptId,structuredClone(decision.record));return {storage:'database',...decision};
  }};
  const provider=transport();const input={pilotId:id(1),actorId:id(2),evaluationId:id(3),mode:'injected',caseIds:['explain_food','follow_up']};
  const report=await runCoachConversationPilot(input,{store,transport:provider,signal:new AbortController().signal});
  if(!report.ok)throw new Error('report');expect(report.allStructuralChecksPassed).toBe(true);expect(report.actualProviderCalls).toBe(0);expect(report.injectedProviderCalls).toBe(2);expect(report.measuredUsageCostUsd).toBeNull();expect(report.releaseApproved).toBe(false);expect(events).toEqual(['reserve','claim_dispatch','settle','reserve','claim_dispatch','settle']);
  await runCoachConversationPilot(input,{store,transport:provider,signal:new AbortController().signal});expect(provider).toHaveBeenCalledTimes(2);
  expect(await runCoachConversationPilot({...input,mode:'live'},{store,transport:provider,signal:new AbortController().signal})).toMatchObject({error:'budget_blocked'});
 });
});
