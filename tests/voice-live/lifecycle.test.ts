import { test } from 'vitest';
import assert from 'node:assert/strict';
import { MAX_SESSION_DURATION_SECONDS } from '../../lib/voice-live/contracts';
import { openLiveSession, consumeProviderEvents, type LiveSessionRuntime } from '../../lib/voice-live/server-session';
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
