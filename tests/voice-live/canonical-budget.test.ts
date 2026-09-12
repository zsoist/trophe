import { expect, it, vi } from 'vitest';
import { decidePilotBudgetCommand, pilotAttemptRecordSchema, pilotRecordActiveCharge, type PilotAttemptRecord, type PilotBudgetCommand } from '../../agents/coach-assistant/pilot-budget';
import { createCanonicalLiveBudgetAdapter } from '../../lib/voice-live/canonical-budget-adapter';
import { ASK_TROPHE_SHARED_PILOT_ID } from '../../lib/workout/shared-pilot-budget';
import { LIVE_PRICING_VERSION, LIVE_RATE_CONFIG, liveReservationNanoUsd, liveMeasuredChargeNanoUsd } from '../../lib/voice-live/pricing';
import { computeReservationBreakdown, finalVoiceChargeNanoUsd, parseSessionRateConfig, readUsageSeconds } from '../../lib/voice-live/contracts';
import type { SessionAttemptBinding } from '../../lib/voice-live/budget-adapter';
import { openLiveSession } from '../../lib/voice-live/server-session';
import { FakeDeadline, FakeTransport } from './fakes';

const actorId = '00000000-0000-4000-8000-000000000002';
const binding: SessionAttemptBinding = {
  kind: 'voice', pilotId: ASK_TROPHE_SHARED_PILOT_ID, actorId,
  attemptId: '00000000-0000-4000-8000-000000000003',
  agentRunId: '00000000-0000-4000-8000-000000000004',
  turnId: '00000000-0000-4000-8000-000000000005',
  requestHash: 'a'.repeat(64), model: 'gpt-live-1', pricingVersion: LIVE_PRICING_VERSION,
  maxDurationSeconds: 120, reservedNanoUsd: liveReservationNanoUsd(120),
};
const signal = new AbortController().signal;

it('uses identical exact pricing in lifecycle and canonical ledger', () => {
  expect(parseSessionRateConfig(LIVE_RATE_CONFIG)).toMatchObject({ ok: true });
  expect(computeReservationBreakdown(LIVE_RATE_CONFIG, 120)).toMatchObject({ ok: true, value: { totalNanoUsd: binding.reservedNanoUsd } });
  expect(finalVoiceChargeNanoUsd(LIVE_RATE_CONFIG, 60)).toEqual({ ok: true, value: 50_000_000 });
  expect(parseSessionRateConfig({ ...LIVE_RATE_CONFIG, perMinuteRateNanoUsd: 1 })).toMatchObject({ ok: false });
  expect(readUsageSeconds({ type: 'session.usage.updated', usage: { seconds: 16.9 } })).toMatchObject({ hasUsage: false });
});

function fixture(otherReserved = 0) {
  let record: PilotAttemptRecord | undefined;
  const execute = vi.fn(async (command: PilotBudgetCommand) => {
    const decision = decidePilotBudgetCommand({
      pilotId: binding.pilotId, budgetDay: '2026-09-12', capNanoUsd: 3_000_000_000,
      chargedNanoUsd: otherReserved + (record?.chargedNanoUsd ?? 0), turnAttemptCount: record ? 1 : 0,
      accountingBlocked: record?.accountingAlert ?? false, existing: record,
    }, command);
    if (decision.ok) record = decision.record;
    return { storage: 'database', ...decision };
  });
  return { adapter: createCanonicalLiveBudgetAdapter(actorId, { execute }), execute, record: () => record };
}

it('uses the shared cap and cannot ignore existing text/photo reservations', async () => {
  const h = fixture(3_000_000_000 - binding.reservedNanoUsd + 1);
  expect(await h.adapter.execute({ operation: 'reserve', binding }, signal)).toMatchObject({ ok: false, error: 'budget_blocked' });
});

it('rejects foreign actors, different pilots and backend attempts before touching the store', async () => {
  const h = fixture();
  for (const changed of [{ actorId: binding.attemptId }, { pilotId: binding.attemptId }, { kind: 'backend' as const }]) {
    expect(await h.adapter.execute({ operation: 'reserve', binding: { ...binding, ...changed } }, signal)).toMatchObject({ ok: false });
  }
  expect(h.execute).not.toHaveBeenCalled();
});

