import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_SESSION_DURATION_SECONDS } from '../../lib/voice-live/contracts';
import { openLiveSession, consumeProviderEvents, type LiveSessionRuntime } from '../../lib/voice-live/server-session';
import { createCanonicalLiveBudgetAdapter } from '../../lib/voice-live/canonical-budget-adapter';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand } from '../../agents/coach-assistant/pilot-budget';
import { ASK_TROPHE_SHARED_PILOT_ID } from '../../lib/workout/shared-pilot-budget';
import { LIVE_PRICING_VERSION, LIVE_RATE_CONFIG, liveReservationNanoUsd } from '../../lib/voice-live/pricing';
import type { SessionAttemptBinding, SessionBudgetResult } from '../../lib/voice-live/budget-adapter';
import { ATTEMPT_ID, CONTEXT, FakeBudgetStore, FakeDeadline, FakeTransport, RATE_CONFIG, REQUEST_HASH } from './fakes';

const NOW = 1_000_000;

/** Wait until the runtime reaches `closed` (bounded microtask pumping). */
async function awaitClosed(session: LiveSessionRuntime): Promise<void> {
  for (let i = 0; i < 50 && session.state() !== 'closed'; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(session.state(), 'closed');
}

function base(overrides: Record<string, unknown> = {}) {
  return {
    context: CONTEXT,
    requestHash: REQUEST_HASH,
    sdpOffer: 'v=0 offer',
    maxDurationSeconds: 60,
    rateConfig: RATE_CONFIG,
    budget: new FakeBudgetStore(),
    transport: new FakeTransport(),
    deadline: new FakeDeadline(),
    now: () => NOW,
    signal: new AbortController().signal,
    attemptId: ATTEMPT_ID,
    ...overrides,
  };
}

test('invalid per-second rate fails closed before any store or transport call', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const outcome = await openLiveSession(base({ rateConfig: { perSecondRateNanoUsd: 0 }, budget, transport }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'invalid_rate');
  assert.equal(budget.calls.length, 0);
  assert.equal(transport.openedRequests.length, 0);
});

test('missing or browser-authority deadline refuses admission without reserving', async () => {
  for (const deadline of [undefined, { authority: 'browser' as unknown as 'server', arm: () => ({ cancel: () => {} }) }]) {
    const budget = new FakeBudgetStore();
    const transport = new FakeTransport();
    const outcome = await openLiveSession(base({ deadline, budget, transport }) as never);
    assert.equal(outcome.ok, false);
    assert.equal((outcome as { error: string }).error, 'deadline_unavailable');
    assert.equal(budget.calls.length, 0);
    assert.equal(transport.openedRequests.length, 0);
  }
});

test('durations beyond the hard bound are rejected (bounded max session length)', async () => {
  const outcome = await openLiveSession(base({ maxDurationSeconds: MAX_SESSION_DURATION_SECONDS + 1 }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'invalid_duration');
});

test('a blocked ledger never reaches the transport', async () => {
  const budget = new FakeBudgetStore({ blocked: true });
  const transport = new FakeTransport();
  const outcome = await openLiveSession(base({ budget, transport }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'budget_blocked');
  assert.equal(transport.openedRequests.length, 0);
});

test('reserve happens before connect and dispatch is required to open the transport', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const outcome = await openLiveSession(base({ budget, transport }) as never);
  assert.equal(outcome.ok, true);
  assert.deepEqual(budget.calls, ['reserve', 'claim_dispatch']);
  assert.equal(transport.openedRequests.length, 1);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'dispatched');
});

test('server watchdog is armed at now + maxDurationSeconds and cancelled on close', async () => {
  const deadline = new FakeDeadline();
  const outcome = await openLiveSession(base({ deadline }) as never);
  assert.equal(outcome.ok, true);
  assert.equal(deadline.armedAtMs, NOW + 60_000);
  await (outcome as { session: LiveSessionRuntime }).session.close('close_requested');
  assert.equal(deadline.cancelled, true);
});

test('deadline expiry drives a server close and retains reserve without confirmation', async () => {
  const deadline = new FakeDeadline();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const outcome = await openLiveSession(base({ deadline, budget, transport }) as never);
  assert.equal(outcome.ok, true);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  deadline.expireNow();
  await awaitClosed(session);
  assert.equal(transport.closedSessionIds.length, 1, 'server must actually close the provider session');
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
});

test('transport create failure retains the reserve and never reports success', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  transport.openThrow = true;
  const outcome = await openLiveSession(base({ budget, transport }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'transport_open_failed');
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('provider event stream drives observation and the usage replaces cumulatively', async () => {
  const outcome = await openLiveSession(base() as never);
  assert.equal(outcome.ok, true);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  await consumeProviderEvents(session, (async function* () {
    yield { type: 'session.started' };
    yield { type: 'session.usage.updated', usage: { seconds: 12 } };
    yield { type: 'session.usage.updated', usage: { seconds: 30 } };
    yield { type: 'session.closed', reason: 'close_requested' };
  })());
  const finalized = await session.finalize();
  // 30 replaces the earlier 12 (no summation); 30s > 15s init floor.
  assert.equal(finalized.status, 'settled');
  assert.equal((finalized as { usageSeconds: number }).usageSeconds, 30);
});

test('a caller abort between reserve and claim releases the reservation (no stuck full charge)', async () => {
  const controller = new AbortController();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const originalExecute = budget.execute.bind(budget);
  budget.execute = async (command: unknown, signal: AbortSignal) => {
    // The cancel lands exactly when the paid dispatch grant is required, after
    // the reservation committed but before any provider contact.
    if ((command as { operation: string }).operation === 'claim_dispatch') controller.abort();
    return originalExecute(command, signal);
  };
  const outcome = await openLiveSession(base({ budget, transport, signal: controller.signal }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'dispatch_not_granted');
  assert.equal(transport.openedRequests.length, 0);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'released');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 0);
});

test('a cancel racing the reserve write never leaves the reservation unreconciled', async () => {
  const controller = new AbortController();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const originalExecute = budget.execute.bind(budget);
  budget.execute = async (command: unknown, signal: AbortSignal) => {
    const result = await originalExecute(command, signal);
    // The store committed the `reserved` row, then the answer is lost to a
    // caller cancel: the outcome is `store_uncertain`, not a clean reserve.
    if ((command as { operation: string }).operation === 'reserve') controller.abort();
    return result;
  };
  const outcome = await openLiveSession(base({ budget, transport, signal: controller.signal }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'store_uncertain');
  assert.equal(transport.openedRequests.length, 0);
  // Never dispatched => the canonical `release_unstarted` transition reconciles
  // it (charge 0). `reserved -> unknown` is NOT a canonical transition; a
  // `mark_unknown` here would be rejected by the real ledger.
  assert.equal(budget.calls.filter((c) => c === 'mark_unknown').length, 0);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'released');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 0);
});

test('an idempotent retry of an already-dispatched attempt is never released or flipped', async () => {
  const budget = new FakeBudgetStore();
  const first = await openLiveSession(base({ budget }) as never);
  assert.equal(first.ok, true);
  const dispatched = budget.record(ATTEMPT_ID)!;
  assert.equal(dispatched.state, 'dispatched');

  const transport = new FakeTransport();
  const retry = await openLiveSession(base({ budget, transport }) as never);
  assert.equal(retry.ok, false);
  assert.equal((retry as { error: string }).error, 'dispatch_not_granted');
  assert.equal(transport.openedRequests.length, 0, 'a non-granted dispatch must never contact the provider');
  // The live row is untouched: never released, never marked unknown.
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'dispatched');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, dispatched.chargedNanoUsd);
});

