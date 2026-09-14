import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Actor-bound reader under test; the authenticated client is the only injected dependency.
// The fake answers each of the reader's four authorized queries by their SELECT projection and
// records every filter so the test can prove the read is scoped to the actor and entries.
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

import {
  confirmCanonicalFoodEntry,
  readCanonicalFoodState,
} from '@/lib/food/canonical-food-read';

const PROFILE: { data: unknown; error: unknown } = { data: { target_calories: 2000, target_protein_g: 150, target_carbs_g: 200, target_fat_g: 60, client_view_prefs: null }, error: null };
const row = (id: string, date: string) => ({ id, logged_date: date, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3 });

function prime(entries: Array<Record<string, unknown>>, entryRows: Array<{ id: string; logged_date: string }>, profile = PROFILE) {
  state.set('*', { data: entries, error: null });
  state.set('id, logged_date', { data: entryRows, error: null });
  state.set('logged_date, calories', { data: entries.map(e => ({ logged_date: e.logged_date, calories: e.calories })), error: null });
  state.set('logged_date', { data: entries.map(e => ({ logged_date: e.logged_date })), error: null });
  state.set('target_calories, target_protein_g, target_carbs_g, target_fat_g, client_view_prefs', profile);
}

afterEach(() => { state.reset(); });

describe('readCanonicalFoodState', () => {
  it('reads the full canonical day/week/targets/streak, scoped to actor and entry', async () => {
    prime([row('entry-1', '2026-09-12')], [{ id: 'entry-1', logged_date: '2026-09-12' }]);
    const result = await readCanonicalFoodState('actor-1', { entryIds: ['entry-1'], date: '2026-09-12' });
    expect(result.ok).toBe(true);
    expect(result.found).toBe(true);
    expect(result.snapshot?.days[0]).toMatchObject({ date: '2026-09-12', calories: 130, protein_g: 2.7 });
    expect(result.snapshot?.days[0].entries).toHaveLength(1);
    expect(result.snapshot?.targets).toEqual({ calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 60 });
    expect(result.snapshot?.presentEntryIds).toEqual(['entry-1']);
    expect(state.filters.some(f => f.table === 'food_log' && f.column === 'user_id' && f.value === 'actor-1')).toBe(true);
    expect(state.filters.some(f => f.column === 'id' && Array.isArray(f.value) && (f.value as string[]).includes('entry-1'))).toBe(true);
  });

  it('reports found=false when the authorized read (wrong actor) returns no matching entry', async () => {
    prime([], []);
    const result = await readCanonicalFoodState('actor-1', { entryIds: ['entry-2'] });
    expect(result).toMatchObject({ ok: true, found: false });
    expect(result.snapshot?.presentEntryIds).toEqual([]);
  });

  it('covers every entry of a multi-entry receipt, not only the first', async () => {
    prime([row('entry-1', '2026-09-11'), row('entry-2', '2026-09-12')],
      [{ id: 'entry-1', logged_date: '2026-09-11' }, { id: 'entry-2', logged_date: '2026-09-12' }]);
    const both = await readCanonicalFoodState('actor-1', { entryIds: ['entry-1', 'entry-2'] });
    expect(both.found).toBe(true);
    expect(both.snapshot?.dates).toEqual(['2026-09-11', '2026-09-12']);
    expect(both.snapshot?.presentEntryIds.sort()).toEqual(['entry-1', 'entry-2']);

    prime([row('entry-1', '2026-09-12')], [{ id: 'entry-1', logged_date: '2026-09-12' }]);
    const partial = await readCanonicalFoodState('actor-1', { entryIds: ['entry-1', 'entry-2'] });
    expect(partial).toMatchObject({ ok: true, found: false });
  });

  it('retains and publishes nothing — no cache, subscription or invalidation API exists', async () => {
    prime([row('entry-1', '2026-09-12')], [{ id: 'entry-1', logged_date: '2026-09-12' }]);
    const result = await readCanonicalFoodState('actor-1', { entryIds: ['entry-1'] });
    expect(result.ok).toBe(true);
    // The snapshot is handed to the caller only; no durable/public state remains for a later reader.
    const reader = await import('@/lib/food/canonical-food-read');
    expect('cachedCanonicalFoodState' in reader).toBe(false);
    expect('subscribeCanonicalFoodState' in reader).toBe(false);
    expect('invalidateCanonicalFoodState' in reader).toBe(false);
    expect('publishCanonicalFoodState' in reader).toBe(false);
  });

  it('source contains no retained-cache/subscription/invalidation plumbing', () => {
    const source = readFileSync(join(process.cwd(), 'lib/food/canonical-food-read.ts'), 'utf8');
    expect(source).not.toContain('CachedSnapshot');
    expect(source).not.toContain('cachedCanonicalFoodState');
    expect(source).not.toContain('subscribeCanonicalFoodState');
    expect(source).not.toContain('invalidateCanonicalFoodState');
    expect(source).not.toContain('publishCanonicalFoodState');
    expect(source).not.toContain('subscribers');
  });

  it('reports failure for a transport/DB error and never throws', async () => {
    state.set('id, logged_date', { data: null, error: { message: 'boom' } });
    expect(await readCanonicalFoodState('actor-1', { entryIds: ['entry-3'] })).toMatchObject({ ok: false, found: false });
  });

  it('flags a missing profile so the food surface can route to onboarding', async () => {
    prime([row('entry-1', '2026-09-12')], [{ id: 'entry-1', logged_date: '2026-09-12' }], { data: null, error: null });
    const result = await readCanonicalFoodState('actor-1', { entryIds: ['entry-1'] });
    expect(result).toMatchObject({ ok: false, found: false, missingProfile: true });
  });

  it('confirmCanonicalFoodEntry performs the full read and reports visibility', async () => {
    prime([row('entry-1', '2026-09-12')], [{ id: 'entry-1', logged_date: '2026-09-12' }]);
    expect(await confirmCanonicalFoodEntry('actor-1', 'entry-1')).toEqual({ ok: true, found: true });
    // The seam performs the full read and reports visibility from the observed entry set; it retains nothing.

    prime([], []);
    expect(await confirmCanonicalFoodEntry('actor-1', 'entry-9')).toEqual({ ok: true, found: false });
  });
});
