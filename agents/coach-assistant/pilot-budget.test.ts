import { describe,it,expect,vi } from 'vitest';
import { COACH_ATTEMPT_RESERVATION_NANO_USD as amount, decidePilotBudgetCommand, executePilotBudgetCommand, reserveCoachPilotAttempt, pricePilotUsageNanoUsd, pilotRecordActiveCharge, type PilotAttemptBinding, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from './pilot-budget';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const day='2026-09-08';
const binding=(n=1):PilotAttemptBinding=>({pilotId:uuid(1),actorId:uuid(2),attemptId:uuid(n+10),agentRunId:uuid(n+20),turnId:uuid(3),model:'gpt-5.6-luna',pricingVersion:'gpt-5.6-luna-standard-2026-09-08',requestHash:'a'.repeat(64),reservedNanoUsd:amount});
const usage={inputTokens:1000,outputTokens:200,cacheReadTokens:200,cacheWriteTokens:100,reasoningTokens:50};
/** Explicit test harness, not a persistent implementation or SQL proof. */
function fixture(cap=amount*2) {
  const rows=new Map<string,PilotAttemptRecord>();
  const execute=vi.fn(async(command:PilotBudgetCommand)=>{
    const snapshot={pilotId:uuid(1),budgetDay:day,capNanoUsd:cap,accountingBlocked:[...rows.values()].some(row=>row.accountingAlert),chargedNanoUsd:[...rows.values()].reduce((sum,row)=>sum+row.chargedNanoUsd,0),turnAttemptCount:[...rows.values()].filter(row=>row.binding.turnId===command.binding.turnId).length,existing:rows.get(command.binding.attemptId)};
    const decision=decidePilotBudgetCommand(snapshot,command);
    if(decision.ok&&decision.write!=='none')rows.set(command.binding.attemptId,structuredClone(decision.record));
    return {storage:'database' as const,...decision};
  });
  return {rows,store:{execute},command:(operation:PilotBudgetCommand['operation'],b=binding())=>({operation,binding:b})};
}
describe('pilot budget pure core and injected persistent port',()=>{
  it('prices exact integer usage without adding reasoning twice and reserves the worst tier',()=>{
    expect(amount).toBe(4_400_000);expect(pricePilotUsageNanoUsd(usage)).toBe(409000);
    expect(pricePilotUsageNanoUsd({...usage,reasoningTokens:0})).toBe(409000);
    expect(pricePilotUsageNanoUsd({...usage,inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0})).toBeNull();
  });
  it('accounts aggregate pending charges and limits new attempts while preserving idempotent reserves',async()=>{
    const {store,command,rows}=fixture(amount);
    const signal=new AbortController().signal;
    const first=await executePilotBudgetCommand(command('reserve'),store,signal);
    expect(first.ok).toBe(true);
    expect(await executePilotBudgetCommand(command('reserve',binding(2)),store,signal)).toMatchObject({ok:false,error:'budget_blocked'});
    expect(await executePilotBudgetCommand(command('reserve'),store,signal)).toMatchObject({ok:true,write:'none'});
    expect(rows.size).toBe(1);
    expect(await executePilotBudgetCommand(command('reserve',{...binding(),requestHash:'b'.repeat(64)}),store,signal)).toMatchObject({error:'idempotency_conflict'});
  });
  it('grants dispatch once and retains unknown cost across a new adapter instance',async()=>{
    const {store,command,rows}=fixture();const signal=new AbortController().signal;
    await executePilotBudgetCommand(command('reserve'),store,signal);
    expect(await executePilotBudgetCommand(command('claim_dispatch'),store,signal)).toMatchObject({ok:true,dispatchGranted:true});
    expect(await executePilotBudgetCommand(command('claim_dispatch'),store,signal)).toMatchObject({ok:true,dispatchGranted:false});
    await executePilotBudgetCommand(command('mark_unknown'),store,signal);
    const recovered=await executePilotBudgetCommand(command('lookup'),{execute:store.execute},signal);
    expect(recovered).toMatchObject({ok:true,record:{state:'unknown',chargedNanoUsd:amount}});
    expect(rows.get(binding().attemptId)?.chargedNanoUsd).toBe(amount);
    expect(await executePilotBudgetCommand(command('release_unstarted'),store,signal)).toMatchObject({error:'invalid_transition'});
  });
  it('settles measured usage idempotently and keeps invalid or zero usage reserved',async()=>{
    const {store,command}=fixture();const signal=new AbortController().signal;
    await executePilotBudgetCommand(command('reserve'),store,signal);await executePilotBudgetCommand(command('claim_dispatch'),store,signal);
    expect(await executePilotBudgetCommand({operation:'settle',binding:binding(),usage:{...usage,reasoningTokens:9999}},store,signal)).toMatchObject({ok:true,record:{state:'unknown',chargedNanoUsd:amount}});
    const settled=await executePilotBudgetCommand({operation:'settle',binding:binding(),usage},store,signal);
    expect(settled).toMatchObject({ok:true,record:{state:'settled',chargedNanoUsd:409000}});
    expect(await executePilotBudgetCommand({operation:'settle',binding:binding(),usage},store,signal)).toMatchObject({ok:true,write:'none'});
    expect(await executePilotBudgetCommand({operation:'settle',binding:binding(),usage:{...usage,outputTokens:201}},store,signal)).toMatchObject({error:'idempotency_conflict'});
  });
  it('releases only unstarted reservations and enforces two reservations per turn',async()=>{
    const {store,command}=fixture(amount*10);const signal=new AbortController().signal;
    for(const b of [binding(),binding(2)]) {await executePilotBudgetCommand(command('reserve',b),store,signal);expect(await executePilotBudgetCommand(command('release_unstarted',b),store,signal)).toMatchObject({ok:true,record:{state:'released',chargedNanoUsd:0}});}
    expect(await executePilotBudgetCommand(command('reserve',binding(3)),store,signal)).toMatchObject({error:'budget_blocked'});
  });
  it('models competing calls only through a serialized injected port and records overruns without hiding them',async()=>{
    const {store,command}=fixture(amount);const signal=new AbortController().signal;
    const competing=await Promise.all([executePilotBudgetCommand(command('reserve'),store,signal),executePilotBudgetCommand(command('reserve',binding(2)),store,signal)]);
    expect(competing.filter(result=>result.ok)).toHaveLength(1);
    await executePilotBudgetCommand(command('claim_dispatch'),store,signal);
    const overrun={inputTokens:8000,outputTokens:4000,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0};
    const settled=await executePilotBudgetCommand({operation:'settle',binding:binding(),usage:overrun},store,signal);
    expect(settled).toMatchObject({ok:true,record:{state:'settled',chargedNanoUsd:6_400_000}});
    expect(await executePilotBudgetCommand(command('reserve',binding(2)),store,signal)).toMatchObject({error:'budget_blocked'});
  });
  it('denies a new dispatch after the configured cap is reduced to zero',()=>{
    const reserved:PilotAttemptRecord={binding:binding(),admissionDay:day,state:'reserved',chargedNanoUsd:amount,usage:null,accountingAlert:false};
    expect(decidePilotBudgetCommand({pilotId:uuid(1),budgetDay:day,capNanoUsd:0,accountingBlocked:false,chargedNanoUsd:amount,turnAttemptCount:1,existing:reserved},{operation:'claim_dispatch',binding:binding()})).toMatchObject({error:'budget_blocked'});
  });
  it('resets only settled daily usage at Bogotá midnight while retaining open reservations',()=>{
    const settled:PilotAttemptRecord={binding:binding(),admissionDay:'2026-09-07',state:'settled',chargedNanoUsd:409000,usage,accountingAlert:false};
    const open:PilotAttemptRecord={binding:binding(2),admissionDay:'2026-09-07',state:'unknown',chargedNanoUsd:amount,usage:null,accountingAlert:false};
    expect(pilotRecordActiveCharge(settled,'2026-09-08')).toBe(0);
    expect(pilotRecordActiveCharge(open,'2026-09-08')).toBe(amount);
  });
  it('quarantines unpriced long-context usage and preserves the anomalous counters across lookup',async()=>{
    const {store,command}=fixture(amount*10);const signal=new AbortController().signal;
    await executePilotBudgetCommand(command('reserve'),store,signal);await executePilotBudgetCommand(command('claim_dispatch'),store,signal);
    const long={...usage,inputTokens:272001};
    expect(pricePilotUsageNanoUsd(long)).toBeNull();
    expect(await executePilotBudgetCommand({operation:'settle',binding:binding(),usage:long},store,signal)).toMatchObject({ok:true,record:{state:'unknown',chargedNanoUsd:amount,accountingAlert:true,usage:long}});
    expect(await executePilotBudgetCommand(command('lookup'),store,signal)).toMatchObject({ok:true,record:{accountingAlert:true,usage:long}});
    expect(await executePilotBudgetCommand(command('reserve',binding(2)),store,signal)).toMatchObject({error:'budget_blocked'});
  });
  it('never permits transport after an ambiguous budget-store commit',async()=>{
    const store:PilotBudgetStore={execute:vi.fn().mockRejectedValue(new Error('private detail'))};const signal=new AbortController().signal;
    expect(await executePilotBudgetCommand({operation:'claim_dispatch',binding:binding()},store,signal)).toMatchObject({ok:false,error:'uncertain'});
    vi.mocked(store.execute).mockClear();
    expect(await reserveCoachPilotAttempt(binding(),store,signal)).toMatchObject({ok:false,error:'uncertain'});expect(store.execute).toHaveBeenCalledOnce();
  });
});
