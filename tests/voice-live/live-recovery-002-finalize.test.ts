/**
 * LIVE-RECOVERY-002 — finalize / End cancellation recovery.
 *
 * The remaining user-visible gap in the SAME lifecycle: `createRuntime.finalize()`
 * awaited `markSessionAttemptUnknown` / `settleSessionAttempt` directly with a
 * bounded *signal* but an UNBOUNDED await. Because `runtime.close()` awaits
 * `finalize()`, a store that ignores `AbortSignal` left the End pending forever.
 *
 * These cases pin the repair, driven by the ACTUAL canonical adapter + decider
 * over a deferred in-memory store:
 *   - the finalization store AWAIT is bounded (both the mark_unknown and the
 *     settle branch), so End/close/finalize always settle;
 *   - an unconfirmed outcome returns the truthful `unknown` result with the FULL
 *     reserve retained — never `settled`/`confirmed:true`, never a zero charge;
 *   - a late rejection after the bound is observed (no unhandled rejection);
 *   - a late successful settlement neither settles twice nor triggers another
 *     ledger action, dispatch or provider close;
 *   - duplicate End/finalize share one closePromise/settlePromise and reconcile
 *     exactly once.
 *
 * OFF-LINE / INJECTED: real canonical adapter + decider over an in-memory store;
 * no DB, provider, network, browser, ledger-schema, cap, pricing or route change.
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
import { openLiveSession, type LiveSessionRuntime, type OpenLiveSessionInput } from '../../lib/voice-live/server-session';
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

/** Injected via `openLiveSession` so the finalize race uses a short, real bound. */
const CLEANUP_MS = 20;

function base(overrides: Partial<OpenLiveSessionInput> = {}): OpenLiveSessionInput {
  const input: OpenLiveSessionInput = {
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
    cleanupTimeoutMs: CLEANUP_MS,
  };
  return { ...input, ...overrides };
}

/**
 * Real canonical adapter + decider over an in-memory record. One operation can be
 * HELD: its store answer neither settles nor honours the abort (a store that
 * ignores `AbortSignal`), so only the caller-side bound can end the wait. The
 * held answer can be resolved (with a real canonical decision) or rejected later.
 */