// ---------------------------------------------------------------------------
// Canonical-adapter regressions (LIVE-RECOVERY-001).
//
// `FakeBudgetStore` is a double: it permits `reserved -> unknown`, a transition
// the real ledger REJECTS. These tests drive the ACTUAL canonical adapter +
// decider so reconciliation must use a transition the canonical contract
// permits. The canonical ledger's only never-dispatched reconciliation is the
// atomic `release_unstarted`, which refuses (`invalid_transition`) any row that
// has moved on — so it can zero a charge ONLY for a row still `reserved`.
// ---------------------------------------------------------------------------

const CANON_ACTOR = '00000000-0000-4000-8000-000000000002';
const CANON_ATTEMPT = '00000000-0000-4000-8000-000000000003';
const CANON_RUN = '00000000-0000-4000-8000-000000000004';
const CANON_TURN = '00000000-0000-4000-8000-000000000005';
const CANON_RESERVED = liveReservationNanoUsd(120);
const CANON_CAP = 3_000_000_000;
const CANON_BINDING: SessionAttemptBinding = {
  kind: 'voice',
  pilotId: ASK_TROPHE_SHARED_PILOT_ID,
  actorId: CANON_ACTOR,
  attemptId: CANON_ATTEMPT,
  agentRunId: CANON_RUN,
  turnId: CANON_TURN,
  requestHash: 'a'.repeat(64),
  model: 'gpt-live-1',
  pricingVersion: LIVE_PRICING_VERSION,
  reservedNanoUsd: CANON_RESERVED,
  maxDurationSeconds: 120,
};

