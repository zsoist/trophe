/**
 * AG4 REQUEST_CHANGES regressions (isolated live-implementation).
 *
 * P1-a: the server watchdog was armed only AFTER `openSession` returned, so a
 *        hanging paid create was unbounded. It must be armed BEFORE the create,
 *        and a create that resolves late must be cleaned up.
 * P1-b: `session.closed` with no valid provider usage left cumulative seconds
 *        at 0 and then settled at the 15 s floor — inferring usage. It must
 *        instead retain the full reserve via mark_unknown.
 * P1-c: `consumeProviderEvents` swallowed nothing: a stream error/abort leaked
 *        the reservation, and an already-aborted parent signal poisoned the
 *        accounting call. Cleanup must be bounded and use an independent signal.
 * P1-d: `runtime.close` awaited `transport.closeSession` unbounded, so an
 *        adapter that ignores its abort could hang before `mark_unknown`. The
 *        close must be bounded/raced and still reconcile the reserve exactly
 *        once (idempotent close/finalize, no pending rejection leak).
 * P1-e: a caller abort/logout AFTER open was not bound to the runtime, so a
 *        QUIET (non-yielding) provider stream blocked until an event/deadline.
 *        The runtime must register the caller abort immediately, consume
 *        provider events, and stop promptly without waiting on `iterator.return`.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { openLiveSession, consumeProviderEvents, type LiveSessionRuntime } from '../../lib/voice-live/server-session';
import type { ProviderSessionEvent } from '../../lib/voice-live/contracts';
import { ATTEMPT_ID, CONTEXT, FakeBudgetStore, FakeDeadline, FakeTransport, RATE_CONFIG, REQUEST_HASH } from './fakes';

const NOW = 1_000_000;

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

/** Bound a possibly-hanging promise so a regression fails instead of hanging. */
async function withGuard<T>(promise: Promise<T>, ms = 2000): Promise<T | 'TIMEOUT'> {
  return Promise.race([
    promise,
    new Promise<'TIMEOUT'>((resolve) => setTimeout(() => resolve('TIMEOUT'), ms)),
  ]);
}

