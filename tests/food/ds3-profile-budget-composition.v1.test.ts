import { describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { db } from '@/db/client';
import { createPilotBudgetStore } from '@/lib/workout/pilot-budget-service';
import {
  COACH_ATTEMPT_RESERVATION_NANO_USD,
  PARALLEL_SEARCH_MODEL,
  PARALLEL_SEARCH_PRICING_VERSION,
  PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD,
  PARALLEL_SEARCH_MAX_SEARCHES_PER_TURN,
  TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD,
  TEXT_FOOD_MAX_PHASES,
  decidePilotBudgetCommand,
  type PilotAttemptBinding,
} from '@/agents/coach-assistant/pilot-budget';
import { COACH_PRICING_VERSION } from '@/agents/coach-assistant/economics';
import { LUNA_MODEL } from '@/agents/router/policies';

const ACTOR = randomUUID();
const PILOT = randomUUID();
const ORGANIZATION = randomUUID();
const DAY = '2026-09-13';
const CAP = '3000000000';

type Profile = 'ordinary' | 'native_food' | 'search';

function bound(profile: Profile, turnId: string): PilotAttemptBinding {
  const common = { pilotId: PILOT, actorId: ACTOR, turnId, attemptId: randomUUID(), agentRunId: randomUUID(), requestHash: 'a'.repeat(64) };
  if (profile === 'search') return { ...common, model: PARALLEL_SEARCH_MODEL, pricingVersion: PARALLEL_SEARCH_PRICING_VERSION, reservedNanoUsd: PARALLEL_SEARCH_QUERY_RESERVATION_NANO_USD };
  if (profile === 'native_food') return { ...common, model: LUNA_MODEL, pricingVersion: COACH_PRICING_VERSION, reservedNanoUsd: TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD };
  return { ...common, model: LUNA_MODEL, pricingVersion: COACH_PRICING_VERSION, reservedNanoUsd: COACH_ATTEMPT_RESERVATION_NANO_USD };
}

/** A canonical persisted coachPilot row exactly as the store writes it. */
function row(binding: PilotAttemptBinding) {
  return {
    id: binding.agentRunId, user_id: ACTOR, organization_id: ORGANIZATION, model: binding.model,
    record: { binding, admissionDay: DAY, state: 'reserved' as const, chargedNanoUsd: binding.reservedNanoUsd, usage: null, accountingAlert: false },
  };
}

/** Runs one real `reserve` against the persistent store with the given rows. */
async function reserve(input: PilotAttemptBinding, rows: ReturnType<typeof row>[], cap = CAP) {
  const charged = rows.reduce((sum, item) => sum + item.record.chargedNanoUsd, 0);
  const execute = vi.fn()
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ organization_id: ORGANIZATION, cap_nano_usd: cap, operating_target_nano_usd: cap, budget_day: DAY, server_budget_day: DAY, charged_nano_usd: String(charged), attempt_count: rows.length, accounting_blocked: false, allowed: true }] })
    .mockResolvedValueOnce({ rows: [{ id: ACTOR }] })
    .mockResolvedValueOnce({ rows })
    .mockResolvedValue({ rows: [] });
  const transaction = vi.fn(async work => work({ execute }));
  return createPilotBudgetStore({ transaction } as unknown as typeof db, ACTOR).execute({ operation: 'reserve', binding: input }, new AbortController().signal);
}

const snapshot = (extra: { turnAttemptCount: number; textFoodTurnCount?: number; searchTurnCount?: number }) =>
  ({ pilotId: PILOT, budgetDay: DAY, capNanoUsd: 3_000_000_000, chargedNanoUsd: 0, accountingBlocked: false, ...extra });