function canonicalHarness(options: {
  /** Abort the caller once this operation has committed (answer becomes uncertain). */
  readonly abortAfterCommit?: PilotBudgetCommand['operation'];
  /** Abort the caller and answer `cancelled` WITHOUT committing this operation. */
  readonly cancelWithoutCommit?: PilotBudgetCommand['operation'];
  /** Throw AFTER committing this operation (persisted row exists, answer lost). */
  readonly throwAfterCommit?: PilotBudgetCommand['operation'];
  /** Throw BEFORE committing this operation (the reconciliation cannot be confirmed). */
  readonly throwOn?: PilotBudgetCommand['operation'];
  /** Force `accountingBlocked` for exactly this operation so its admission fails. */
  readonly blockOperation?: PilotBudgetCommand['operation'];
} = {}) {
  let record: PilotAttemptRecord | undefined;
  let caller: AbortController | null = null;
  const operations: PilotBudgetCommand['operation'][] = [];
  const adapter = createCanonicalLiveBudgetAdapter(CANON_ACTOR, {
    async execute(command: PilotBudgetCommand) {
      operations.push(command.operation);
      if (options.cancelWithoutCommit === command.operation) {
        caller?.abort();
        return { storage: 'database', ok: false, error: 'cancelled' } as const;
      }
      if (options.throwOn === command.operation) throw new Error('ledger write failed');
      const decision = decidePilotBudgetCommand(
        {
          pilotId: ASK_TROPHE_SHARED_PILOT_ID,
          budgetDay: '2026-09-12',
          capNanoUsd: CANON_CAP,
          chargedNanoUsd: record?.chargedNanoUsd ?? 0,
          turnAttemptCount: record ? 1 : 0,
          accountingBlocked: options.blockOperation === command.operation,
          existing: record,
        },
        command,
      );
      if (decision.ok) record = decision.record;
      if (options.abortAfterCommit === command.operation) caller?.abort();
      if (options.throwAfterCommit === command.operation) throw new Error('ledger answer lost');
      return { storage: 'database', ...decision };
    },
  });
  return { adapter, operations, record: () => record, useCaller: (c: AbortController) => { caller = c; } };
}

function canonicalBase(overrides: Record<string, unknown>) {
  return {
    context: {
      actorId: CANON_ACTOR,
      organizationId: null,
      pilotId: ASK_TROPHE_SHARED_PILOT_ID,
      conversationId: CANON_TURN,
      turnId: CANON_TURN,
      agentRunId: CANON_RUN,
    },
    requestHash: 'a'.repeat(64),
    sdpOffer: 'v=0 offer',
    maxDurationSeconds: 120,
    rateConfig: LIVE_RATE_CONFIG,
    budget: canonicalHarness().adapter,
    transport: new FakeTransport(),
    deadline: new FakeDeadline(),
    now: () => 0,
    signal: new AbortController().signal,
    attemptId: CANON_ATTEMPT,
    ...overrides,
  };
}

test('canonical contract: reserved -> unknown is illegal; release_unstarted is the permitted reconciliation', async () => {
  const h = canonicalHarness();
  const s = new AbortController().signal;
  const reserved = (await h.adapter.execute({ operation: 'reserve', binding: CANON_BINDING }, s)) as SessionBudgetResult;
  assert.equal(reserved.ok, true);
  // The reconciliation the previous candidate attempted is REFUSED by the
  // canonical decider, which is exactly why the fake-only test masked the bug.
  assert.deepEqual(await h.adapter.execute({ operation: 'mark_unknown', binding: CANON_BINDING, reason: 'reserve outcome uncertain' }, s), {
    ok: false,
    storage: 'database',
    error: 'invalid_transition',
  });
  assert.equal(h.record()?.state, 'reserved');
  assert.equal(h.record()?.chargedNanoUsd, CANON_RESERVED);
  // The atomic release is the canonical transition: charge zero, never unknown.
  const released = (await h.adapter.execute({ operation: 'release_unstarted', binding: CANON_BINDING }, s)) as SessionBudgetResult;
  assert.equal(released.ok, true);
  assert.equal(h.record()?.state, 'released');
  assert.equal(h.record()?.chargedNanoUsd, 0);
});

