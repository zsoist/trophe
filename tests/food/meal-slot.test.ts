import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_MEAL_SLOTS,
  canonicalSlotForMealSlot,
  fallbackBucketIds,
  groupBySlot,
  isCanonicalMealSlot,
  mealSlotMatchesMealType,
  resolveSlotToken,
  slotIdForEntry,
} from '@/lib/food/meal-slot';
import { foodLogAddSchema } from '@/lib/food/log-create-validation';
import { buildReviewedFoodLogEntries } from '@/lib/food/reviewed-log-entry';
import { persistedInsertPayload } from '@/components/food/food-log-row';
import type { FoodLogRowSnapshot } from '@/components/food/food-log-row';
import type { FoodLogEntry } from '@/lib/types';

const DEFAULT_SLOTS = [
  { id: 'breakfast', mealType: 'breakfast' },
  { id: 'snack_am', mealType: 'snack' },
  { id: 'lunch', mealType: 'lunch' },
  { id: 'snack_pm', mealType: 'snack' },
  { id: 'dinner', mealType: 'dinner' },
] as const;

function entry(overrides: Partial<FoodLogEntry>): FoodLogEntry {
  return {
    id: 'e1',
    user_id: 'u1',
    logged_date: '2026-09-12',
    meal_type: 'snack',
    meal_slot: null,
    food_name: 'Yogurt',
    quantity: 1,
    unit: 'serving',
    calories: 120,
    protein_g: 10,
    carbs_g: 12,
    fat_g: 3,
    fiber_g: 1,
    sugar_g: 6,
    source: 'custom',
    source_id: null,
    photo_url: null,
    created_at: '2026-09-12T13:00:00.000Z',
    ...overrides,
  };
}

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');

describe('meal-slot canonical vocabulary', () => {
  it('validates the persisted tokens', () => {
    for (const value of CANONICAL_MEAL_SLOTS) expect(isCanonicalMealSlot(value)).toBe(true);
    expect(isCanonicalMealSlot('brunch')).toBe(false);
    expect(isCanonicalMealSlot(undefined)).toBe(false);
    expect(isCanonicalMealSlot(7)).toBe(false);
  });

  it('keeps snack_am/snack_pm consistent with meal_type=snack only', () => {
    expect(mealSlotMatchesMealType('snack_am', 'snack')).toBe(true);
    expect(mealSlotMatchesMealType('snack_pm', 'snack')).toBe(true);
    expect(mealSlotMatchesMealType('snack', 'snack')).toBe(true);
    expect(mealSlotMatchesMealType('dinner', 'dinner')).toBe(true);
    expect(mealSlotMatchesMealType('snack_pm', 'dinner')).toBe(false);
    expect(mealSlotMatchesMealType('dinner', 'snack')).toBe(false);
  });

  it('persists AM/PM for the default snack slots, the meal type for custom slots', () => {
    expect(canonicalSlotForMealSlot({ id: 'snack_am', mealType: 'snack' })).toBe('snack_am');
    expect(canonicalSlotForMealSlot({ id: 'snack_pm', mealType: 'snack' })).toBe('snack_pm');
    expect(canonicalSlotForMealSlot({ id: 'custom_1728', mealType: 'snack' })).toBe('snack');
    expect(canonicalSlotForMealSlot({ id: 'custom_9', mealType: 'dinner' })).toBe('dinner');
  });
});

describe('meal slot routing never uses created_at / browser timezone', () => {
  it('routes an explicit afternoon snack logged at 01:00 for a prior day to snack_pm', () => {
    const priorDaySnack = entry({
      logged_date: '2026-09-10',
      meal_type: 'snack',
      meal_slot: 'snack_pm',
      created_at: '2026-09-11T01:00:00.000Z', // 01:00 local insert
    });
    const grouped = groupBySlot([priorDaySnack], DEFAULT_SLOTS);
    expect(grouped.snack_pm).toEqual([priorDaySnack]);
    expect(grouped.snack_am).toEqual([]);
  });

  it('is invariant to the insert hour (created_at) for an explicit slot', () => {
    for (const created_at of [
      '2026-09-11T01:00:00.000Z',
      '2026-09-11T09:30:00.000Z',
      '2026-09-11T23:15:00.000Z',
    ]) {
      const grouped = groupBySlot(
        [entry({ meal_type: 'snack', meal_slot: 'snack_pm', created_at })],
        DEFAULT_SLOTS,
      );
      expect(grouped.snack_pm).toHaveLength(1);
      expect(grouped.snack_am).toHaveLength(0);
    }
  });

  it('routes an explicit dinner at any clock', () => {
    const grouped = groupBySlot(
      [entry({ meal_type: 'dinner', meal_slot: 'dinner', created_at: '2026-09-12T02:05:00.000Z' })],
      DEFAULT_SLOTS,
    );
    expect(grouped.dinner).toHaveLength(1);
    expect(grouped.snack_am).toHaveLength(0);
    expect(grouped.snack_pm).toHaveLength(0);
  });

  it('never relabels a legacy snack (no authoritative AM/PM) as Morning', () => {
    const legacy = entry({ meal_type: 'snack', meal_slot: null, created_at: '2026-09-12T03:00:00.000Z' });
    const grouped = groupBySlot([legacy], DEFAULT_SLOTS);
    expect(grouped.snack).toEqual([legacy]);
    expect(grouped.snack_am).toEqual([]);
    expect(grouped.snack_pm).toEqual([]);
    expect(fallbackBucketIds(grouped, DEFAULT_SLOTS)).toEqual(['snack']);
  });

  it('treats a null meal_type like an unspecified snack (generic bucket)', () => {
    const unknown = entry({ meal_type: null, meal_slot: null });
    expect(resolveSlotToken(unknown)).toBe('snack');
    expect(slotIdForEntry(unknown, DEFAULT_SLOTS)).toBeNull();
    const grouped = groupBySlot([unknown], DEFAULT_SLOTS);
    expect(grouped.snack).toEqual([unknown]);
  });

  it('falls back to meal_type for rows written before the column existed', () => {
    expect(resolveSlotToken(entry({ meal_type: 'lunch', meal_slot: undefined }))).toBe('lunch');
    expect(slotIdForEntry(entry({ meal_type: 'lunch', meal_slot: undefined }), DEFAULT_SLOTS)).toBe('lunch');
  });

  it('does not guess AM/PM when a custom layout has one generic snack slot', () => {
    const slots = [
      { id: 'breakfast', mealType: 'breakfast' },
      { id: 'custom_snack', mealType: 'snack' },
      { id: 'dinner', mealType: 'dinner' },
    ] as const;
    // Explicit snack_pm whose default slot is gone → the one generic snack slot adopts it.
    expect(slotIdForEntry(entry({ meal_slot: 'snack_pm' }), slots)).toBe('custom_snack');
    // Legacy snack → the generic slot too (still no AM/PM claim).
    expect(slotIdForEntry(entry({ meal_slot: null, meal_type: 'snack' }), slots)).toBe('custom_snack');
  });

  it('keeps pre/post workout out of the snack cards', () => {
    const grouped = groupBySlot(
      [entry({ meal_type: 'pre_workout', meal_slot: 'pre_workout' })],
      DEFAULT_SLOTS,
    );
    expect(grouped.snack_am).toHaveLength(0);
    expect(grouped.snack_pm).toHaveLength(0);
    expect(grouped.pre_workout).toHaveLength(1);
  });
});

