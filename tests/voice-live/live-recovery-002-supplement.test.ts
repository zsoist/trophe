/**
 * LIVE-RECOVERY-002 supplement.
 *
 * The reviewer holdout (reproduced verbatim as `live-recovery-002-holdout.test.ts`)
 * proves the reserve-uncertain cleanup is bounded even when the store ignores
 * `AbortSignal`. These cases pin the rest of the required contract:
 *   - the bound applies to the AWAIT, not merely to an abort signal;
 *   - while the release is unconfirmed the committed `reserved` row keeps its
 *     FULL charge (conservative over-retention, never a false zeroing);
 *   - a late rejection after the bound is observed (no unhandled rejection);
 *   - a late release success after the bound never triggers a provider dispatch.
 *
 * OFF-LINE / INJECTED: real canonical adapter + decider over an in-memory store;
 * no DB, provider, network, browser, ledger-schema, cap or pricing changes.
 */
import { expect, it, vi } from 'vitest';
import {
  decidePilotBudgetCommand,
  type PilotAttemptRecord,
  type PilotBudgetCommand,
} from '../../agents/coach-assistant/pilot-budget';
import { createCanonicalLiveBudgetAdapter } from '../../lib/voice-live/canonical-budget-adapter';
import { ASK_TROPHE_SHARED_PILOT_ID } from '../../lib/workout/shared-pilot-budget';
import { LIVE_PRICING_VERSION, LIVE_RATE_CONFIG, liveReservationNanoUsd } from '../../lib/voice-live/pricing';
import type { SessionAttemptBinding } from '../../lib/voice-live/budget-adapter';
import { openLiveSession, type OpenLiveSessionInput } from '../../lib/voice-live/server-session';
import { FakeDeadline, FakeTransport } from './fakes';

const actorId = '00000000-0000-4000-8000-000000000002';
const binding: SessionAttemptBinding = {
  kind: 'voice',
  pilotId: ASK_TROPHE_SHARED_PILOT_ID,
  actorId,
  attemptId: '00000000-0000-4000-8000-000000000003',
  agentRunId: '00000000-0000-4000-8000-000000000004',
  turnId: '00000000-0000-4000-8000-000000000005',
  requestHash: 'a'.repeat(64),
  model: 'gpt-live-1',
  pricingVersion: LIVE_PRICING_VERSION,
  maxDurationSeconds: 120,
  reservedNanoUsd: liveReservationNanoUsd(120),
};

/** A minimal input whose store always answers `not_found` unless overridden. */
function recoveryInput(overrides: Partial<OpenLiveSessionInput> = {}): OpenLiveSessionInput {
  const base: OpenLiveSessionInput = {
    context: {
      actorId,
      organizationId: null,
      pilotId: binding.pilotId,
      conversationId: binding.turnId,
      turnId: binding.turnId,
      agentRunId: binding.agentRunId,
    },
    attemptId: binding.attemptId,
    requestHash: binding.requestHash,
    sdpOffer: 'v=0',
    maxDurationSeconds: 120,
    rateConfig: LIVE_RATE_CONFIG,
    budget: { execute: async () => ({ storage: 'database', ok: false, error: 'not_found' }) },
    transport: new FakeTransport(),
    deadline: new FakeDeadline(),
    now: () => 0,
    signal: new AbortController().signal,
  };
  return { ...base, ...overrides };
}

it('AG4 unconfirmed cleanup keeps the committed reserve at full charge and never dispatches', async () => {
  vi.useFakeTimers();
  try {
    let record: PilotAttemptRecord | undefined;
    let releaseAttempted = false;
    const adapter = createCanonicalLiveBudgetAdapter(actorId, {
      execute: async (command: PilotBudgetCommand) => {
        if (command.operation === 'release_unstarted') {
          releaseAttempted = true;
          return new Promise(() => {}); // ignores AbortSignal: the release never settles
        }
        const decision = decidePilotBudgetCommand(
          {
            pilotId: binding.pilotId,
            budgetDay: '2026-09-12',
            capNanoUsd: 3_000_000_000,
            chargedNanoUsd: record?.chargedNanoUsd ?? 0,
            turnAttemptCount: record ? 1 : 0,
            accountingBlocked: false,
            existing: record,
          },
          command,
        );
        if (decision.ok) record = decision.record;
        // The reserve COMMITTED, then its answer is lost -> outcome is uncertain.
        if (command.operation === 'reserve') throw new Error('reserve answer lost after commit');
        return { storage: 'database', ...decision };
      },
    });
    const transport = new FakeTransport();
    const pending = openLiveSession(recoveryInput({ budget: adapter, transport }));
    await vi.advanceTimersByTimeAsync(6000);
    const opened = await pending;
    expect(opened.ok).toBe(false);
    expect((opened as { error: string }).error).toBe('store_uncertain');
    expect(releaseAttempted).toBe(true);
    expect(transport.openedRequests.length).toBe(0);
    // The release was never confirmed: the canonical row stays `reserved` and
    // keeps the FULL charge (conservative over-retention, no false zeroing).
    expect(record?.state).toBe('reserved');
    expect(record?.chargedNanoUsd).toBe(binding.reservedNanoUsd);
  } finally {
    vi.useRealTimers();
  }
});

it('AG4 a late cleanup rejection after the bound is observed, never unhandled', async () => {
  const realSetTimeout = globalThis.setTimeout;
  vi.useFakeTimers();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    let rejectRelease: ((error: unknown) => void) | undefined;
    const budget = {
      execute: async (command: { operation: string }) => {
        if (command.operation === 'reserve') return { storage: 'database', ok: false, error: 'uncertain' };
        return new Promise((_resolve, reject) => {
          rejectRelease = reject;
        });
      },
    };
    const pending = openLiveSession(recoveryInput({ budget: budget as never }));
    await vi.advanceTimersByTimeAsync(6000);
    const opened = await pending;
    expect(opened.ok).toBe(false);
    expect((opened as { error: string }).error).toBe('store_uncertain');
    // The store only fails AFTER admission already returned `store_uncertain`.
    rejectRelease?.(new Error('late ledger failure'));
    await new Promise((resolve) => realSetTimeout(resolve, 0));
    await new Promise((resolve) => realSetTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    vi.useRealTimers();
  }
});

it('AG4 a late cleanup success after the bound never triggers a second provider call', async () => {
  vi.useFakeTimers();
  try {
    let releaseAttempted = false;
    let settleRelease: (() => void) | undefined;
    const budget = {
      execute: async (command: { operation: string }) => {
        if (command.operation === 'reserve') return { storage: 'database', ok: false, error: 'uncertain' };
        releaseAttempted = true;
        return new Promise((resolve) => {
          settleRelease = () => resolve({ storage: 'database', ok: false, error: 'not_found' });
        });
      },
    };
    const transport = new FakeTransport();
    const pending = openLiveSession(recoveryInput({ budget: budget as never, transport }));
    await vi.advanceTimersByTimeAsync(6000);
    const opened = await pending;
    expect(opened.ok).toBe(false);
    expect(releaseAttempted).toBe(true);
    expect(transport.openedRequests.length).toBe(0);
    // Late settlement arrives after admission already failed: still no dispatch.
    settleRelease?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(transport.openedRequests.length).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
