/**
 * LIVE-RECOVERY-002 — a provider close buffered during a server close must be
 * observed before the runtime transitions to `closed`.
 *
 * This is an injected transport test: no provider, database or network is
 * touched. The stream models the sideband contract where closeSession returns
 * after buffering `session.usage.updated` and `session.closed`.
 */
import { expect, it } from 'vitest';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand } from '../../agents/coach-assistant/pilot-budget';
import { createCanonicalLiveBudgetAdapter } from '../../lib/voice-live/canonical-budget-adapter';
import { ASK_TROPHE_SHARED_PILOT_ID } from '../../lib/workout/shared-pilot-budget';
import { LIVE_PRICING_VERSION, LIVE_RATE_CONFIG, liveMeasuredChargeNanoUsd, liveReservationNanoUsd } from '../../lib/voice-live/pricing';
import type { ProviderSessionEvent } from '../../lib/voice-live/contracts';
import type { SessionAttemptBinding } from '../../lib/voice-live/budget-adapter';
import { consumeProviderEvents, openLiveSession, type LiveSessionRuntime, type LiveSessionTransport, type OpenLiveSessionInput } from '../../lib/voice-live/server-session';
import { FakeDeadline } from './fakes';

const actorId = '00000000-0000-4000-8000-000000000002';
const binding: SessionAttemptBinding = {
  kind: 'voice', pilotId: ASK_TROPHE_SHARED_PILOT_ID, actorId,
  attemptId: '00000000-0000-4000-8000-000000000003',
  agentRunId: '00000000-0000-4000-8000-000000000004',
  turnId: '00000000-0000-4000-8000-000000000005', requestHash: 'a'.repeat(64),
  model: 'gpt-live-1', pricingVersion: LIVE_PRICING_VERSION,
  maxDurationSeconds: 120, reservedNanoUsd: liveReservationNanoUsd(120),
};
const usageSeconds = 37;
const context = {
  actorId, organizationId: null, pilotId: binding.pilotId,
  conversationId: binding.turnId, turnId: binding.turnId, agentRunId: binding.agentRunId,
};

function bufferedStream() {
  const queue: ProviderSessionEvent[] = [];
  let wake: (() => void) | undefined;
  let ended = false;
  return {
    push(...events: ProviderSessionEvent[]) { queue.push(...events); const notify = wake; wake = undefined; notify?.(); },
    end() { ended = true; const notify = wake; wake = undefined; notify?.(); },
    events: {
      async *[Symbol.asyncIterator]() {
        while (!ended || queue.length) {
          if (queue.length) { yield queue.shift()!; continue; }
          await new Promise<void>(resolve => { wake = resolve; });
        }
      },
    } satisfies AsyncIterable<ProviderSessionEvent>,
  };
}

function transportFor(stream: ReturnType<typeof bufferedStream>, confirmOnClose: boolean): LiveSessionTransport {
  return {
    async openSession() { return { sessionId: '00000000-0000-4000-8000-0000000000aa', transportSdp: 'v=0 answer', events: stream.events }; },
    async closeSession() {
      if (!confirmOnClose) return;
      stream.push({ type: 'session.usage.updated', usage: { seconds: usageSeconds } }, { type: 'session.closed', reason: 'close_requested' });
      stream.end();
    },
  };
}

function harness() {
  let record: PilotAttemptRecord | undefined;
  const operations: PilotBudgetCommand['operation'][] = [];
  const adapter = createCanonicalLiveBudgetAdapter(actorId, {
    async execute(command: PilotBudgetCommand) {
      operations.push(command.operation);
      const decision = decidePilotBudgetCommand({
        pilotId: binding.pilotId, budgetDay: '2026-09-12', capNanoUsd: 3_000_000_000,
        chargedNanoUsd: record?.chargedNanoUsd ?? 0, turnAttemptCount: record ? 1 : 0,
        accountingBlocked: false, existing: record,
      }, command);
      if (decision.ok) record = decision.record;
      return { storage: 'database', ...decision };
    },
  });
  return { adapter, operations, record: () => record };
}

function input(transport: LiveSessionTransport, budget: ReturnType<typeof harness>['adapter'], signal: AbortSignal): OpenLiveSessionInput {
  return {
    context, attemptId: binding.attemptId, requestHash: binding.requestHash,
    sdpOffer: 'v=0', maxDurationSeconds: 120, rateConfig: LIVE_RATE_CONFIG,
    budget, transport, deadline: new FakeDeadline(), now: () => 1_000_000, signal,
    cleanupTimeoutMs: 50,
  };
}

it('settles provider usage when the close signal is buffered before closeSession resolves', async () => {
  const h = harness(); const stream = bufferedStream(); const caller = new AbortController();
  const opened = await openLiveSession(input(transportFor(stream, true), h.adapter, caller.signal));
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  const session: LiveSessionRuntime = opened.session;
  const consuming = consumeProviderEvents(session, stream.events);
  await new Promise(resolve => setImmediate(resolve));
  caller.abort();
  await consuming;
  const finalized = await session.finalize();
  expect(finalized).toMatchObject({ status: 'settled', usageSeconds, chargedNanoUsd: liveMeasuredChargeNanoUsd(usageSeconds), confirmed: true });
  expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'settle']);
  expect(h.record()?.chargedNanoUsd).toBeLessThan(binding.reservedNanoUsd);
});

it('keeps a quiet provider conservative while still closing promptly', async () => {
  const h = harness(); const stream = bufferedStream(); const caller = new AbortController();
  const opened = await openLiveSession(input(transportFor(stream, false), h.adapter, caller.signal));
  expect(opened.ok).toBe(true);
  if (!opened.ok) return;
  const session = opened.session;
  const consuming = consumeProviderEvents(session, stream.events);
  await new Promise(resolve => setImmediate(resolve));
  caller.abort();
  await consuming;
  const finalized = await session.finalize();
  expect(finalized).toMatchObject({ status: 'unknown', retainedNanoUsd: binding.reservedNanoUsd });
  expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'mark_unknown']);
});