async function pumpUntil(predicate: () => boolean, rounds = 50): Promise<void> {
  for (let i = 0; i < rounds && !predicate(); i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

test('P1-a: a hanging create is bounded by a deadline armed BEFORE the paid create', async () => {
  const deadline = new FakeDeadline();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  transport.holdOpen = true;

  const outcomePromise = openLiveSession(base({ deadline, budget, transport }) as never);
  await pumpUntil(() => transport.openAttempts > 0);
  assert.equal(transport.openAttempts, 1, 'the paid create must have been entered');
  assert.equal(deadline.armedAtMs, NOW + 60_000, 'the deadline must be armed before/at the create');

  deadline.expireNow();
  const outcome = await withGuard(outcomePromise);
  assert.notEqual(outcome, 'TIMEOUT', 'a hanging create must be bounded, never left pending');
  assert.equal((outcome as { ok: boolean }).ok, false);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-a: a create resolving after the deadline is cleaned up and retains the reserve', async () => {
  const deadline = new FakeDeadline();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  transport.holdOpen = true;
  transport.ignoreAbort = true;

  const outcomePromise = openLiveSession(base({ deadline, budget, transport }) as never);
  await pumpUntil(() => transport.openAttempts > 0);
  deadline.expireNow();
  transport.releaseOpen();

  const outcome = await withGuard(outcomePromise);
  assert.notEqual(outcome, 'TIMEOUT', 'late success must not leave the create unresolved');
  assert.equal((outcome as { ok: boolean }).ok, false);
  assert.equal(transport.closedSessionIds.length, 1, 'a late success must be closed by the server');
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-b: session.closed with no valid usage retains the full reserve (no inferred zero)', async () => {
  const budget = new FakeBudgetStore();
  const outcome = await openLiveSession(base({ budget }) as never);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  session.observe({ type: 'session.started' }, 'provider');
  session.observe({ type: 'session.closed', reason: 'remote_hangup' }, 'provider');
  const finalized = await session.finalize();
  assert.equal(finalized.status, 'unknown');
  assert.equal((finalized as { retainedNanoUsd: number }).retainedNanoUsd, 75_000_000);
  assert.equal(budget.calls.includes('settle'), false, 'no settle may be inferred without provider usage');
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-b: an explicit provider usage of zero IS valid and settles at the 15s floor', async () => {
  const budget = new FakeBudgetStore();
  const outcome = await openLiveSession(base({ budget }) as never);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  session.observe({ type: 'session.usage.updated', usage: { seconds: 0 } }, 'provider');
  session.observe({ type: 'session.closed', reason: 'close_requested' }, 'provider');
  const finalized = await session.finalize();
  assert.equal(finalized.status, 'settled');
  assert.equal((finalized as { chargedNanoUsd: number }).chargedNanoUsd, 15_000_000);
});

test('P1-c: a streaming error closes and retains the reserve even when the caller signal is aborted', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const caller = new AbortController();
  const outcome = await openLiveSession(base({ budget, transport, signal: caller.signal }) as never);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  caller.abort();
  await consumeProviderEvents(session, (async function* () {
    yield { type: 'session.started' };
    throw new Error('stream reset');
  })());
  await session.finalize();
  assert.equal(session.state(), 'closed');
  assert.equal(transport.closedSessionIds.length, 1);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-c: a stream ending without session.closed closes and retains the reserve', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const outcome = await openLiveSession(base({ budget, transport }) as never);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  await consumeProviderEvents(session, (async function* () {
    yield { type: 'session.started' };
    yield { type: 'session.usage.updated', usage: { seconds: 12 } };
  })());
  assert.equal(session.state(), 'closed');
  assert.equal(transport.closedSessionIds.length, 1);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-d: a close the adapter never resolves is bounded and still reaches mark_unknown', async () => {
  const deadline = new FakeDeadline();
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  transport.holdClose = true; // adapter ignores the abort and never resolves

  const outcome = await openLiveSession(
    base({ deadline, budget, transport, cleanupTimeoutMs: 20 }) as never,
  );
  assert.equal((outcome as { ok: boolean }).ok, true);
  const session = (outcome as { session: LiveSessionRuntime }).session;

  // Server-initiated close (deadline) against a hanging transport.
  deadline.expireNow();
  const finalized = await withGuard(session.finalize());
  assert.notEqual(finalized, 'TIMEOUT', 'a hanging transport close must never hang shutdown');
  assert.equal((finalized as { status: string }).status, 'unknown');

  // Duplicate closes stay idempotent: exactly one transport close, one reconcile.
  await withGuard(session.close('close_requested'));
  assert.equal(session.state(), 'closed');
  assert.equal(transport.closedSessionIds.length, 1, 'the provider close is attempted exactly once');
  assert.equal(budget.calls.filter((c) => c === 'mark_unknown').length, 1, 'reconcile exactly once');
  assert.equal(budget.calls.includes('settle'), false);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('P1-e: a caller abort after open stops a QUIET stream promptly and closes exactly once', async () => {
  const budget = new FakeBudgetStore();
  const transport = new FakeTransport();
  const caller = new AbortController();
  const outcome = await openLiveSession(base({ budget, transport, signal: caller.signal }) as never);
  assert.equal((outcome as { ok: boolean }).ok, true);
  const session = (outcome as { session: LiveSessionRuntime }).session;

  // A QUIET sideband stream: `next()` and `return()` never settle.
  const quiet: AsyncIterable<ProviderSessionEvent> = {
    [Symbol.asyncIterator](): AsyncIterator<ProviderSessionEvent> {
      return {
        next: () => new Promise<IteratorResult<ProviderSessionEvent>>(() => {}),
        return: () => new Promise<IteratorResult<ProviderSessionEvent>>(() => {}),
      };
    },
  };
  const consuming = consumeProviderEvents(session, quiet);
  await new Promise((resolve) => setImmediate(resolve)); // let the loop start
  caller.abort(); // logout/abort after open

  const done = await withGuard(consuming);
  assert.notEqual(done, 'TIMEOUT', 'an abort must not wait on a non-yielding stream');
  await session.finalize();
  assert.equal(session.state(), 'closed');
  assert.equal(transport.closedSessionIds.length, 1, 'the provider close is attempted exactly once');
  assert.equal(budget.calls.filter((c) => c === 'mark_unknown').length, 1);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});
