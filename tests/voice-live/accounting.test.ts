import { test } from 'vitest';
import assert from 'node:assert/strict';
import { finalVoiceChargeNanoUsd, computeReservationBreakdown, parseSessionRateConfig } from '../../lib/voice-live/contracts';
import {
  settleBackendAttempt,
  settleSessionAttempt,
  type SessionAttemptBinding,
} from '../../lib/voice-live/budget-adapter';
import { openLiveSession, type LiveSessionRuntime } from '../../lib/voice-live/server-session';
import { ATTEMPT_ID, CONTEXT, FakeBudgetStore, FakeDeadline, FakeTransport, RATE_CONFIG, REQUEST_HASH } from './fakes';

const SIGNAL = new AbortController().signal;

function voiceBinding(reservedNanoUsd: number): SessionAttemptBinding {
  return {
    kind: 'voice',
    pilotId: CONTEXT.pilotId,
    actorId: CONTEXT.actorId,
    attemptId: ATTEMPT_ID,
    agentRunId: CONTEXT.agentRunId,
    turnId: CONTEXT.turnId,
    requestHash: REQUEST_HASH,
    model: 'gpt-live-1',
    pricingVersion: RATE_CONFIG.pricingVersion,
    reservedNanoUsd,
    maxDurationSeconds: 60,
  };
}

test('reservation credits the 15s initialization as a minimum, not an addend', () => {
  const rate = parseSessionRateConfig(RATE_CONFIG);
  assert.ok(rate.ok);
  const short = computeReservationBreakdown(rate.value, 10);
  assert.equal(short.ok, true);
  // 10s window still reserves the 15s initialization floor.
  assert.equal((short as { value: { billableSeconds: number } }).value.billableSeconds, 15);
  const long = computeReservationBreakdown(rate.value, 60);
  assert.equal((long as { value: { durationReserveNanoUsd: number } }).value.durationReserveNanoUsd, 60_000_000);
  assert.equal((long as { value: { totalNanoUsd: number } }).value.totalNanoUsd, 75_000_000);
});

test('final charge floors a short session at the initialization credit', () => {
  const rate = parseSessionRateConfig(RATE_CONFIG);
  assert.ok(rate.ok);
  const charge = finalVoiceChargeNanoUsd(rate.value, 5);
  assert.equal(charge.ok, true);
  assert.equal((charge as { value: number }).value, 15_000_000);
});

test('client-supplied payloads are rejected and never change usage', async () => {
  const transport = new FakeTransport();
  const outcome = await openLiveSession({
    context: CONTEXT, requestHash: REQUEST_HASH, sdpOffer: 'v=0', maxDurationSeconds: 60,
    rateConfig: RATE_CONFIG, budget: new FakeBudgetStore(), transport, deadline: new FakeDeadline(),
    now: () => 0, signal: SIGNAL, attemptId: ATTEMPT_ID,
  });
  assert.equal(outcome.ok, true);
  const session = (outcome as { session: LiveSessionRuntime }).session;
  const rejected = session.observe({ type: 'session.usage.updated', usage: { seconds: 999 } }, 'client');
  assert.equal(rejected.accepted, false);
  assert.equal(rejected.reason, 'client_payload_not_authoritative');
  session.observe({ type: 'session.usage.updated', usage: { seconds: 20 } }, 'provider');
  session.observe({ type: 'session.closed', reason: 'close_requested' }, 'provider');
  const finalized = await session.finalize();
  assert.equal((finalized as { usageSeconds: number }).usageSeconds, 20);
});

test('settle is idempotent and provider-trusted (repeat finalize settles once)', async () => {
  const budget = new FakeBudgetStore();
  const outcome = await openLiveSession({
    context: CONTEXT, requestHash: REQUEST_HASH, sdpOffer: 'v=0', maxDurationSeconds: 60,
    rateConfig: RATE_CONFIG, budget, transport: new FakeTransport(), deadline: new FakeDeadline(),
    now: () => 0, signal: SIGNAL, attemptId: ATTEMPT_ID,
  });
  const session = (outcome as { session: LiveSessionRuntime }).session;
  session.observe({ type: 'session.usage.updated', usage: { seconds: 30 } }, 'provider');
  session.observe({ type: 'session.closed', reason: 'close_requested' }, 'provider');
  const first = await session.finalize();
  const second = await session.finalize();
  assert.deepEqual(first, second);
  assert.equal((first as { chargedNanoUsd: number }).chargedNanoUsd, 30_000_000);
  assert.equal(budget.calls.filter((c) => c === 'settle').length, 1);
});

test('missing session.closed retains the full reservation (unknown)', async () => {
  const budget = new FakeBudgetStore();
  const outcome = await openLiveSession({
    context: CONTEXT, requestHash: REQUEST_HASH, sdpOffer: 'v=0', maxDurationSeconds: 60,
    rateConfig: RATE_CONFIG, budget, transport: new FakeTransport(), deadline: new FakeDeadline(),
    now: () => 0, signal: SIGNAL, attemptId: ATTEMPT_ID,
  });
  const session = (outcome as { session: LiveSessionRuntime }).session;
  session.observe({ type: 'session.usage.updated', usage: { seconds: 10 } }, 'provider');
  const finalized = await session.finalize();
  assert.equal(finalized.status, 'unknown');
  assert.equal((finalized as { retainedNanoUsd: number }).retainedNanoUsd, 75_000_000);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'unknown');
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
});

test('a measured overrun reaches the persistent authority without clamping', async () => {
  const budget = new FakeBudgetStore();
  const binding = voiceBinding(75_000_000);
  await budget.execute({ operation: 'reserve', binding }, SIGNAL);
  await budget.execute({ operation: 'claim_dispatch', binding }, SIGNAL);
  const result = await settleSessionAttempt(
    binding,
    { usageSeconds: 500, finalChargeNanoUsd: 500_000_000, providerTrusted: true },
    budget,
    SIGNAL,
  );
  assert.equal(result.ok, true);
  assert.equal(budget.record(binding.attemptId)?.chargedNanoUsd, 500_000_000);
});

test('settle without provider trust is refused', async () => {
  const budget = new FakeBudgetStore();
  const binding = voiceBinding(75_000_000);
  const result = await settleSessionAttempt(
    binding,
    { usageSeconds: 30, finalChargeNanoUsd: 30_000_000, providerTrusted: false },
    budget,
    SIGNAL,
  );
  assert.equal(result.ok, false);
  assert.equal((result as { error: string }).error, 'usage_not_provider_trusted');
});

test('backend spend settles a distinct row and never touches the voice reservation', async () => {
  const budget = new FakeBudgetStore();
  const voice = voiceBinding(75_000_000);
  await budget.execute({ operation: 'reserve', binding: voice }, SIGNAL);
  await budget.execute({ operation: 'claim_dispatch', binding: voice }, SIGNAL);

  const backend: SessionAttemptBinding = {
    ...voice,
    kind: 'backend',
    attemptId: '77777777-7777-4777-8777-777777777777',
    reservedNanoUsd: 10_000_000,
  };
  await budget.execute({ operation: 'reserve', binding: backend }, SIGNAL);
  const result = await settleBackendAttempt(
    backend,
    { finalChargeNanoUsd: 4_000_000, providerTrusted: true },
    budget,
    SIGNAL,
  );
  assert.equal(result.ok, true);
  assert.equal(budget.record('77777777-7777-4777-8777-777777777777')?.chargedNanoUsd, 4_000_000);
  assert.equal(budget.record(ATTEMPT_ID)?.chargedNanoUsd, 75_000_000);
  assert.equal(budget.record(ATTEMPT_ID)?.state, 'dispatched');
});
