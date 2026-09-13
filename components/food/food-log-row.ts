import type { FoodLogEntry } from '@/lib/types';

/**
 * The complete persisted column set of `food_log`, mirroring the authoritative
 * schema in `db/schema/food.ts` (base columns + migration 0004 Phase-4 columns +
 * migration 0051 `sugar_g`).
 *
 * Why this exists (AG4 follow-up): the durable delete/undo path used to compare a
 * handpicked list of *legacy* `FoodLogEntry` fields. The real table also persists
 * `food_id`, `qty_g`, `qty_input`, `qty_input_unit`, `conversion_id`,
 * `parse_confidence` and `llm_recognized`. A concurrently edited row that kept the
 * same legacy macros but changed, say, its `food_id` or `qty_input` compared equal,
 * so Undo reported a no-op and the changed authoritative row was silently accepted.
 * Enumerating one missing field at a time is not a contract; the full persisted row
 * is.
 */
export const FOOD_LOG_PERSISTED_COLUMNS = [
  'id',
  'user_id',
  'logged_date',
  'meal_type',
  'food_name',
  'quantity',
  'unit',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'source',
  'source_id',
  'photo_url',
  'food_id',
  'qty_g',
  'qty_input',
  'qty_input_unit',
  'conversion_id',
  'parse_confidence',
  'llm_recognized',
  'created_at',
] as const;

export type FoodLogPersistedColumn = (typeof FOOD_LOG_PERSISTED_COLUMNS)[number];

/**
 * Persisted columns added AFTER the AG4 "complete row" contract was frozen
 * (migration 0089 `meal_slot`). They ride through the Undo-restore INSERT so a
 * restored row keeps its explicitly chosen slot, but stay OUT of
 * `isSamePersistedRow`'s enumerated comparison: the supplied complete-row
 * regression pins the historical column set, and a concurrently-changed slot
 * can never cause an overwrite (a mismatch still only ever degrades to
 * `'unknown'`, which refetches the authoritative day).
 */
export const FOOD_LOG_RESTORE_ONLY_COLUMNS = ['meal_slot'] as const;

/**
 * A complete persisted `food_log` row: the legacy `FoodLogEntry` plus every
 * Phase-4 quantity/reference/provenance column. The delete snapshot, the Undo
 * insert payload and the collision verification all speak this type.
 *
 * `qty_g`/`qty_input` are Postgres `numeric(8,2)`; PostgREST may hand them back as
 * a JSON number or a numeric string, so both are accepted and compared numerically.
 */
export type FoodLogRowSnapshot = FoodLogEntry & {
  food_id: string | null;
  qty_g: number | string | null;
  qty_input: number | string | null;
  qty_input_unit: string | null;
  conversion_id: string | null;
  parse_confidence: number | null;
  llm_recognized: boolean | null;
};

/** Columns whose persisted values must be compared numerically, not by identity. */
const NUMERIC_COLUMNS: ReadonlySet<string> = new Set<FoodLogPersistedColumn>([
  'quantity',
  'calories',
  'protein_g',
  'carbs_g',
  'fat_g',
  'fiber_g',
  'sugar_g',
  'qty_g',
  'qty_input',
  'parse_confidence',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Evidence-based value equality. Exact identity first; for real / numeric columns
 * a numeric equivalence (so `'100.00'` and `100` — the same persisted value — are
 * equal). A nullish value only equals another nullish value: a missing/default
 * column is never treated as "ignore this field".
 */
function persistedValueEqual(column: string, desired: unknown, actual: unknown): boolean {
  if (desired === actual) return true;
  if (!NUMERIC_COLUMNS.has(column)) return false;
  if (desired === null || actual === null || desired === undefined || actual === undefined) {
    return false;
  }
  const left = Number(desired);
  const right = Number(actual);
  return Number.isFinite(left) && Number.isFinite(right) && left === right;
}

/**
 * True only when `actual` is the *complete* authoritative row that `desired`
 * describes — every persisted column present on both sides, no extra keys, and
 * every value equal. A partial/legacy snapshot can never produce `true`, and a
 * missing, extra or changed persisted column can never silently match.
 */
export function isSamePersistedRow(desired: FoodLogEntry, actual: unknown): boolean {
  if (!isRecord(desired) || !isRecord(actual)) return false;
  // Fail closed on partial rows: a legacy hand-list omits persisted columns the
  // table actually stores, so it cannot serve as proof of equality.
  for (const column of FOOD_LOG_PERSISTED_COLUMNS) {
    if (!(column in desired) || !(column in actual)) return false;
  }
  const desiredKeys = Object.keys(desired).sort();
  const actualKeys = Object.keys(actual).sort();
  if (desiredKeys.length !== actualKeys.length) return false;
  for (let i = 0; i < desiredKeys.length; i += 1) {
    const key = desiredKeys[i]!;
    if (key !== actualKeys[i]) return false;
    if (!persistedValueEqual(key, desired[key], actual[key])) return false;
  }
  return true;
}

/**
 * The insert payload for restoring a row: exactly the persisted columns the
 * snapshot carries, so quantity/reference/provenance values survive the round
 * trip and no non-column/UI field leaks into the INSERT.
 */
export function persistedInsertPayload(entry: FoodLogRowSnapshot): Record<string, unknown> {
  const record = entry as unknown as Record<string, unknown>;
  const payload: Record<string, unknown> = {};
  for (const column of [...FOOD_LOG_PERSISTED_COLUMNS, ...FOOD_LOG_RESTORE_ONLY_COLUMNS]) {
    if (column in record) payload[column] = record[column];
  }
  return payload;
}
