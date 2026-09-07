import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { db } from '@/db/client';
import { createPilotBudgetStore } from '@/lib/workout/pilot-budget-service';
import { COACH_ATTEMPT_RESERVATION_NANO_USD as reserve, type PilotAttemptBinding } from '@/agents/coach-assistant/pilot-budget';
import { COACH_PRICING_VERSION } from '@/agents/coach-assistant/economics';
const actor = randomUUID();
const binding = (): PilotAttemptBinding => ({ actorId: actor, pilotId: randomUUID(), attemptId: randomUUID(), agentRunId: randomUUID(), turnId: randomUUID(), model: 'gpt-5.6-luna', pricingVersion: COACH_PRICING_VERSION, requestHash: 'a'.repeat(64), reservedNanoUsd: reserve });
describe('persistent budget writer fail-closed boundaries', () => {
  it('never queries when the command actor differs from the authenticated caller or the request was cancelled', async () => {
    const transaction = vi.fn();
    const store = createPilotBudgetStore({ transaction } as unknown as typeof db, actor);
    expect(await store.execute({ operation: 'reserve', binding: { ...binding(), actorId: randomUUID() } }, new AbortController().signal)).toMatchObject({ ok: false, error: 'budget_blocked' });
    const cancelled = new AbortController(); cancelled.abort();
    expect(await store.execute({ operation: 'reserve', binding: binding() }, cancelled.signal)).toMatchObject({ ok: false, error: 'cancelled' });
    expect(transaction).not.toHaveBeenCalled();
  });
  it('cannot turn a missing charged attempt into available budget', async () => {
    const input = binding();
    const execute = vi.fn().mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ organization_id: randomUUID(), cap_nano_usd: String(20 * reserve), charged_nano_usd: String(reserve), attempt_count: 1, accounting_blocked: false, allowed: true }] }).mockResolvedValueOnce({ rows: [{ id: actor }] }).mockResolvedValueOnce({ rows: [] });
    const transaction = vi.fn(async work => work({ execute }));
    const result = await createPilotBudgetStore({ transaction } as unknown as typeof db, actor).execute({ operation: 'reserve', binding: input }, new AbortController().signal);
    expect(result).toEqual({ storage: 'database', ok: false, error: 'uncertain' });
    expect(execute).toHaveBeenCalledTimes(4);
  });
  it('does not grant dispatch after an ambiguous transaction failure', async () => {
    const transaction = vi.fn().mockRejectedValue(new Error('connection lost around commit'));
    const result = await createPilotBudgetStore({ transaction } as unknown as typeof db, actor).execute({ operation: 'claim_dispatch', binding: binding() }, new AbortController().signal);
    expect(result).toEqual({ storage: 'database', ok: false, error: 'uncertain' });
  });
});
