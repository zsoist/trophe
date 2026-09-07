import { describe,it,expect,vi } from 'vitest';
import { runCoachPilotEvaluation } from './pilot-runner';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from './pilot-budget';
import { z } from 'zod';
import type { PilotTransport,PilotCandidate } from './pilot-runner';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const input={pilotId:uuid(1),actorId:uuid(2),evaluationId:uuid(3),mode:'injected',caseIds:['explain_food']};
/** Serialized injected port only. Not a real persistent SQL transaction. */
function fixture() {
  const records=new Map<string,PilotAttemptRecord>();const events:string[]=[];
  const store:PilotBudgetStore={execute:vi.fn(async(command:PilotBudgetCommand)=>{
    events.push(command.operation);
    const decision=decidePilotBudgetCommand({pilotId:uuid(1),capNanoUsd:44_000_000,chargedNanoUsd:[...records.values()].reduce((sum,row)=>sum+row.chargedNanoUsd,0),turnAttemptCount:[...records.values()].filter(row=>row.binding.turnId===command.binding.turnId).length,accountingBlocked:[...records.values()].some(row=>row.accountingAlert),existing:records.get(command.binding.attemptId)},command);
    if(decision.ok&&decision.write!=='none')records.set(command.binding.attemptId,structuredClone(decision.record));
    return {storage:'database',...decision};
  })};
  const transport=vi.fn<PilotTransport>(async request=>{
    events.push('transport');const data=JSON.parse(request.prompt);
    return {responseModel:'gpt-5.6-luna',output:{answer:'A log offers a starting point for review rather than a complete picture of daily life.',followUp:'What would make the review useful?',evidenceRefs:data.evidence.map((f:{id:string})=>f.id),entityRefs:[],facts:[],generalExplanationRefs:['records_are_partial_view'],limitations:[],escalation:false},usage:{inputTokens:1000,outputTokens:200,reasoningTokens:50},latencyMs:1,rawStatus:200};
  });
  // Budget/transport fixture only; does not import or approve a conversation engine.
  const candidate:PilotCandidate={promptVersion:'pilot-test-fixture.v1',run:async(raw,options)=>{
    const message=(raw as {message:string}).message;
    if(message.includes('chest pain'))return {ok:true,output:{answer:'Seek help',suggestions:[],escalation:{reason:'urgent_symptoms'}},proposals:[],receipts:[]};
    try {
      const generated=await options.offlineConversationProvider({policy:{provider:'openai',model:'gpt-5.6-luna',reasoningEffort:'low',costClass:'cheap',latencyClass:'fast',maxTokens:2000,timeoutMs:45000,maxInputChars:8000,maxCostUsd:0,promptVersion:'pilot-test-fixture.v1'},system:'fixture',prompt:JSON.stringify({message,evidence:[]}),schema:{type:'object'},validator:z.unknown(),signal:options.signal,maxTokens:2000,maxAttempts:1});
      const output=z.object({answer:z.string(),followUp:z.string()}).safeParse(generated.output);
      if(!output.success)return {ok:false,error:{code:'invalid_output'},proposals:[],receipts:[]};
      return {ok:true,output:{answer:output.data.answer,suggestions:[output.data.followUp],escalation:{reason:'none'}},proposals:[],receipts:[]};
    } catch {return {ok:false,error:{code:'provider_unavailable'},proposals:[],receipts:[]};}
  }};
  return {store,transport,events,records,candidate,signal:new AbortController().signal};
}
describe('measured pilot runner with an explicitly injected transport and store',()=>{
  it('reserves and claims before transport, settles usage and never labels injected costs measured spend',async()=>{
    const deps=fixture();const report=await runCoachPilotEvaluation(input,deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(deps.events).toEqual(['reserve','claim_dispatch','transport','settle']);
    expect(report.requestedModel).toBe('gpt-5.6-luna');expect(report.returnedModel).toBe('gpt-5.6-luna');
    expect(report.actualProviderCalls).toBe(0);expect(report.injectedProviderCalls).toBe(1);
    expect(report.measuredUsageCostUsd).toBeNull();expect(report.simulatedUsageCostUsd).toBeCloseTo(0.00044);
    expect(report.allStructuralChecksPassed).toBe(true);expect(report.releaseApproved).toBe(false);
    expect(report.cases[0].reviewText).toBeUndefined();expect(report.cases[0].outputHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([undefined,'gpt-5.6-luna-snapshot','another-model',''])('preserves observed metadata %s without substituting the request',async(responseModel)=>{
    const deps=fixture();const original=deps.transport.getMockImplementation()!;
    deps.transport.mockImplementation(async request=>({...await original(request),responseModel}));
    const report=await runCoachPilotEvaluation(input,deps);
    if(!report.ok)throw new Error('report expected');
    expect(report.cases[0]).toMatchObject({requestedModel:'gpt-5.6-luna',returnedModel:responseModel||null});
    expect(report.returnedModel).toBe(responseModel||null);
    expect(report.cases[0].attemptId).toBeDefined();expect(report.actualProviderCalls).toBe(0);
    expect(deps.events).not.toContain('settle');expect(report.cases[0].pricedUsageNanoUsd).toBeNull();expect(report.simulatedUsageCostUsd).toBeNull();
    expect([...deps.records.values()][0]).toMatchObject({state:'unknown',chargedNanoUsd:4_400_000,accountingAlert:true,unpricedModel:responseModel||null,usage:{inputTokens:1000,outputTokens:200}});
    const row=[...deps.records.values()][0];
    expect(await deps.store.execute({operation:'settle',binding:row.binding,usage:row.usage!},deps.signal)).toMatchObject({ok:false,error:'invalid_transition'});
    const replay=await runCoachPilotEvaluation(input,deps);expect(replay.ok).toBe(true);expect(deps.transport).toHaveBeenCalledTimes(1);
    const next=await runCoachPilotEvaluation({...input,evaluationId:uuid(9)},deps);expect(next.ok).toBe(true);expect(deps.transport).toHaveBeenCalledTimes(1);

  });
  it('settles a consumed malformed answer before reporting failed validation',async()=>{
    const deps=fixture();deps.transport.mockResolvedValue({responseModel:'gpt-5.6-luna',output:{broken:true},usage:{inputTokens:1000,outputTokens:200},latencyMs:1,rawStatus:200});
    const report=await runCoachPilotEvaluation(input,deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(report.cases[0]).toMatchObject({responseAccepted:false,accounting:'settled',error:'invalid_output'});
    expect(report.simulatedUsageCostUsd).toBeCloseTo(0.00044);expect([...deps.records.values()][0].state).toBe('settled');
  });
  it('retains unknown charges after provider failure and never retries automatically',async()=>{
    const deps=fixture();deps.transport.mockRejectedValue(new Error('private provider detail'));
    const report=await runCoachPilotEvaluation(input,deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(report.cases[0].accounting).toBe('unknown');expect(report.simulatedUsageCostUsd).toBeNull();
    expect(deps.transport).toHaveBeenCalledTimes(1);expect([...deps.records.values()][0]).toMatchObject({state:'unknown',chargedNanoUsd:4_400_000});
    expect(JSON.stringify(report)).not.toContain('private provider');
  });
  it('reuses stable attempt identity on restart and refuses redispatch without inventing zero historical cost',async()=>{
    const deps=fixture();await runCoachPilotEvaluation(input,deps);deps.transport.mockClear();
    const replay=await runCoachPilotEvaluation(input,deps);
    expect(replay.ok).toBe(true);if(!replay.ok)throw new Error('report expected');
    expect(deps.transport).not.toHaveBeenCalled();expect(replay.cases[0].accounting).toBe('recovered');expect(replay.simulatedUsageCostUsd).toBeNull();expect(deps.records.size).toBe(1);
  });
  it('runs the bounded positive/adversarial subset and exposes review text only when explicitly requested',async()=>{
    const deps=fixture();const report=await runCoachPilotEvaluation({...input,caseIds:undefined,includeSyntheticText:true},deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(report.cases).toHaveLength(4);expect(report.injectedProviderCalls).toBe(3);expect(report.allStructuralChecksPassed).toBe(true);
    expect(report.cases[0].reviewText?.answer).toContain('A log offers');expect(report.evaluationId).toBe(input.evaluationId);
  });
  it('reports uncertain accounting when settlement persistence fails, retaining the reservation',async()=>{
    const deps=fixture();const execute=deps.store.execute;
    deps.store.execute=vi.fn(async(command,signal)=>{if(command.operation==='settle')throw new Error('private SQL');return execute(command,signal);});
    const report=await runCoachPilotEvaluation(input,deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(report.cases[0]).toMatchObject({accounting:'unknown',error:'accounting_uncertain'});expect(report.simulatedUsageCostUsd).toBeNull();
    expect([...deps.records.values()][0]).toMatchObject({state:'unknown',chargedNanoUsd:4_400_000});expect(deps.transport).toHaveBeenCalledTimes(1);
  });
  it('keeps live disabled at zero cap before touching the store or provider',async()=>{
    const deps=fixture();expect(await runCoachPilotEvaluation({...input,mode:'live'},deps)).toEqual({ok:false,error:'budget_blocked',releaseApproved:false});
    expect(deps.store.execute).not.toHaveBeenCalled();expect(deps.transport).not.toHaveBeenCalled();
  });
  it('requires positive cases to answer and includes urgent triage without a model call',async()=>{
    const deps=fixture();const report=await runCoachPilotEvaluation({...input,caseIds:['urgent_triage']},deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(report.allStructuralChecksPassed).toBe(true);expect(report.injectedProviderCalls).toBe(0);expect(deps.store.execute).not.toHaveBeenCalled();
  });
  it('blocks a second dispatch even when a candidate catches unknown outcome and tries again',async()=>{
    const deps=fixture();const original=deps.candidate.run;deps.transport.mockRejectedValue(new Error('unknown network outcome'));
    deps.candidate.run=async(raw,options)=>{await original(raw,options);return original(raw,options);};
    const report=await runCoachPilotEvaluation(input,deps);expect(report.ok).toBe(true);expect(deps.transport).toHaveBeenCalledTimes(1);expect(deps.records.size).toBe(1);if(report.ok)expect(report.cases[0].accounting).toBe('unknown');
  });

  it('enforces two invocations total and the exact ordered prompt allowlist',async()=>{
    const deps=fixture();const original=deps.candidate.run;
    deps.candidate.run=async(raw,options)=>{await original(raw,options);await original(raw,options);return original(raw,options);};
    await runCoachPilotEvaluation(input,deps);expect(deps.transport).toHaveBeenCalledTimes(2);expect(deps.records.size).toBe(2);
    const mismatch=fixture();mismatch.candidate.invocationPromptVersions=['different-version'];await runCoachPilotEvaluation(input,mismatch);expect(mismatch.transport).not.toHaveBeenCalled();expect(mismatch.store.execute).not.toHaveBeenCalled();
  });

});
