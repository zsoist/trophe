'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import type { FoodLogRowSnapshot } from './food-log-row';

/**
 * Durable delete/undo controller for the Food log.
 *
 * Why this exists (user-visible counterexamples it fixes):
 *  1. The old flow only soft-deleted in React state and persisted the delete
 *     after a 5s timer. A reload inside that window reloaded the row from the
 *     database — the deleted entry reappeared.
 *  2. Deleting A, navigating to another day, then deleting B cancelled A's
 *     pending timer (it lived in a single shared ref) so A was never committed.
 *  3. A pending batch survived a date change and its Undo deleted the previous
 *     day's rows while the user was looking at a different day.
 *
 * The database has no soft-delete column, so "durable" here means: persist the
 * DELETE immediately and keep the removed row's snapshot only to offer an
 * explicit, verified re-insert (Undo). Every persistence call is verified
 * against the returned row — success is never faked.
 *
 * Two later P1 fixes live here (AG4 review):
 *  A. Undo is queued *behind* the DELETE. Tapping Undo while the DELETE is still
 *     in flight no longer INSERTs concurrently (a late DELETE would remove the
 *     restored row); Undo awaits the typed outcome first. The undo window opens
 *     when the DELETE settles, so a slow delete can't expire the user's chance.
 *  B. A failed/lost DELETE response no longer re-inserts a phantom row. The port
 *     returns a typed outcome; an ambiguous ('unknown') result refetches instead
 *     of assuming the row survived.
 */

/**
 * Typed persistence outcome. A boolean cannot tell "the server rejected it"
 * apart from "the server committed it but the response was lost", so a lost
 * response must never be reported as a failure (which would re-insert a row the
 * database already deleted).
 *
 *  - `'confirmed'` — the mutation was applied. Its end state holds
 *    (delete: row is gone; restore: row is present).
 *  - `'noop'`      — the mutation was a confirmed no-op because the end state
 *    already held (delete: row was already absent; restore: row was already
 *    present). Only knowable from a positive signal such as a unique-key
 *    violation on restore — never inferred from missing returned rows.
 *  - `'unknown'`   — anything else (error, rejection, empty result, network/RLS).
 *    The caller must refetch instead of assuming either branch.
 */
export type PersistOutcome = 'confirmed' | 'noop' | 'unknown';

export interface FoodLogDeletePort {
  /** Permanently remove one row. */
  deleteOne: (id: string) => Promise<PersistOutcome>;
  /**
   * Re-insert one exact COMPLETE row snapshot; `noop` means the id was already
   * present with the same persisted payload. The snapshot carries every persisted
   * `food_log` column (see `food-log-row.ts`), not just the legacy fields.
   */
  restoreOne: (entry: FoodLogRowSnapshot) => Promise<PersistOutcome>;
  /** Permanently remove many rows. */
  deleteMany: (ids: string[]) => Promise<PersistOutcome>;
}

export type DeleteErrorKey = 'food.delete_failed' | 'food.restore_failed';

export interface UseFoodLogDeleteOptions {
  /** The currently selected day — scopes Undo re-inserts and batch ownership. */
  selectedDateRef: MutableRefObject<string>;
  port: FoodLogDeletePort;
  /** Drop ids from the optimistic day log. */
  onRemove: (ids: string[]) => void;
  /** Re-insert a restored entry (caller applies the date guard). */
  onRestore: (entry: FoodLogRowSnapshot) => void;
  /** Re-read the visible day after an unverifiable mutation. */
  onRefetch: () => Promise<void> | void;
  onError: (key: DeleteErrorKey) => void;
  onClearError?: () => void;
  /** One-shot side effect (slot flash) after a confirmed restore. */
  onRestored?: (entry: FoodLogRowSnapshot) => void;
  undoWindowMs?: number;
  batchWindowMs?: number;
}

export interface FoodLogDeletion {
  pendingDelete: { id: string; entry: FoodLogRowSnapshot } | null;
  pendingBatch: { ids: string[]; key: number } | null;
  requestDelete: (entry: FoodLogRowSnapshot) => void;
  undoDelete: () => Promise<void>;
  registerBatch: (ids: string[]) => void;
  undoBatch: () => Promise<void>;
  clearPending: () => void;
}