it('settles exact minute pricing with one dispatch and idempotent replay', async () => {
  const h = fixture();
  await h.adapter.execute({ operation: 'reserve', binding }, signal);
  expect(await h.adapter.execute({ operation: 'claim_dispatch', binding }, signal)).toMatchObject({ dispatchGranted: true });
  expect(await h.adapter.execute({ operation: 'claim_dispatch', binding }, signal)).toMatchObject({ dispatchGranted: false });
  const command = { operation: 'settle' as const, binding, usageSeconds: 60, finalChargeNanoUsd: 50_000_000, providerTrusted: true as const };
  expect(await h.adapter.execute(command, signal)).toMatchObject({ ok: true, record: { state: 'settled', chargedNanoUsd: 50_000_000, usageSeconds: 60 } });
  expect(await h.adapter.execute(command, signal)).toMatchObject({ ok: true, write: 'none' });
  expect(pilotAttemptRecordSchema.safeParse(h.record()).success).toBe(true);
  expect(liveMeasuredChargeNanoUsd(0)).toBe(12_500_000);
  expect(liveMeasuredChargeNanoUsd(16)).toBe(13_333_334);
});

it('retains unknown reservation across midnight and refuses a changed duration or false charge', async () => {
  const h = fixture();
  await h.adapter.execute({ operation: 'reserve', binding }, signal);
  await h.adapter.execute({ operation: 'claim_dispatch', binding }, signal);
  await h.adapter.execute({ operation: 'mark_unknown', binding, reason: 'missing final usage' }, signal);
  expect(pilotRecordActiveCharge(h.record()!, '2026-09-13')).toBe(binding.reservedNanoUsd);
  const changed = { ...binding, maxDurationSeconds: 119, reservedNanoUsd: liveReservationNanoUsd(119) };
  expect(await h.adapter.execute({ operation: 'lookup', binding: changed }, signal)).toMatchObject({ ok: false, error: 'idempotency_conflict' });
  expect(await h.adapter.execute({ operation: 'settle', binding, usageSeconds: 60, finalChargeNanoUsd: 0, providerTrusted: true }, signal)).toMatchObject({ ok: false, error: 'invalid_input' });
  expect(h.record()?.state).toBe('unknown');
});

it('records measured overruns and raises the canonical accounting block', async () => {
  const h = fixture();
  await h.adapter.execute({ operation: 'reserve', binding }, signal);
  await h.adapter.execute({ operation: 'claim_dispatch', binding }, signal);
  const charged = liveMeasuredChargeNanoUsd(600)!;
  expect(await h.adapter.execute({ operation: 'settle', binding, usageSeconds: 600, finalChargeNanoUsd: charged, providerTrusted: true }, signal)).toMatchObject({ ok: true, record: { state: 'settled', chargedNanoUsd: charged } });
  expect(h.record()?.accountingAlert).toBe(true);
  expect(pilotAttemptRecordSchema.safeParse(h.record()).success).toBe(true);
  const next = { ...h.record()!.binding, attemptId: actorId, agentRunId: actorId };
  expect(decidePilotBudgetCommand({ pilotId: binding.pilotId, budgetDay: '2026-09-12', capNanoUsd: 3_000_000_000, chargedNanoUsd: charged, turnAttemptCount: 0, accountingBlocked: true }, { operation: 'reserve', binding: next })).toMatchObject({ ok: false, error: 'budget_blocked' });
});

it('carries the exact rate through session finalization and accepts final provider usage', async () => {
  const h = fixture();
  const opened = await openLiveSession({
    context: { actorId, organizationId: null, pilotId: binding.pilotId, conversationId: binding.turnId, turnId: binding.turnId, agentRunId: binding.agentRunId },
    attemptId: binding.attemptId, requestHash: binding.requestHash, sdpOffer: 'v=0', maxDurationSeconds: 120,
    rateConfig: LIVE_RATE_CONFIG, budget: h.adapter, transport: new FakeTransport(), deadline: new FakeDeadline(), now: () => 0, signal,
  });
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error('session did not open');
  opened.session.observe({ type: 'session.closed', reason: 'close_requested', usage: { seconds: 60 } }, 'provider');
  expect(await opened.session.finalize()).toMatchObject({ status: 'settled', chargedNanoUsd: 50_000_000, usageSeconds: 60 });
});
