// @vitest-environment jsdom

// Regression (AG4 follow-up): the Supabase adapter used to classify *any*
// Postgres 23505 unique_violation on Undo-restore as a confirmed no-op and let
// the hook re-insert its optimistic snapshot. A unique-id collision does not
// prove the actor's row is present: the row could have been concurrently
// changed (different macros) or be invisible under RLS (another owner). The
// adapter now reads the visible row back and only reports 'noop' on an exact
// payload match; otherwise it reports 'unknown' so the caller refetches the
// authoritative day and never shows the stale snapshot.

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  createFoodLogDeletePort,
  isSameDesiredRow,
  type FoodLogDeleteClient,
  type FoodLogQueryBuilder,
  type FoodLogQueryResult,
} from '@/components/food/food-log-delete-port';
import type { FoodLogRowSnapshot } from '@/components/food/food-log-row';
import { useFoodLogDelete } from '@/components/food/use-food-log-delete';

// A COMPLETE persisted `food_log` row: the legacy FoodLogEntry plus every Phase-4
// quantity/reference/provenance column from db/schema/food.ts. The delete snapshot
// and the collision verification must both speak the complete row.
function row(id: string, overrides: Partial<FoodLogRowSnapshot> = {}): FoodLogRowSnapshot {
  return {
    id,
    user_id: 'u1',
    logged_date: '2026-09-12',
    meal_type: 'lunch',
    food_name: `Food ${id}`,
    quantity: 1,
    unit: 'serving',
    calories: 300,
    protein_g: 20,
    carbs_g: 30,
    fat_g: 10,
    fiber_g: 3,
    sugar_g: 4,
    source: 'natural_language',
    source_id: null,
    photo_url: null,
    food_id: 'f1',
    qty_g: '150.00',
    qty_input: '1.5',
    qty_input_unit: 'cup',
    conversion_id: 'c1',
    parse_confidence: 0.9,
    llm_recognized: true,
    created_at: '2026-09-12T12:00:00.000Z',
    ...overrides,
  };
}

interface Behaviors {
  insert?: () => FoodLogQueryResult;
  deleteEq?: () => FoodLogQueryResult;
  deleteIn?: () => FoodLogQueryResult;
  selectEq?: () => FoodLogQueryResult;
}

/** A fake PostgREST client covering only the query shapes the port issues. */
function fakeClient(behaviors: Behaviors) {
  const ops: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const client = {
    from(table: string): FoodLogQueryBuilder {
      let op: 'insert' | 'delete' | 'select' | null = null;
      let filter: unknown;
      const resolve = (): FoodLogQueryResult => {
        if (op === 'insert') {
          ops.push(`insert:${table}`);
          return behaviors.insert?.() ?? { data: { id: 'x' }, error: null };
        }
        if (op === 'delete') {
          if (Array.isArray(filter)) {
            ops.push('delete.in');
            return behaviors.deleteIn?.() ?? { data: [], error: null };
          }
          ops.push('delete.eq');
          return behaviors.deleteEq?.() ?? { data: null, error: null };
        }
        ops.push('select.eq');
        return behaviors.selectEq?.() ?? { data: null, error: null };
      };
      const builder: FoodLogQueryBuilder = {
        delete: () => builder,
        insert: () => builder,
        select: () => builder,
        eq: (_column: string, value: unknown) => { if (op === null) op = 'select'; filter = value; return builder; },
        in: (_column: string, values: readonly unknown[]) => { if (op === null) op = 'select'; filter = values; return builder; },
        maybeSingle: () => Promise.resolve(resolve()),
        then: <TResult1 = FoodLogQueryResult, TResult2 = never>(
          onfulfilled?: ((value: FoodLogQueryResult) => TResult1 | PromiseLike<TResult1>) | null,
          onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
        ): PromiseLike<TResult1 | TResult2> => Promise.resolve(resolve()).then(onfulfilled, onrejected),
      };
      // `delete`/`insert`/`select` mark the op; `eq`/`in` record the filter.
      builder.delete = () => { op = 'delete'; return builder; };
      builder.insert = (values: Record<string, unknown>) => { op = 'insert'; inserts.push(values); return builder; };
      builder.select = () => { if (op === null) op = 'select'; return builder; };
      return builder;
    },
  };
  return { client: client as unknown as FoodLogDeleteClient, ops, inserts };
}

const duplicate: FoodLogQueryResult = { data: null, error: { code: '23505' } };