const DEFAULT_UNDO_MS = 5000;
const DEFAULT_BATCH_MS = 10000;

/** One in-flight single delete; kept so an Undo tap can be queued behind it. */
interface DeleteRecord {
  id: string;
  entry: FoodLogRowSnapshot;
  promise: Promise<PersistOutcome>;
  outcome: PersistOutcome | null;
  undoClaimed: boolean;
}

export function useFoodLogDelete(options: UseFoodLogDeleteOptions): FoodLogDeletion {
  const {
    selectedDateRef,
    port,
    onRemove,
    onRestore,
    onRefetch,
    onError,
    onClearError,
    onRestored,
  } = options;
  const undoMs = options.undoWindowMs ?? DEFAULT_UNDO_MS;
  const batchMs = options.batchWindowMs ?? DEFAULT_BATCH_MS;

  const [pendingDelete, setPendingDelete] = useState<{ id: string; entry: FoodLogRowSnapshot } | null>(null);
  const [pendingBatch, setPendingBatch] = useState<{ ids: string[]; key: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The day a batch was logged on. A stale toast must never delete another day's rows.
  const batchDateRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // The in-flight single delete. `promise` is kept so Undo can queue *behind* the
  // DELETE instead of racing it; `undoClaimed` makes a double-tap idempotent.
  const deleteRef = useRef<DeleteRecord | null>(null);
  const batchClaimRef = useRef(false);

  const clearUndoTimer = () => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };
  const clearBatchTimer = () => {
    if (batchTimerRef.current) {
      clearTimeout(batchTimerRef.current);
      batchTimerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
    };
  }, []);

  /** Date change / unmount: drop every affordance tied to the previous day. */
  const clearPending = useCallback(() => {
    clearUndoTimer();
    clearBatchTimer();
    batchDateRef.current = null;
    if (deleteRef.current) deleteRef.current.undoClaimed = true;
    deleteRef.current = null;
    batchClaimRef.current = false;
    setPendingDelete(null);
    setPendingBatch(null);
  }, []);

  /**
   * The Undo window opens when the DELETE *settles*, not when it starts. A slow
   * delete must never let the 5s countdown expire before the user can act.
   */
  const scheduleUndoTimer = useCallback((record: DeleteRecord) => {
    clearUndoTimer();
    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      if (!mountedRef.current) return;
      if (deleteRef.current === record && !record.undoClaimed) deleteRef.current = null;
      setPendingDelete(cur => (cur?.id === record.id ? null : cur));
    }, undoMs);
  }, [undoMs]);

  /** React to the typed outcome of the DELETE that fired on the tap. */
  const settleDelete = useCallback((record: DeleteRecord, outcome: PersistOutcome) => {
    record.outcome = outcome;
    // A queued Undo owns reconciliation from here (it awaits the same promise).
    if (record.undoClaimed) return;
    if (!mountedRef.current) return;
    const isCurrent = deleteRef.current === record;
    if (outcome === 'unknown') {
      // Ambiguous: the server may have committed and lost the response, or RLS /
      // network may have silently blocked it. Neither branch is safe to assume —
      // re-read the day instead of re-inserting a possibly-already-deleted row.
      // Do this even when a newer delete superseded this one: an ambiguous
      // delete must always reconcile the visible day.
      void onRefetch();
      if (!isCurrent) return;
      clearUndoTimer();
      deleteRef.current = null;
      setPendingDelete(cur => (cur?.id === record.id ? null : cur));
      return;
    }
    // `confirmed` / `noop`: the row is (now) absent, so the optimistic hide is
    // authoritative. Keep Undo available for the full window measured from here.
    if (!isCurrent) return; // a newer delete owns the toast now
    scheduleUndoTimer(record);
  }, [onRefetch, scheduleUndoTimer]);

  const requestDelete = useCallback((entry: FoodLogRowSnapshot) => {
    onClearError?.();
    // Optimistic hide AND immediate durable delete. An in-memory-only soft delete
    // was resurrected by a reload inside the undo window, so the row is removed
    // from the database now; Undo is an explicit, verified re-insert.
    onRemove([entry.id]);
    clearUndoTimer();
    // A newer delete supersedes the previous affordance; the older DELETE keeps
    // running (it is already committed) and its settle handler simply won't own
    // the toast anymore.
    // Fire the DELETE synchronously (so a reload/unmount right after the tap still
    // commits it); a rejected/thrown call is 'unknown', never a faked success or a
    // faked no-op.
    let raw: Promise<PersistOutcome>;
    try {
      raw = Promise.resolve(port.deleteOne(entry.id));
    } catch {
      raw = Promise.resolve('unknown');
    }
    raw = raw.catch((): PersistOutcome => 'unknown');
    const record: DeleteRecord = { id: entry.id, entry, promise: raw, outcome: null, undoClaimed: false };
    record.promise = raw.then(outcome => {
      settleDelete(record, outcome);
      return outcome;
    });
    deleteRef.current = record;
    setPendingDelete({ id: entry.id, entry });
  }, [port, onRemove, onClearError, settleDelete]);

  const restoreEntry = useCallback(async (entry: FoodLogRowSnapshot): Promise<PersistOutcome> => {
    try {
      return await port.restoreOne(entry);
    } catch {
      return 'unknown';
    }
  }, [port]);

  const undoDelete = useCallback(async () => {
    const record = deleteRef.current;
    if (!record || record.undoClaimed) return;
    // Claim the request before awaiting so a double-tap can't fire two restores.
    record.undoClaimed = true;
    clearUndoTimer();
    if (deleteRef.current === record) deleteRef.current = null;
    setPendingDelete(cur => (cur?.id === record.id ? null : cur));
    onClearError?.();
    // Queue behind the in-flight DELETE: never INSERT while the DELETE may still
    // land, or the late DELETE would remove the row the user just restored.
    const deleteOutcome = record.outcome ?? await record.promise;
    if (!mountedRef.current) return;
    if (deleteOutcome === 'unknown') {
      // The DELETE may or may not have committed — resync the day first so the
      // idempotent re-insert (unique id => 'noop' if present) can't duplicate.
      await onRefetch();
      if (!mountedRef.current) return;
    }
    const restoreOutcome = await restoreEntry(record.entry);
    if (!mountedRef.current) return;
    if (restoreOutcome === 'unknown') {
      // The row stays deleted; tell the truth and resync the visible day.
      onError('food.restore_failed');
      await onRefetch();
      return;
    }
    // Verified re-insert (or a confirmed no-op that the exact row already exists):
    // reflect it in the day it belongs to (caller guards date).
    onRestore(record.entry);
    onRestored?.(record.entry);
  }, [restoreEntry, onRestore, onRestored, onRefetch, onError, onClearError]);

  const registerBatch = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    clearBatchTimer();
    batchDateRef.current = selectedDateRef.current;
    batchClaimRef.current = true;
    setPendingBatch({ ids, key: Date.now() });
    batchTimerRef.current = setTimeout(() => {
      batchTimerRef.current = null;
      if (!mountedRef.current) return;
      setPendingBatch(null);
    }, batchMs);
  }, [selectedDateRef, batchMs]);

  const undoBatch = useCallback(async () => {
    if (!pendingBatch) return;
    // Claim the request before awaiting so a double-tap can't fire two batches.
    if (!batchClaimRef.current) return;
    batchClaimRef.current = false;
    const pending = pendingBatch;
    clearBatchTimer();
    setPendingBatch(null);
    // Date-scoped ownership: after a date change the toast is already cleared, but
    // guard anyway so a stale batch can never delete another day's rows.
    if (batchDateRef.current !== selectedDateRef.current) return;
    onClearError?.();
    let outcome: PersistOutcome = 'unknown';
    try {
      outcome = await port.deleteMany(pending.ids);
    } catch {
      outcome = 'unknown';
    }
    if (!mountedRef.current) return;
    // Batch semantics mirror a single delete: only an ambiguous outcome is a
    // reportable failure; always resync the day to the authoritative rows.
    if (outcome === 'unknown') onError('food.delete_failed');
    await onRefetch();
  }, [pendingBatch, port, onRefetch, onError, onClearError, selectedDateRef]);

  return { pendingDelete, pendingBatch, requestDelete, undoDelete, registerBatch, undoBatch, clearPending };
}
