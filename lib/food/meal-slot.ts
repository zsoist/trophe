import type { FoodLogEntry, MealType } from '@/lib/types';

/**
 * Canonical meal-slot helper — the single source of truth for how a logged
 * entry is routed to a rendered meal card.
 *
 * Background (user-reported defect): both snack slots ("Morning Snack" /
 * "Afternoon Snack") stored the SAME canonical `meal_type = 'snack'`, so the log
 * surface guessed AM vs PM from `new Date(created_at).getHours()`. `created_at`
 * is the row's INSERT time, not the consumption time or the slot the user
 * actually tapped: backdated logging (log a prior day at 01:00) and a different
 * browser timezone both misrouted an afternoon snack into "Morning Snack".
 *
 * The fix is an explicit, persisted `meal_slot` token captured at log time. This
 * module owns the token vocabulary and the (pure) routing so every surface —
 * page, writers, tests — speaks the same contract. It NEVER infers a slot from
 * wall-clock time or the browser timezone, and it NEVER invents AM/PM for a row
 * that lacks authoritative evidence (legacy `meal_slot IS NULL`).
 */

/**
 * Every persisted `meal_slot` value.
 *
 * - `breakfast` / `lunch` / `dinner` / `pre_workout` / `post_workout` are both
 *   a slot AND a `meal_type`.
 * - `snack_am` / `snack_pm` are the two *default* snack slots; they persist
 *   their AM/PM identity while `meal_type` stays the canonical `'snack'`.
 * - `snack` is a generic, AM/PM-unknown snack (a custom snack slot, the coach
 *   assistant's `snack` meal, or a legacy row). It is truthful, not a guess.
 */
export const CANONICAL_MEAL_SLOTS = [
  'breakfast',
  'lunch',
  'dinner',
  'snack_am',
  'snack_pm',
  'snack',
  'pre_workout',
  'post_workout',
] as const;

export type CanonicalMealSlot = (typeof CANONICAL_MEAL_SLOTS)[number];

const CANONICAL_MEAL_SLOT_SET: ReadonlySet<string> = new Set(CANONICAL_MEAL_SLOTS);

/** True when `value` is a persisted `meal_slot` token. */
export function isCanonicalMealSlot(value: unknown): value is CanonicalMealSlot {
  return typeof value === 'string' && CANONICAL_MEAL_SLOT_SET.has(value);
}

/**
 * Whether a persisted `meal_slot` is consistent with its canonical `meal_type`.
 * Used to reject invalid combinations BEFORE any write.
 */
export function mealSlotMatchesMealType(
  mealSlot: CanonicalMealSlot,
  mealType: MealType,
): boolean {
  if (mealSlot === 'snack_am' || mealSlot === 'snack_pm') return mealType === 'snack';
  return mealSlot === mealType;
}

/** Minimal structural view of a rendered slot (avoids a lib → component import). */
export interface MealSlotLike {
  id: string;
  mealType: MealType;
}

/**
 * The persisted token for a slot the user chose.
 *
 * The two default snack slots keep their AM/PM identity. Every other slot —
 * including custom slots, whose `id` (`custom_<timestamp>`) is not stable across
 * sessions, devices or a re-order — stores its `mealType`. That is truthful and
 * round-trips: a custom "Snack" slot reads back as the generic `'snack'`.
 */
export function canonicalSlotForMealSlot(slot: MealSlotLike): CanonicalMealSlot {
  if (slot.id === 'snack_am' || slot.id === 'snack_pm') return slot.id;
  return slot.mealType;
}

/**
 * The token a row is grouped by. Prefers the explicit persisted `meal_slot`;
 * falls back to `meal_type` for rows written before the column existed (or by a
 * client that has not been updated). A `snack`/NULL meal_type collapses to the
 * generic `'snack'` — never AM/PM.
 */
export function resolveSlotToken(
  entry: Pick<FoodLogEntry, 'meal_slot' | 'meal_type'>,
): CanonicalMealSlot {
  const raw = entry.meal_slot;
  if (isCanonicalMealSlot(raw)) return raw;
  const mealType = entry.meal_type;
  if (
    mealType === 'breakfast' ||
    mealType === 'lunch' ||
    mealType === 'dinner' ||
    mealType === 'pre_workout' ||
    mealType === 'post_workout'
  ) {
    return mealType;
  }
  return 'snack';
}

/**
 * Which rendered slot (by `id`) an entry belongs to, or `null` when no slot
 * claims it (the caller then shows it in a truthful generic bucket).
 */
export function slotIdForEntry(
  entry: Pick<FoodLogEntry, 'meal_slot' | 'meal_type'>,
  slots: readonly MealSlotLike[],
): string | null {
  const token = resolveSlotToken(entry);
  if (slots.some((slot) => slot.id === token)) return token;
  if (token === 'snack' || token === 'snack_am' || token === 'snack_pm') {
    // The exact snack slot is gone (e.g. the user replaced the defaults). Only a
    // single unambiguous generic snack slot may adopt it; otherwise it stays
    // generic — we never guess AM vs PM.
    const generic = slots.filter(
      (slot) => slot.mealType === 'snack' && slot.id !== 'snack_am' && slot.id !== 'snack_pm',
    );
    return generic.length === 1 ? generic[0]!.id : null;
  }
  return slots.find((slot) => slot.mealType === token)?.id ?? null;
}

/** The generic bucket key a token falls back to when no slot claims it. */
export function fallbackBucketForToken(token: CanonicalMealSlot): MealType {
  return token === 'snack_am' || token === 'snack_pm' ? 'snack' : token;
}

/**
 * Group entries onto slot ids. Entries no slot claims land in a truthful generic
 * bucket keyed by their canonical meal type (`'snack'`, `'dinner'`, ...). The
 * page renders those buckets only when non-empty, so nothing is silently dropped
 * and no entry is mislabelled by `created_at`.
 */
export function groupBySlot(
  entries: FoodLogEntry[],
  slots: readonly MealSlotLike[],
): Record<string, FoodLogEntry[]> {
  const grouped: Record<string, FoodLogEntry[]> = {};
  for (const slot of slots) grouped[slot.id] = [];
  for (const entry of entries) {
    const resolved = slotIdForEntry(entry, slots);
    const key = resolved ?? fallbackBucketForToken(resolveSlotToken(entry));
    (grouped[key] ??= []).push(entry);
  }
  return grouped;
}

/** Bucket keys produced by {@link groupBySlot} that are not real slot ids and hold entries. */
export function fallbackBucketIds(
  grouped: Record<string, FoodLogEntry[]>,
  slots: readonly MealSlotLike[],
): MealType[] {
  const known = new Set(slots.map((slot) => slot.id));
  return (Object.keys(grouped) as MealType[]).filter(
    (id) => !known.has(id) && grouped[id].length > 0,
  );
}