describe('log surface wiring (time-free routing)', () => {
  const page = read('app/dashboard/log/page.tsx');

  it('imports the shared grouping helper and drops the created_at hour heuristic', () => {
    expect(page).toContain("from '@/lib/food/meal-slot'");
    expect(page).toContain('groupBySlot(todayLog, baseSlots)');
    // The old snack routing derived AM/PM from the insert hour — gone.
    expect(page).not.toMatch(/getHours\(\)\s*<\s*14/);
    expect(page).not.toMatch(/created_at\)\.getHours/);
  });

  it('renders a truthful generic bucket only when entries are unclaimed', () => {
    expect(page).toContain('fallbackBucketIds(grouped, baseSlots)');
    expect(page).toContain('fallbackBucketSlot');
  });
});

describe('meal-slot write contract', () => {
  it('carries the explicit slot into reviewed inserts', () => {
    const [created] = buildReviewedFoodLogEntries({
      userId: 'u1',
      date: '2026-09-10',
      mealType: 'snack',
      mealSlot: 'snack_pm',
      inputSource: 'text',
      items: [{
        raw_text: 'greek yogurt',
        food_name: 'Greek Yogurt',
        name_localized: 'Greek Yogurt',
        quantity: 1,
        unit: 'serving',
        grams: 170,
        calories: 100,
        protein_g: 17,
        carbs_g: 6,
        fat_g: 0.5,
        fiber_g: 0,
        sugar_g: 4,
        confidence: 0.9,
        source: 'local_db',
        portion_explicit: true,
        food_state: 'prepared',
        db_food_id: null,
      }],
    });
    expect(created.meal_slot).toBe('snack_pm');
    expect(created.meal_type).toBe('snack');
  });

  it('defaults the slot to the coarse meal (never fabricates AM/PM)', () => {
    const [created] = buildReviewedFoodLogEntries({
      userId: 'u1',
      date: '2026-09-10',
      mealType: 'snack',
      inputSource: 'text',
      items: [{
        raw_text: 'apple',
        food_name: 'Apple',
        name_localized: 'Apple',
        quantity: 1,
        unit: 'serving',
        grams: 180,
        calories: 95,
        protein_g: 0.5,
        carbs_g: 25,
        fat_g: 0.3,
        fiber_g: 4,
        sugar_g: 19,
        confidence: 0.9,
        source: 'local_db',
        portion_explicit: true,
        food_state: 'raw',
        db_food_id: null,
      }],
    });
    expect(created.meal_slot).toBe('snack');
  });

  it('rejects an invalid slot/mealType combination before any write', () => {
    const base = {
      foodName: 'Rice',
      calories: 200,
      proteinG: 4,
      carbsG: 42,
      fatG: 0.5,
      loggedDate: '2026-09-12',
    };
    expect(foodLogAddSchema.safeParse({ ...base, mealType: 'snack', mealSlot: 'snack_pm' }).success).toBe(true);
    expect(foodLogAddSchema.safeParse({ ...base, mealType: 'dinner', mealSlot: 'dinner' }).success).toBe(true);
    expect(foodLogAddSchema.safeParse({ ...base, mealType: 'snack', mealSlot: 'dinner' }).success).toBe(false);
    expect(foodLogAddSchema.safeParse({ ...base, mealType: 'dinner', mealSlot: 'snack_am' }).success).toBe(false);
    // Omitting the slot stays valid (pre-0089 payload shape).
    expect(foodLogAddSchema.safeParse({ ...base, mealType: 'lunch' }).success).toBe(true);
  });

  it('round-trips the slot through the Undo-restore INSERT payload', () => {
    const restored = persistedInsertPayload(entry({ meal_slot: 'snack_pm' }) as unknown as FoodLogRowSnapshot);
    expect(restored).toMatchObject({ meal_slot: 'snack_pm' });
  });
});