test('canonical: a cancel racing the reserve commit releases the never-dispatched row (no stuck charge)', async () => {
  const caller = new AbortController();
  const h = canonicalHarness({ abortAfterCommit: 'reserve' });
  h.useCaller(caller);
  const transport = new FakeTransport();
  const outcome = await openLiveSession(canonicalBase({ budget: h.adapter, transport, signal: caller.signal }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'store_uncertain');
  assert.deepEqual(h.operations, ['reserve', 'release_unstarted']);
  assert.equal(transport.openedRequests.length, 0, 'a never-granted dispatch must not contact the provider');
  assert.equal(h.record()?.state, 'released');
  assert.equal(h.record()?.chargedNanoUsd, 0);
});

test('canonical: a lost reserve response (committed then thrown) is released, not left reserved', async () => {
  const h = canonicalHarness({ throwAfterCommit: 'reserve' });
  const transport = new FakeTransport();
  const outcome = await openLiveSession(canonicalBase({ budget: h.adapter, transport }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'store_uncertain');
  assert.deepEqual(h.operations, ['reserve', 'release_unstarted']);
  assert.equal(transport.openedRequests.length, 0);
  assert.equal(h.record()?.state, 'released');
  assert.equal(h.record()?.chargedNanoUsd, 0);
});

test('canonical: a cancel between reserve and claim releases via an independent signal (not the poisoned caller signal)', async () => {
  const caller = new AbortController();
  const h = canonicalHarness({ cancelWithoutCommit: 'claim_dispatch' });
  h.useCaller(caller);
  const transport = new FakeTransport();
  const outcome = await openLiveSession(canonicalBase({ budget: h.adapter, transport, signal: caller.signal }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'dispatch_not_granted');
  assert.deepEqual(h.operations, ['reserve', 'claim_dispatch', 'release_unstarted']);
  assert.equal(transport.openedRequests.length, 0);
  assert.equal(h.record()?.state, 'released');
  assert.equal(h.record()?.chargedNanoUsd, 0);
});

test('canonical: an idempotent retry of an already-dispatched attempt is never released or undercharged', async () => {
  const h = canonicalHarness();
  const first = await openLiveSession(canonicalBase({ budget: h.adapter, transport: new FakeTransport() }) as never);
  assert.equal(first.ok, true);
  assert.deepEqual(h.operations, ['reserve', 'claim_dispatch']);
  assert.equal(h.record()?.state, 'dispatched');
  assert.equal(h.record()?.chargedNanoUsd, CANON_RESERVED);

  const transport = new FakeTransport();
  const retry = await openLiveSession(canonicalBase({ budget: h.adapter, transport }) as never);
  assert.equal(retry.ok, false);
  assert.equal((retry as { error: string }).error, 'dispatch_not_granted');
  assert.equal(transport.openedRequests.length, 0, 'a non-granted dispatch must never contact the provider');
  // release_unstarted refuses a `dispatched` row: the full charge is preserved.
  assert.deepEqual(h.operations, ['reserve', 'claim_dispatch', 'reserve', 'claim_dispatch', 'release_unstarted']);
  assert.equal(h.record()?.state, 'dispatched');
  assert.equal(h.record()?.chargedNanoUsd, CANON_RESERVED);
});

test('canonical: an unconfirmed cleanup never zeroes the reserve and never fabricates unknown', async () => {
  // Claim admission fails (never dispatched) and the release write itself fails:
  // the row must stay `reserved` with the FULL charge, not released, not unknown.
  const h = canonicalHarness({ blockOperation: 'claim_dispatch', throwOn: 'release_unstarted' });
  const transport = new FakeTransport();
  const outcome = await openLiveSession(canonicalBase({ budget: h.adapter, transport }) as never);
  assert.equal(outcome.ok, false);
  assert.equal((outcome as { error: string }).error, 'dispatch_not_granted');
  assert.deepEqual(h.operations, ['reserve', 'claim_dispatch', 'release_unstarted']);
  assert.equal(transport.openedRequests.length, 0);
  assert.equal(h.record()?.state, 'reserved');
  assert.equal(h.record()?.chargedNanoUsd, CANON_RESERVED);
});
