import { describe,it,expect,vi } from 'vitest';
import { runCoachPilotEvaluation } from './pilot-runner';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from './pilot-budget';
import type { OfflineConversationProvider } from './open-conversation';
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
  const transport=vi.fn<OfflineConversationProvider>(async request=>{
    events.push('transport');const data=JSON.parse(request.prompt);
    return {output:{answer:'A log offers a starting point for review rather than a complete picture of daily life.',followUp:'What would make the review useful?',evidenceRefs:data.evidence.map((f:{id:string})=>f.id),entityRefs:[],facts:[],generalExplanationRefs:['records_are_partial_view'],limitations:[],escalation:false},usage:{inputTokens:1000,outputTokens:200,reasoningTokens:50},latencyMs:1,rawStatus:200};
  });
  return {store,transport,events,records,signal:new AbortController().signal};
}
describe('measured pilot runner with an explicitly injected transport and store',()=>{
  it('reserves and claims before transport, settles usage and never labels injected costs measured spend',async()=>{
    const deps=fixture();const report=await runCoachPilotEvaluation(input,deps);
    expect(report.ok).toBe(true);if(!report.ok)throw new Error('report expected');
    expect(deps.events).toEqual(['reserve','claim_dispatch','transport','settle']);
    expect(report.actualProviderCalls).toBe(0);expect(report.injectedProviderCalls).toBe(1);
    expect(report.measuredUsageCostUsd).toBeNull();expect(report.simulatedUsageCostUsd).toBeCloseTo(0.00044);
    expect(report.allStructuralChecksPassed).toBe(true);expect(report.releaseApproved).toBe(false);
    expect(report.cases[0].reviewText).toBeUndefined();expect(report.cases[0].outputHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it('settles a consumed malformed answer before reporting failed validation',async()=>{
    const deps=fixture();deps.transport.mockResolvedValue({output:{broken:true},usage:{inputTokens:1000,outputTokens:200},latencyMs:1,rawStatus:200});
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
});
