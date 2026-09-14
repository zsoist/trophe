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

it('AG4 committed reserve with lost response legally releases never-dispatched reservation', async () => {
  const caller = new AbortController();
  let record: PilotAttemptRecord | undefined;
  const operations: string[] = [];
  const adapter = createCanonicalLiveBudgetAdapter(actorId, { execute: async (command: PilotBudgetCommand) => {
    operations.push(command.operation);
    const decision = decidePilotBudgetCommand({ pilotId: binding.pilotId, budgetDay: '2026-09-12', capNanoUsd: 3_000_000_000, chargedNanoUsd: record?.chargedNanoUsd ?? 0, turnAttemptCount: record ? 1 : 0, accountingBlocked: false, existing: record }, command);
    if (decision.ok) record = decision.record;
    if (command.operation === 'reserve') caller.abort();
    return { storage: 'database', ...decision };
  }});
  const transport = new FakeTransport();
  const opened = await openLiveSession({ context: { actorId, organizationId: null, pilotId: binding.pilotId, conversationId: binding.turnId, turnId: binding.turnId, agentRunId: binding.agentRunId }, attemptId: binding.attemptId, requestHash: binding.requestHash, sdpOffer: 'v=0', maxDurationSeconds: 120, rateConfig: LIVE_RATE_CONFIG, budget: adapter, transport, deadline: new FakeDeadline(), now: () => 0, signal: caller.signal });
  expect(opened.ok).toBe(false);
  expect(operations).toEqual(['reserve', 'release_unstarted']);
  expect(record?.chargedNanoUsd).toBe(0);
  expect(record?.state).toBe('released');
});

it('AG4 reserve uncertainty cleanup is bounded even if store ignores abort', async () => {
 vi.useFakeTimers();
 try {
  let done = false;
  const pending = openLiveSession({ context: { actorId, organizationId: null, pilotId: binding.pilotId, conversationId: binding.turnId, turnId: binding.turnId, agentRunId: binding.agentRunId }, attemptId: binding.attemptId, requestHash: binding.requestHash, sdpOffer: 'v=0', maxDurationSeconds: 120, rateConfig: LIVE_RATE_CONFIG, budget: { execute: async command => command.operation === 'reserve' ? {storage:'database',ok:false,error:'uncertain'} : new Promise(() => {}) }, transport: new FakeTransport(), deadline: new FakeDeadline(), now: () => 0, signal: new AbortController().signal }).then(() => {done = true;});
  void pending;
  await vi.advanceTimersByTimeAsync(6000);
  expect(done).toBe(true);
 } finally { vi.useRealTimers(); }
});
