// @vitest-environment jsdom

// Regression — durable food-log delete/undo. The old flow soft-deleted only in
// React state and committed the DELETE after a 5s timer held in a single shared
// ref. User-visible counterexamples:
//   * delete A, navigate a day, delete B  -> B cancelled A's timer; A was never
//     committed and reappeared on reload.
//   * deleting an item then reloading inside the 5s window -> the row reappeared,
//     because nothing had been persisted yet.
//   * a pending batch survived a date change and its Undo deleted the previous
//     day's rows while a different day was on screen.
// These drive the actual hook with fake timers and a mocked persistence port.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useFoodLogDelete,
  type FoodLogDeletePort,
  type FoodLogDeletion,
  type PersistOutcome,
} from '@/components/food/use-food-log-delete';
import type { FoodLogRowSnapshot } from '@/components/food/food-log-row';
import { FOOD_LOG_PERSISTED_COLUMNS } from '@/components/food/food-log-row';

// A COMPLETE persisted `food_log` row (all columns from db/schema/food.ts). The
// delete snapshot must carry the Phase-4 quantity/reference/provenance columns,
// not just the legacy fields.
function row(id: string, logged_date = '2026-09-12'): FoodLogRowSnapshot {
  return {
    id,
    user_id: 'u1',
    logged_date,
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
    food_id: `food-${id}`,
    qty_g: '150.00',
    qty_input: '1.5',
    qty_input_unit: 'cup',
    conversion_id: `conv-${id}`,
    parse_confidence: 0.87,
    llm_recognized: true,
    created_at: `${logged_date}T12:00:00.000Z`,
  };
}

interface Harness {
  port: { deleteOne: ReturnType<typeof vi.fn>; restoreOne: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> } & FoodLogDeletePort;
  onRemove: ReturnType<typeof vi.fn>;
  onRestore: ReturnType<typeof vi.fn>;
  onRefetch: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  onRestored: ReturnType<typeof vi.fn>;
  selectedDateRef: { current: string };
  view: { result: { current: FoodLogDeletion }; unmount: () => void };
}

function setup(overrides: Partial<FoodLogDeletePort> = {}): Harness {
  const port = {
    deleteOne: vi.fn(async () => 'confirmed' as PersistOutcome),
    restoreOne: vi.fn(async () => 'confirmed' as PersistOutcome),
    deleteMany: vi.fn(async () => 'confirmed' as PersistOutcome),
    ...overrides,
  } as Harness['port'];
  const onRemove = vi.fn();
  const onRestore = vi.fn();
  const onRefetch = vi.fn(async () => {});
  const onError = vi.fn();
  const onRestored = vi.fn();
  const selectedDateRef = { current: '2026-09-12' };
  const view = renderHook(() => useFoodLogDelete({
    selectedDateRef, port, onRemove, onRestore, onRefetch, onError, onRestored,
  }));
  return { port, onRemove, onRestore, onRefetch, onError, onRestored, selectedDateRef, view };
}

