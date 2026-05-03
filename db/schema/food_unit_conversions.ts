/**
 * Trophē v0.3 — food_unit_conversions table.
 *
 * THE ACCURACY BUG FIX.
 *
 * The 81% accuracy problem (Apr 25 codex): `enrich.ts` inferred grams from
 * a 80-item local dictionary via substring match. When no match existed, the
 * LLM's invented macros shipped unmodified. The fix: every unit/food pair maps
 * to a verified `grams_per_unit` value. Macros = grams × food.kcal_per_100g/100.
 *
 * Examples of rows in this table:
 *   (feta cheese,  'slice',    null,          20)   ← 20g per slice
 *   (chicken,      'palm',     null,          120)  ← 120g per palm
 *   (olive oil,    'tbsp',     null,          14)   ← 14g per tablespoon
 *   (bread,        'slice',    'thin',        20)
 *   (bread,        'slice',    'thick',       40)
 *   (protein bar,  'bar',      null,          60)
 *   (any,          'g',        null,          1)    ← universal weight
 *   (any,          'kg',       null,          1000)
 *   (any,          'oz',       null,          28.35)
 *   (any,          'cup',      'cooked',      200)
 *   (any,          'cup',      'raw',         100)
 *
 * `food_id IS NULL` rows are universal fallback conversions (g, kg, oz, ml, lb).
 * Food-specific rows take priority over universal fallbacks.
 *
 * `source` values: 'usda' | 'kavdas' | 'coach' | 'auto' (AI-inferred, ≥80% confidence)
 */

import {
  pgTable,
  uuid,
  text,
  real,
  timestamp,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { foods } from './foods';

export const foodUnitConversions = pgTable(
  'food_unit_conversions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /**
     * FK to foods.id. NULL = universal unit (applies to any food).
     * Query strategy: try food-specific first, fall back to food_id IS NULL.
     */
    foodId: uuid('food_id'),

    /**
     * Normalized unit string.
     * Canonical forms: 'g', 'kg', 'oz', 'lb', 'ml', 'l',
     *   'cup', 'tbsp', 'tsp', 'slice', 'piece', 'serving',
     *   'palm', 'handful', 'fistful', 'scoop',
     *   Greek: 'φέτα', 'φλ', 'κ.σ.', 'κ.γ.', 'γρ', 'παλάμη', 'χούφτα'
     */
    unit: text('unit').notNull(),

    /**
     * Optional qualifier to disambiguate same unit for same food.
     * e.g. unit='slice' qualifier='thin' vs 'thick' vs 'regular'.
     * NULL = default interpretation.
     */
    qualifier: text('qualifier'),

    /**
     * Grams equivalent for one of this unit.
     * Deterministic macro = (qty × grams_per_unit) × food.kcal_per_100g / 100
     */
    gramsPerUnit: real('grams_per_unit').notNull(),

    source: text('source').notNull().default('auto'),

    /** Human who reviewed this entry (UUID → profiles.id), null if auto. */
    reviewedBy: uuid('reviewed_by'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Fast lookup: (food_id, unit) → grams_per_unit
    index('idx_fuc_food_unit').on(t.foodId, t.unit),
    // Universal fallback lookup: (NULL, unit) → grams_per_unit
    index('idx_fuc_universal_unit').on(t.unit),
    foreignKey({
      columns: [t.foodId],
      foreignColumns: [foods.id],
      name: 'food_unit_conversions_food_id_fkey',
    }).onDelete('cascade'),
  ],
);

export type InsertFoodUnitConversion = typeof foodUnitConversions.$inferInsert;
export type SelectFoodUnitConversion = typeof foodUnitConversions.$inferSelect;
