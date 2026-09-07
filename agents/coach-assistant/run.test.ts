import { describe, expect, it } from 'vitest';
import { run } from './index';
import { fixtureRepository } from './fixtures';

const opts = () => ({ actorId: 'synthetic-client', repository: fixtureRepository(), now: new Date('2026-09-07T03:30:00Z'), signal: new AbortController().signal, mode: 'offline' as const });
const input = { message: 'What did I record?', intent: 'today' };
describe('coach run boundary', () => {
  it('renders computed evidence with an explicit offline label', async () => {
    const result = await run(input, opts());
    expect(result.ok).toBe(true);
    expect(result.output?.answer).toContain('1000 kcal');
    expect(result.mode).toBe('offline');
    expect(result.dataSource).toBe('synthetic');
    expect(result.telemetry.modelCalls).toBe(0);
  });
  it('does not invoke a paid provider when the pilot budget is zero', async () => {
    const result = await run(input, { ...opts(), mode: 'model' });
    expect(result.error?.code).toBe('budget_blocked');
    expect(result.telemetry.modelCalls).toBe(0);
  });
  it('rejects fabricated prose or references even with a valid known reference alongside', async () => {
    const result = await run(input, { ...opts(), mode:'model', offlineModel: async () => ({ output:{ factIds:['nutrition.calories'], answer:'9000 kcal', suggestionCodes:[],escalate:false },usage:{inputTokens:50,outputTokens:30},latencyMs:1,rawStatus:200 }) });
    expect(result.error?.code).toBe('invalid_output');
    expect(result.output).toBeUndefined();
    const unknown = await run(input, { ...opts(), mode:'model', offlineModel: async () => ({ output:{ factIds:['foreign'], suggestionCodes:[],escalate:false },usage:{inputTokens:50,outputTokens:30},latencyMs:1,rawStatus:200 }) });
    expect(unknown.error?.code).toBe('invalid_output');
  });
  it('returns honest failure on provider outage and propagates cancellation', async () => {
    const result = await run(input, { ...opts(),mode:'model',offlineModel:async () => { throw new Error('private secret provider body'); } });
    expect(result.error?.code).toBe('provider_unavailable');
    expect(JSON.stringify(result)).not.toContain('private secret');
    const controller = new AbortController(); controller.abort();
    expect((await run(input,{...opts(),signal:controller.signal})).error?.code).toBe('cancelled');
  });
  it('never claims a requested write happened', async () => {
    const result = await run({message:'Change my plan and save it',intent:'plan'},opts());
    expect(result.output?.answer).toContain('No plan or record was changed');
    expect(result.output?.escalation.draft).toBeTruthy();
  });
  it('escalates urgent symptoms without diagnosis or exercise clearance', async () => {
    const result = await run({message:'Dolor fuerte en el pecho y me falta el aire entrenando',intent:'today'},opts());
    expect(result.output?.escalation.reason).toBe('urgent_symptoms');
    expect(result.output?.answer).toContain('urgent medical');
  });
  it('enforces a deadline even when an offline provider ignores cancellation', async () => {
    const result = await run(input,{...opts(),mode:'model',deadlineMs:10,offlineModel:async()=>new Promise(()=>{})});
    expect(result.error?.code).toBe('deadline');
  });
});
