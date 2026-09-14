import type { FoodLogDeletePort, PersistOutcome } from './use-food-log-delete';
import {
  isSamePersistedRow,
  persistedInsertPayload,
} from './food-log-row';

/**
 * Supabase adapter for the durable food-log delete/undo port.
 *
 * Extracted from `app/dashboard/log/page.tsx` so the persistence classification
 * (which is what decides whether the UI may claim a restore) is driven by the
 * real adapter against a fake PostgREST client in tests, instead of being
 * asserted by grepping page source.
 *
 * Why the restore path reads the row back (AG4 follow-up):
 *   A Postgres `23505` unique_violation only proves that *some* row already
 *   holds this id. It does NOT prove that the row is this actor's, that it is
 *   visible under RLS, or that its payload still matches the snapshot the user
 *   deleted. Treating `23505` alone as a confirmed no-op let the hook re-insert
 *   its optimistic snapshot and show it to the user even when the authoritative
 *   row had been concurrently changed (wrong macros) or belonged to somebody
 *   else (invisible). So a collision is verified by reading the visible row back
 *   and requiring an exact payload match; anything else is `'unknown'`, which
 *   makes the caller refetch the authoritative day. We never overwrite and never
 *   blind-retry the insert. The comparison is over the COMPLETE persisted row
 *   (`food-log-row.ts`), not a handpicked legacy field list, so a changed
 *   food_id/qty_g/qty_input/conversion_id/confidence/recognition/etc. is caught.
 */

/** The PostgREST result shape this port consumes. */
export interface FoodLogQueryResult {
  data: unknown;
  error: { code?: string | null } | null;
}

/** Call shape of the queries this port issues against `food_log`. */
export interface FoodLogQueryBuilder extends PromiseLike<FoodLogQueryResult> {
  delete(): FoodLogQueryBuilder;
  insert(values: Record<string, unknown>): FoodLogQueryBuilder;
  select(columns?: string): FoodLogQueryBuilder;
  eq(column: string, value: unknown): FoodLogQueryBuilder;
  in(column: string, values: readonly unknown[]): FoodLogQueryBuilder;
  maybeSingle(): PromiseLike<FoodLogQueryResult>;
}

/** Minimal structural view of the Supabase client (the real client is cast in). */
export interface FoodLogDeleteClient {
  from(table: string): FoodLogQueryBuilder;
}

/**
 * True only if the visible row reproduces the exact desired COMPLETE snapshot
 * payload. Re-exported under the historical name; the full-row contract lives in
 * `food-log-row.ts`.
 */
export { isSamePersistedRow as isSameDesiredRow } from './food-log-row';

export function createFoodLogDeletePort(client: FoodLogDeleteClient): FoodLogDeletePort {
  return {
    async deleteOne(id): Promise<PersistOutcome> {
      try {
        const { data, error } = await client
          .from('food_log')
          .delete()
          .eq('id', id)
          .select('id')
          .maybeSingle();
        // A returned row confirms the delete. An error (the server may have
        // committed and lost the response) or an empty result (which can also
        // mean RLS blocked the write) is ambiguous -> 'unknown', never a faked
        // 'noop'/'confirmed'.
        if (error) return 'unknown';
        return data ? 'confirmed' : 'unknown';
      } catch {
        return 'unknown';
      }
    },

    async restoreOne(entry): Promise<PersistOutcome> {
      try {
        const { data, error } = await client
          .from('food_log')
          .insert(persistedInsertPayload(entry))
          .select('id')
          .maybeSingle();
        if (!error) return data ? 'confirmed' : 'unknown';
        if (error.code !== '23505') return 'unknown';
        // Collision: some row already holds this id. That alone is not proof the
        // actor's desired row is present. Read it back (RLS-scoped, so another
        // owner's row comes back empty) and require an exact payload match.
        const verify = await client
          .from('food_log')
          .select('*')
          .eq('id', entry.id)
          .maybeSingle();
        if (verify.error || !verify.data) return 'unknown';
        return isSamePersistedRow(entry, verify.data) ? 'noop' : 'unknown';
      } catch {
        return 'unknown';
      }
    },

    async deleteMany(ids): Promise<PersistOutcome> {
      try {
        const { data, error } = await client
          .from('food_log')
          .delete()
          .in('id', ids)
          .select('id');
        if (error) return 'unknown';
        // Only a full, echoed id set confirms every row is gone; a partial or
        // empty result is ambiguous (RLS / lost response), never a no-op.
        return Array.isArray(data) && data.length === ids.length ? 'confirmed' : 'unknown';
      } catch {
        return 'unknown';
      }
    },
  };
}