describe('stable-turn profile composition under the shared pilot lock', () => {
  const TURN = randomUUID();

  it('counts one selector + phases as the native Food allowance and blocks only the next native attempt', async () => {
    // The selector is the first native record; the phases fill the advertised ceiling.
    const rows = Array.from({ length: TEXT_FOOD_MAX_PHASES }, () => row(bound('native_food', TURN)));
    rows.push(row(bound('ordinary', TURN)));
    expect(await reserve(bound('native_food', TURN), rows)).toMatchObject({ ok: false, error: 'budget_blocked' });
    expect(await reserve(bound('ordinary', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
    expect(await reserve(bound('search', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
  });

  it('closes the ordinary profile at two without blocking native Food or search', async () => {
    const rows = [row(bound('ordinary', TURN)), row(bound('ordinary', TURN))];
    expect(await reserve(bound('ordinary', TURN), rows)).toMatchObject({ ok: false, error: 'budget_blocked' });
    expect(await reserve(bound('native_food', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
    expect(await reserve(bound('search', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
  });

  it('closes the search profile at two without blocking ordinary or native Food', async () => {
    const rows = Array.from({ length: PARALLEL_SEARCH_MAX_SEARCHES_PER_TURN }, () => row(bound('search', TURN)));
    expect(await reserve(bound('search', TURN), rows)).toMatchObject({ ok: false, error: 'budget_blocked' });
    expect(await reserve(bound('native_food', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
    expect(await reserve(bound('ordinary', TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
  });

  it('blocks every profile on the shared daily USD cap while all per-turn counters stay open', async () => {
    const rows = [row(bound('ordinary', TURN)), row(bound('native_food', TURN)), row(bound('search', TURN))];
    const charged = rows.reduce((sum, item) => sum + item.record.chargedNanoUsd, 0);
    const cap = String(charged + 1);
    for (const profile of ['ordinary', 'native_food', 'search'] as const) {
      expect(await reserve(bound(profile, TURN), rows, cap)).toMatchObject({ ok: false, error: 'budget_blocked' });
    }
  });

  it('counts per shared turn id, so another turn cannot consume or open this turn\'s slots', async () => {
    const other = randomUUID();
    const rows = [
      ...Array.from({ length: TEXT_FOOD_MAX_PHASES }, () => row(bound('native_food', other))),
      ...Array.from({ length: 2 }, () => row(bound('ordinary', other))),
      ...Array.from({ length: 2 }, () => row(bound('search', other))),
    ];
    for (const profile of ['ordinary', 'native_food', 'search'] as const) {
      expect(await reserve(bound(profile, TURN), rows)).toMatchObject({ ok: true, record: { state: 'reserved' } });
    }
  });
});

describe('profile counters fall back safely and never disable a ceiling', () => {
  it('falls back to the original combined turn count when a profile counter is absent', () => {
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: TEXT_FOOD_MAX_PHASES }), { operation: 'reserve', binding: bound('native_food', randomUUID()) })).toMatchObject({ ok: false, error: 'budget_blocked' });
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: PARALLEL_SEARCH_MAX_SEARCHES_PER_TURN }), { operation: 'reserve', binding: bound('search', randomUUID()) })).toMatchObject({ ok: false, error: 'budget_blocked' });
  });

  it('uses the explicit profile counter when present instead of the combined fallback', () => {
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: TEXT_FOOD_MAX_PHASES, textFoodTurnCount: 0 }), { operation: 'reserve', binding: bound('native_food', randomUUID()) })).toMatchObject({ ok: true });
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: PARALLEL_SEARCH_MAX_SEARCHES_PER_TURN, searchTurnCount: 0 }), { operation: 'reserve', binding: bound('search', randomUUID()) })).toMatchObject({ ok: true });
  });

  it('keeps the ordinary two-attempt ceiling unchanged and does not fall back for it', () => {
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: 2 }), { operation: 'reserve', binding: bound('ordinary', randomUUID()) })).toMatchObject({ ok: false, error: 'budget_blocked' });
    expect(decidePilotBudgetCommand(snapshot({ turnAttemptCount: 1 }), { operation: 'reserve', binding: bound('ordinary', randomUUID()) })).toMatchObject({ ok: true });
  });

  it('rejects a non-integer or negative profile counter rather than trusting it', () => {
    expect(decidePilotBudgetCommand({ ...snapshot({ turnAttemptCount: 0 }), textFoodTurnCount: -1 } as never, { operation: 'reserve', binding: bound('native_food', randomUUID()) })).toMatchObject({ ok: false, error: 'invalid_input' });
    expect(decidePilotBudgetCommand({ ...snapshot({ turnAttemptCount: 0 }), searchTurnCount: 1.5 } as never, { operation: 'reserve', binding: bound('search', randomUUID()) })).toMatchObject({ ok: false, error: 'invalid_input' });
  });
});