describe('restoreOne classification', () => {
  it('confirms a plain successful insert and does not read the row back', async () => {
    const { client, ops } = fakeClient({ insert: () => ({ data: { id: 'a' }, error: null }) });
    await expect(createFoodLogDeletePort(client).restoreOne(row('a'))).resolves.toBe('confirmed');
    expect(ops).toEqual(['insert:food_log']);
  });

  it('treats a non-collision insert error as unknown', async () => {
    const { client, ops } = fakeClient({ insert: () => ({ data: null, error: { code: '42501' } }) });
    await expect(createFoodLogDeletePort(client).restoreOne(row('a'))).resolves.toBe('unknown');
    expect(ops).toEqual(['insert:food_log']);
  });

  it('confirms a no-op only when the visible row matches the exact desired payload', async () => {
    const desired = row('a');
    const { client, ops } = fakeClient({
      insert: () => duplicate,
      selectEq: () => ({ data: { ...desired }, error: null }),
    });
    await expect(createFoodLogDeletePort(client).restoreOne(desired)).resolves.toBe('noop');
    expect(ops).toEqual(['insert:food_log', 'select.eq']);
  });

  it('treats a collision with a changed payload as unknown (never claims the stale restore)', async () => {
    const desired = row('a');
    const { client } = fakeClient({
      insert: () => duplicate,
      selectEq: () => ({ data: { ...desired, calories: 999, food_name: 'Edited' }, error: null }),
    });
    await expect(createFoodLogDeletePort(client).restoreOne(desired)).resolves.toBe('unknown');
  });

  it('verifies a collision against every persisted column, not just legacy macros', async () => {
    const desired = row('a');
    const changes: Partial<FoodLogRowSnapshot>[] = [
      { food_id: 'f9' },
      { qty_g: '1.00' },
      { qty_input: '9' },
      { qty_input_unit: 'g' },
      { conversion_id: 'c9' },
      { parse_confidence: 0.1 },
      { llm_recognized: false },
      { user_id: 'someone-else' },
    ];
    for (const change of changes) {
      const { client } = fakeClient({
        insert: () => duplicate,
        selectEq: () => ({ data: { ...desired, ...change }, error: null }),
      });
      await expect(createFoodLogDeletePort(client).restoreOne(desired)).resolves.toBe('unknown');
    }
  });

  it('INSERTs the complete snapshot payload so quantity/reference/provenance survive Undo', async () => {
    const desired = row('a');
    const { client, ops, inserts } = fakeClient({ insert: () => ({ data: { id: 'a' }, error: null }) });
    await expect(createFoodLogDeletePort(client).restoreOne(desired)).resolves.toBe('confirmed');
    expect(ops).toEqual(['insert:food_log']);
    expect(inserts).toHaveLength(1);
    // Every persisted column (id/actor + Phase-4 quantity/reference/provenance)
    // is carried into the INSERT, not just the legacy fields.
    expect(inserts[0]).toEqual(desired);
    expect(inserts[0]).toMatchObject({
      id: 'a',
      user_id: 'u1',
      food_id: 'f1',
      qty_g: '150.00',
      qty_input: '1.5',
      qty_input_unit: 'cup',
      conversion_id: 'c1',
      parse_confidence: 0.9,
      llm_recognized: true,
    });
  });

  it('treats a collision whose row is invisible (RLS / another owner) as unknown', async () => {
    const { client } = fakeClient({
      insert: () => duplicate,
      selectEq: () => ({ data: null, error: null }),
    });
    await expect(createFoodLogDeletePort(client).restoreOne(row('a'))).resolves.toBe('unknown');
  });

  it('treats a failed verification read as unknown', async () => {
    const { client } = fakeClient({
      insert: () => duplicate,
      selectEq: () => ({ data: null, error: { code: '42501' } }),
    });
    await expect(createFoodLogDeletePort(client).restoreOne(row('a'))).resolves.toBe('unknown');
  });

});

// AG4: the old comparison enumerated a handpicked legacy field list, so a row
// whose REAL persisted columns changed (food_id, qty_g, qty_input[_unit],
// conversion_id, parse_confidence, llm_recognized, identity/provenance) still
// compared equal -> the adapter reported a no-op and kept the stale snapshot.
// The contract is now the complete persisted row: missing/extra/changed values
// never match.
describe('complete persisted row contract (AG4)', () => {
  it('accepts an exact complete row', () => {
    const desired = row('a');
    expect(isSameDesiredRow(desired, { ...desired })).toBe(true);
  });

  it.each([
    ['identity (user_id)', { user_id: 'someone-else' }],
    ['id', { id: 'b' }],
    ['food_id', { food_id: 'f2' }],
    ['qty_g', { qty_g: '200.00' }],
    ['qty_input', { qty_input: '2' }],
    ['qty_input_unit', { qty_input_unit: 'g' }],
    ['conversion_id', { conversion_id: 'c2' }],
    ['parse_confidence', { parse_confidence: 0.2 }],
    ['llm_recognized', { llm_recognized: false }],
    ['provenance (source_id)', { source_id: 'src-2' }],
    ['reference (source)', { source: 'usda' }],
    ['legacy macro calories', { calories: 301 }],
    ['legacy macro food_name', { food_name: 'Edited' }],
  ])('rejects a row whose %s changed', (_label, change) => {
    const desired = row('a');
    expect(isSameDesiredRow(desired, { ...desired, ...change })).toBe(false);
  });

  it('rejects a row that is missing a persisted column (partial legacy snapshot)', () => {
    const desired = row('a');
    // Legacy-only projection: every legacy field still matches, but the real
    // persisted columns are absent, so equality cannot be proven.
    const legacyOnly = { ...desired } as Record<string, unknown>;
    delete legacyOnly.food_id;
    expect(isSameDesiredRow(desired, legacyOnly)).toBe(false);
    // ...and the same partial object on the desired side can never match a full row.
    const partialDesired = { ...desired } as Record<string, unknown>;
    delete partialDesired.qty_g;
    expect(isSameDesiredRow(partialDesired as unknown as FoodLogRowSnapshot, { ...desired })).toBe(false);
  });

  it('rejects a row carrying an extra persisted key beyond the snapshot', () => {
    const desired = row('a');
    expect(isSameDesiredRow(desired, { ...desired, server_extra_column: 'x' })).toBe(false);
  });

  it('treats numeric representations of the same persisted value as equal, nulls only as null', () => {
    const desired = row('a', { qty_g: '150.00', parse_confidence: 0.9 });
    expect(isSameDesiredRow(desired, { ...desired, qty_g: 150 })).toBe(true);
    expect(isSameDesiredRow(desired, { ...desired, qty_g: 150.01 })).toBe(false);
    const nullQty = row('a', { qty_g: null });
    expect(isSameDesiredRow(nullQty, { ...nullQty, qty_g: null })).toBe(true);
    expect(isSameDesiredRow(nullQty, { ...nullQty, qty_g: 0 })).toBe(false);
  });

  it('rejects a non-object or null actual row', () => {
    expect(isSameDesiredRow(row('a'), null)).toBe(false);
    expect(isSameDesiredRow(row('a'), 'nope')).toBe(false);
  });
});