/** A promise the test resolves by hand, to model a DELETE still in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('durable single delete', () => {
  it('persists the delete immediately, not after the undo window', () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a')); });
    expect(h.port.deleteOne).toHaveBeenCalledWith('a');
    expect(h.onRemove).toHaveBeenCalledWith(['a']);
    expect(h.view.result.current.pendingDelete?.id).toBe('a');
  });

  it('needs no timer to be reload-safe: unmounting right after the tap keeps the delete', () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a')); });
    h.view.unmount();
    expect(h.port.deleteOne).toHaveBeenCalledWith('a');
  });

  it('delete A -> date change -> delete B commits both, never resurrecting A', async () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a', '2026-09-12')); });
    await act(async () => {});
    // Navigate away: the page drops the stale affordance.
    act(() => {
      h.selectedDateRef.current = '2026-09-11';
      h.view.result.current.clearPending();
    });
    expect(h.view.result.current.pendingDelete).toBeNull();
    act(() => { h.view.result.current.requestDelete(row('b', '2026-09-11')); });
    // Let B's DELETE settle so its undo window opens before the timer runs.
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(h.port.deleteOne).toHaveBeenNthCalledWith(1, 'a');
    expect(h.port.deleteOne).toHaveBeenNthCalledWith(2, 'b');
    expect(h.port.deleteOne).toHaveBeenCalledTimes(2);
    expect(h.port.restoreOne).not.toHaveBeenCalled();
    expect(h.view.result.current.pendingDelete).toBeNull();
  });

  it('undo before the window re-inserts the exact snapshot and flashes the slot', async () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a')); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.port.restoreOne).toHaveBeenCalledWith(row('a'));
    expect(h.onRestore).toHaveBeenCalledWith(row('a'));
    expect(h.onRestored).toHaveBeenCalledWith(row('a'));
    expect(h.view.result.current.pendingDelete).toBeNull();
  });

  it('hands the port the COMPLETE persisted snapshot, not a legacy projection', async () => {
    const h = setup();
    const entry = row('a');
    act(() => { h.view.result.current.requestDelete(entry); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    const passed = h.port.restoreOne.mock.calls[0]?.[0] as FoodLogRowSnapshot;
    for (const column of FOOD_LOG_PERSISTED_COLUMNS) {
      expect(passed).toHaveProperty(column);
    }
    expect(passed).toMatchObject({
      id: 'a',
      user_id: 'u1',
      food_id: 'food-a',
      qty_g: '150.00',
      qty_input: '1.5',
      qty_input_unit: 'cup',
      conversion_id: 'conv-a',
      parse_confidence: 0.87,
      llm_recognized: true,
    });
  });

  it('a late undo after the toast expired is a no-op (lost input never becomes an action)', async () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a')); });
    // The undo window opens when the DELETE settles.
    await act(async () => {});
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(h.view.result.current.pendingDelete).toBeNull();
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.port.restoreOne).not.toHaveBeenCalled();
  });

  it('a double undo fires a single restore (duplicate input)', async () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a')); });
    await act(async () => {});
    await act(async () => {
      await Promise.all([
        h.view.result.current.undoDelete(),
        h.view.result.current.undoDelete(),
      ]);
    });
    expect(h.port.restoreOne).toHaveBeenCalledTimes(1);
  });

  it('a failed restore keeps the row deleted, reports it, and refetches the day', async () => {
    const h = setup({ restoreOne: vi.fn(async () => 'unknown' as PersistOutcome) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    await act(async () => {});
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.onError).toHaveBeenCalledWith('food.restore_failed');
    expect(h.onRefetch).toHaveBeenCalled();
    expect(h.onRestore).not.toHaveBeenCalled();
  });
});

describe('Undo serializes behind the in-flight DELETE (P1)', () => {
  it('tapping Undo before the DELETE settles never INSERTs concurrently', async () => {
    const del = deferred<PersistOutcome>();
    const order: string[] = [];
    const deleteOne = vi.fn(() => del.promise.then(o => { order.push('delete:done'); return o; }));
    const restoreOne = vi.fn(async () => { order.push('restore'); return 'confirmed' as PersistOutcome; });
    const h = setup({ deleteOne: deleteOne as FoodLogDeletePort['deleteOne'], restoreOne });

    act(() => { h.view.result.current.requestDelete(row('a')); });
    expect(deleteOne).toHaveBeenCalledWith('a');

    let undo!: Promise<void>;
    act(() => { undo = h.view.result.current.undoDelete(); });
    await act(async () => {});
    // The DELETE is unresolved: no restore may have fired yet.
    expect(restoreOne).not.toHaveBeenCalled();
    expect(h.onRestore).not.toHaveBeenCalled();

    await act(async () => { del.resolve('confirmed'); await undo; });

    expect(order).toEqual(['delete:done', 'restore']);
    expect(restoreOne).toHaveBeenCalledWith(row('a'));
    expect(h.onRestore).toHaveBeenCalledWith(row('a'));
    expect(h.onRestored).toHaveBeenCalledWith(row('a'));
  });

  it('a slow DELETE cannot expire the undo window before it settles', async () => {
    const del = deferred<PersistOutcome>();
    const h = setup({ deleteOne: vi.fn(() => del.promise) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    // Far past the nominal 5s window, but the DELETE is still in flight.
    await act(async () => { vi.advanceTimersByTime(30_000); });
    expect(h.view.result.current.pendingDelete?.id).toBe('a');

    let undo!: Promise<void>;
    act(() => { undo = h.view.result.current.undoDelete(); });
    await act(async () => { del.resolve('confirmed'); await undo; });
    expect(h.port.restoreOne).toHaveBeenCalledWith(row('a'));
    expect(h.onRestore).toHaveBeenCalledWith(row('a'));
  });

  it('Undo queued behind an ambiguous DELETE refetches, then re-inserts idempotently', async () => {
    const del = deferred<PersistOutcome>();
    const order: string[] = [];
    const h = setup({ deleteOne: vi.fn(() => del.promise) });
    h.onRefetch.mockImplementation(async () => { order.push('refetch'); });
    h.port.restoreOne.mockImplementation(async () => { order.push('restore'); return 'confirmed' as PersistOutcome; });

    act(() => { h.view.result.current.requestDelete(row('a')); });
    let undo!: Promise<void>;
    act(() => { undo = h.view.result.current.undoDelete(); });
    await act(async () => { del.resolve('unknown'); await undo; });

    expect(order).toEqual(['refetch', 'restore']);
    expect(h.port.restoreOne).toHaveBeenCalledWith(row('a'));
    expect(h.onRestore).toHaveBeenCalledWith(row('a'));
  });

  it('Undo queued behind an already-absent row restores the exact snapshot (noop)', async () => {
    const del = deferred<PersistOutcome>();
    const h = setup({ deleteOne: vi.fn(() => del.promise) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    let undo!: Promise<void>;
    act(() => { undo = h.view.result.current.undoDelete(); });
    await act(async () => { del.resolve('noop'); await undo; });
    expect(h.port.restoreOne).toHaveBeenCalledWith(row('a'));
    expect(h.onRestore).toHaveBeenCalledWith(row('a'));
  });

  it('a commit-then-lost-response DELETE refetches; it never re-inserts a phantom row', async () => {
    const h = setup({ deleteOne: vi.fn(async () => { throw new Error('network lost after commit'); }) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    await act(async () => {});
    expect(h.port.restoreOne).not.toHaveBeenCalled();
    expect(h.onRestore).not.toHaveBeenCalled();
    expect(h.onRefetch).toHaveBeenCalled();
    expect(h.view.result.current.pendingDelete).toBeNull();
  });

  it('an empty/missing delete result is treated as unknown, not a confirmed no-op', async () => {
    const h = setup({ deleteOne: vi.fn(async () => 'unknown' as PersistOutcome) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    await act(async () => {});
    expect(h.onRestore).not.toHaveBeenCalled();
    expect(h.onRefetch).toHaveBeenCalled();
  });

  it('a second delete supersedes the toast; a single Undo restores only the visible entry', async () => {
    const h = setup();
    act(() => { h.view.result.current.requestDelete(row('a', '2026-09-12')); });
    act(() => { h.view.result.current.requestDelete(row('b', '2026-09-12')); });
    await act(async () => {});
    expect(h.port.deleteOne).toHaveBeenCalledWith('a');
    expect(h.port.deleteOne).toHaveBeenCalledWith('b');
    expect(h.view.result.current.pendingDelete?.id).toBe('b');
    await act(async () => { await h.view.result.current.undoDelete(); });
    expect(h.port.restoreOne).toHaveBeenCalledTimes(1);
    expect(h.port.restoreOne).toHaveBeenCalledWith(row('b', '2026-09-12'));
  });

  it('unmounting after tapping Undo drops the restore (the DELETE already committed)', async () => {
    const del = deferred<PersistOutcome>();
    const h = setup({ deleteOne: vi.fn(() => del.promise) });
    act(() => { h.view.result.current.requestDelete(row('a')); });
    let undo!: Promise<void>;
    act(() => { undo = h.view.result.current.undoDelete(); });
    h.view.unmount();
    await act(async () => { del.resolve('confirmed'); await undo; });
    expect(h.port.restoreOne).not.toHaveBeenCalled();
  });
});

describe('date-scoped batch undo', () => {
  it('deletes every id once when Undo is tapped on the same day', async () => {
    const h = setup();
    act(() => { h.view.result.current.registerBatch(['x', 'y']); });
    await act(async () => { await h.view.result.current.undoBatch(); });
    expect(h.port.deleteMany).toHaveBeenCalledWith(['x', 'y']);
    expect(h.onRefetch).toHaveBeenCalled();
    expect(h.onError).not.toHaveBeenCalled();
  });

  it('a pending batch cleared by a date change cannot touch the previous day', async () => {
    const h = setup();
    act(() => { h.view.result.current.registerBatch(['x', 'y']); });
    act(() => {
      h.selectedDateRef.current = '2026-09-11';
      h.view.result.current.clearPending();
    });
    expect(h.view.result.current.pendingBatch).toBeNull();
    await act(async () => { await h.view.result.current.undoBatch(); });
    expect(h.port.deleteMany).not.toHaveBeenCalled();
  });

  it('a stale batch is refused even if the date change forgot to clear it', async () => {
    const h = setup();
    act(() => { h.view.result.current.registerBatch(['x']); });
    h.selectedDateRef.current = '2026-09-11';
    await act(async () => { await h.view.result.current.undoBatch(); });
    expect(h.port.deleteMany).not.toHaveBeenCalled();
  });

  it('a failed batch reports the failure after refetching', async () => {
    const h = setup({ deleteMany: vi.fn(async () => 'unknown' as PersistOutcome) });
    act(() => { h.view.result.current.registerBatch(['x']); });
    await act(async () => { await h.view.result.current.undoBatch(); });
    expect(h.onError).toHaveBeenCalledWith('food.delete_failed');
    expect(h.onRefetch).toHaveBeenCalled();
  });

  it('a double batch undo fires a single delete', async () => {
    const h = setup();
    act(() => { h.view.result.current.registerBatch(['x']); });
    await act(async () => {
      await Promise.all([
        h.view.result.current.undoBatch(),
        h.view.result.current.undoBatch(),
      ]);
    });
    expect(h.port.deleteMany).toHaveBeenCalledTimes(1);
  });
});
