// The DST timezone must be chosen before any Date is constructed.
process.env.TZ = 'Europe/Athens';

// Regression (data correctness): the canonical reader's streak walked back in time
// with a fixed 24h subtraction. Across a spring-forward transition a local calendar
// date is only 23h long, so the walk skipped it: a user in Athens at
// 2026-03-30T00:30 local (UTC+3) stepped to 2026-03-28, never inspecting 03-29.
// A streak that includes 03-29 (3 days: 03-28 → 03-30) was silently reported as 2.
// The walk now decrements the local calendar day, matching `weekDates` and the
// previously shipped page rule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const filters: Array<{ table: string; column: string; value: unknown }> = [];
  let responses = new Map<string, { data: unknown; error: unknown }>();
  const fallback = { data: [], error: null };
  const builder = (table: string, select: string) => {
    const resolve = () => responses.get(select) ?? responses.get(`${table}:${select}`) ?? fallback;
    const chain: Record<string, unknown> = {
      eq: (column: string, value: unknown) => { filters.push({ table, column, value }); return chain; },
      in: (column: string, value: unknown) => { filters.push({ table, column, value }); return chain; },
      gte: () => chain,
      lte: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(resolve()),
      maybeSingle: () => Promise.resolve(resolve()),
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  };
  return {
    filters,
    set: (select: string, value: { data: unknown; error: unknown }) => { responses.set(select, value); },
    reset: () => { responses = new Map(); filters.length = 0; },
    makeClient: () => ({ from: (table: string) => ({ select: (select: string) => builder(table, select) }) }),
  };
});
vi.mock('@/lib/supabase', () => ({ supabase: state.makeClient() }));

import { readCanonicalFoodState } from '@/lib/food/canonical-food-read';

const PROFILE = {
  data: { target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60, client_view_prefs: null },
  error: null,
};

/** `count` entries on each of the supplied local dates. */
function prime(datesWithCounts: Array<[string, number]>) {
  const entries = datesWithCounts.flatMap(([date, count]) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${date}-${index}`,
      logged_date: date,
      calories: 100,
      protein_g: 10,
      carbs_g: 10,
      fat_g: 5,
    })),
  );
  state.set('*', { data: entries, error: null });
  state.set('id, logged_date', { data: [], error: null });
  state.set('logged_date, calories', { data: entries.map(e => ({ logged_date: e.logged_date, calories: e.calories })), error: null });
  state.set('logged_date', { data: entries.map(e => ({ logged_date: e.logged_date })), error: null });
  state.set('target_calories, target_protein_g, target_carbs_g, target_fat_g, client_view_prefs', PROFILE);
}

beforeEach(() => {
  vi.useFakeTimers();
  // 2026-03-30T00:30 Athens local (UTC+3) = 2026-03-29T21:30Z.
  vi.setSystemTime(new Date('2026-03-30T00:30:00+03:00'));
});
afterEach(() => {
  vi.useRealTimers();
  state.reset();
});

describe('canonical streak across a spring-forward DST boundary', () => {
  it('counts three consecutive qualifying calendar days, including the 23h DST day', async () => {
    prime([['2026-03-30', 3], ['2026-03-29', 3], ['2026-03-28', 3]]);
    const result = await readCanonicalFoodState('actor-1');
    expect(result.ok).toBe(true);
    // A fixed 24h walk reported 2 (it jumped 03-30 → 03-28 and never saw 03-29).
    expect(result.snapshot?.streak).toBe(3);
  });

  it('still breaks the streak on a genuinely empty day', async () => {
    prime([['2026-03-30', 3], ['2026-03-29', 3], ['2026-03-27', 3]]);
    const result = await readCanonicalFoodState('actor-1');
    expect(result.snapshot?.streak).toBe(2);
  });
});