describe('deleteOne / deleteMany classification', () => {
  it('confirms a delete only when the row is echoed back', async () => {
    const ok = fakeClient({ deleteEq: () => ({ data: { id: 'a' }, error: null }) });
    await expect(createFoodLogDeletePort(ok.client).deleteOne('a')).resolves.toBe('confirmed');
    const empty = fakeClient({ deleteEq: () => ({ data: null, error: null }) });
    await expect(createFoodLogDeletePort(empty.client).deleteOne('a')).resolves.toBe('unknown');
    const errored = fakeClient({ deleteEq: () => ({ data: null, error: { code: '42501' } }) });
    await expect(createFoodLogDeletePort(errored.client).deleteOne('a')).resolves.toBe('unknown');
  });

  it('confirms a batch only on a full echoed id set', async () => {
    const full = fakeClient({ deleteIn: () => ({ data: [{ id: 'x' }, { id: 'y' }], error: null }) });
    await expect(createFoodLogDeletePort(full.client).deleteMany(['x', 'y'])).resolves.toBe('confirmed');
    const partial = fakeClient({ deleteIn: () => ({ data: [{ id: 'x' }], error: null }) });
    await expect(createFoodLogDeletePort(partial.client).deleteMany(['x', 'y'])).resolves.toBe('unknown');
  });
});

describe('Undo through the real adapter (causal bridge)', () => {
  function hookFor(client: FoodLogDeleteClient) {
    const port = createFoodLogDeletePort(client);
    const onRestore = vi.fn();
    const onRefetch = vi.fn(async () => {});
    const onError = vi.fn();
    const selectedDateRef = { current: '2026-09-12' };
    const view = renderHook(() => useFoodLogDelete({
      selectedDateRef,
      port,
      onRemove: vi.fn(),
      onRestore,
      onRefetch,
      onError,
      onRestored: vi.fn(),
      undoWindowMs: 5000,
    }));
    return { view, onRestore, onRefetch, onError, port };
  }

  const confirmedDelete: FoodLogQueryResult = { data: { id: 'a' }, error: null };

  it('a changed row drives a refetch, not an optimistic snapshot restore', async () => {
    const desired = row('a');
    const { client } = fakeClient({
      deleteEq: () => confirmedDelete,
      insert: () => duplicate,
      selectEq: () => ({ data: { ...desired, calories: 1 }, error: null }),
    });
    const h = hookFor(client);
    act(() => { h.view.result.current.requestDelete(desired); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.onRestore).not.toHaveBeenCalled();
    expect(h.onError).toHaveBeenCalledWith('food.restore_failed');
    expect(h.onRefetch).toHaveBeenCalledTimes(1);
  });

  it('an invisible row drives a refetch, never a phantom re-insert', async () => {
    const desired = row('a');
    const { client } = fakeClient({
      deleteEq: () => confirmedDelete,
      insert: () => duplicate,
      selectEq: () => ({ data: null, error: null }),
    });
    const h = hookFor(client);
    act(() => { h.view.result.current.requestDelete(desired); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.onRestore).not.toHaveBeenCalled();
    expect(h.onError).toHaveBeenCalledWith('food.restore_failed');
  });

  it('an exact visible row is a confirmed no-op that reflects the authoritative row', async () => {
    const desired = row('a');
    const { client } = fakeClient({
      deleteEq: () => confirmedDelete,
      insert: () => duplicate,
      selectEq: () => ({ data: { ...desired }, error: null }),
    });
    const h = hookFor(client);
    act(() => { h.view.result.current.requestDelete(desired); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.onRestore).toHaveBeenCalledWith(desired);
    expect(h.onError).not.toHaveBeenCalled();
  });
});