function harness(options: { hold?: PilotBudgetCommand['operation'] } = {}) {
  let record: PilotAttemptRecord | undefined;
  const operations: PilotBudgetCommand['operation'][] = [];
  let settleHeld: (() => void) | null = null;
  let rejectHeld: ((error: unknown) => void) | null = null;

  function decide(command: PilotBudgetCommand) {
    return decidePilotBudgetCommand(
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
  }

  const execute = async (command: PilotBudgetCommand): Promise<unknown> => {
    operations.push(command.operation);
    if (options.hold === command.operation) {
      return new Promise((resolve, reject) => {
        // Deliberately ignores `AbortSignal`: the answer only arrives if we
        // release/reject it, exactly like a store that never observes abort.
        settleHeld = () => {
          const decision = decide(command);
          if (decision.ok) record = decision.record;
          resolve({ storage: 'database', ...decision });
        };
        rejectHeld = reject;
      });
    }
    const decision = decide(command);
    if (decision.ok) record = decision.record;
    return { storage: 'database', ...decision };
  };

  return {
    adapter: createCanonicalLiveBudgetAdapter(actorId, { execute }),
    operations,
    record: () => record,
    releaseHeld: () => settleHeld?.(),
    rejectHeld: (error: unknown) => rejectHeld?.(error),
  };
}

it('a missing-usage finalize is bounded even when mark_unknown ignores abort (End never hangs)', async () => {
  vi.useFakeTimers();
  try {
    const h = harness({ hold: 'mark_unknown' });
    const transport = new FakeTransport();
    const opened = await openLiveSession(base({ budget: h.adapter, transport }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const session: LiveSessionRuntime = opened.session;

    // No provider `session.closed` -> finalize takes the mark_unknown branch.
    const ending = session.close('close_requested');
    await vi.advanceTimersByTimeAsync(CLEANUP_MS + 5);
    await ending; // must resolve; the store answer never arrives
    expect(session.state()).toBe('closed');

    const finalized = await session.finalize();
    expect(finalized).toMatchObject({ status: 'unknown', retainedNanoUsd: binding.reservedNanoUsd });
    expect((finalized as { confirmed?: boolean }).confirmed).toBeUndefined();

    // Reconciliation was attempted exactly once; the row was NOT zeroed and NOT
    // fabricated into any terminal state (the store answer is unconfirmed).
    expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'mark_unknown']);
    expect(h.record()?.state).toBe('dispatched');
    expect(h.record()?.chargedNanoUsd).toBe(binding.reservedNanoUsd);
    expect(transport.closedSessionIds.length).toBe(1);
  } finally {
    vi.useRealTimers();
  }
});

it('a valid provider close+usage settlement is bounded; unconfirmed settle is never claimed', async () => {
  vi.useFakeTimers();
  try {
    const h = harness({ hold: 'settle' });
    const transport = new FakeTransport();
    const opened = await openLiveSession(base({ budget: h.adapter, transport }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const session = opened.session;

    session.observe({ type: 'session.usage.updated', usage: { seconds: 60 } }, 'provider');
    session.observe({ type: 'session.closed', reason: 'close_requested' }, 'provider');

    const ending = session.close('close_requested');
    await vi.advanceTimersByTimeAsync(CLEANUP_MS + 5);
    await ending;
    expect(session.state()).toBe('closed');
    // The provider already signalled `session.closed`, so the server does not
    // re-close it; the End here is driven by finalize() settling.
    expect(transport.closedSessionIds.length).toBe(0);

    const finalized = await session.finalize();
    // Provider usage WAS observed, but the settlement answer never came back:
    // the result must NOT claim `settled`/`confirmed:true` and must NOT assume
    // zero — it retains the FULL reserve conservatively.
    expect(finalized.status).toBe('unknown');
    expect((finalized as { confirmed?: boolean }).confirmed).toBeUndefined();
    expect((finalized as { chargedNanoUsd?: number }).chargedNanoUsd).toBeUndefined();
    expect((finalized as { retainedNanoUsd: number }).retainedNanoUsd).toBe(binding.reservedNanoUsd);

    expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'settle']);
    expect(h.record()?.state).toBe('dispatched');
    expect(h.record()?.chargedNanoUsd).toBe(binding.reservedNanoUsd);

    // The store commits only AFTER the bound: a late success must not settle a
    // second time, take another ledger action, dispatch again, or close twice.
    h.releaseHeld();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'settle']);
    expect(transport.closedSessionIds.length).toBe(0);
    expect(transport.openedRequests.length).toBe(1);
    expect(h.record()?.state).toBe('settled');

    const repeat = await session.finalize();
    expect(repeat).toEqual(finalized);
    expect(h.operations.length).toBe(3);
  } finally {
    vi.useRealTimers();
  }
});

it('a late finalization rejection after the bound is observed, never unhandled', async () => {
  const realSetTimeout = globalThis.setTimeout;
  vi.useFakeTimers();
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);
  try {
    const h = harness({ hold: 'mark_unknown' });
    const transport = new FakeTransport();
    const opened = await openLiveSession(base({ budget: h.adapter, transport }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const session = opened.session;

    const ending = session.close('close_requested');
    await vi.advanceTimersByTimeAsync(CLEANUP_MS + 5);
    await ending;
    await session.finalize();

    // The store only fails AFTER finalization already returned conservatively.
    h.rejectHeld(new Error('late ledger rejection'));
    await new Promise((resolve) => realSetTimeout(resolve, 0));
    await new Promise((resolve) => realSetTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  } finally {
    process.off('unhandledRejection', onUnhandled);
    vi.useRealTimers();
  }
});

it('duplicate End + finalize share one close/settle and reconcile exactly once', async () => {
  vi.useFakeTimers();
  try {
    const h = harness({ hold: 'mark_unknown' });
    const transport = new FakeTransport();
    const opened = await openLiveSession(base({ budget: h.adapter, transport }));
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const session = opened.session;

    const end1 = session.close('close_requested');
    const end2 = session.close('connection_lost');
    const fin1 = session.finalize();
    const fin2 = session.finalize();
    await vi.advanceTimersByTimeAsync(CLEANUP_MS + 5);
    await Promise.all([end1, end2]);
    const [r1, r2] = await Promise.all([fin1, fin2]);

    expect(r1).toEqual(r2);
    expect(r1.status).toBe('unknown');
    expect((r1 as { retainedNanoUsd: number }).retainedNanoUsd).toBe(binding.reservedNanoUsd);
    // Exactly one reconcile and one provider close despite two Ends + finalizes.
    expect(h.operations).toEqual(['reserve', 'claim_dispatch', 'mark_unknown']);
    expect(transport.closedSessionIds.length).toBe(1);
    expect(h.record()?.chargedNanoUsd).toBe(binding.reservedNanoUsd);
  } finally {
    vi.useRealTimers();
  }
});
