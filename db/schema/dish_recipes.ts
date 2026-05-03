/**
 * Trophē v0.3 — dish_recipes table.
 *
 * Cached composite dish decompositions. When a user logs a composite dish
 * (e.g. "souvlaki wrap with tzatziki", "arepa con queso"), the system decomposes
 * it into base ingredients, looks up each ingredient in the foods table, and
 * caches the result here. Subsequent logs of the same dish skip the LLM call.
 *
 * Sources:
 *   fndds        — USDA FNDDS 2021-2023 pre-decomposed recipes
 *   manual       — Hand-curated traditional dishes (Greek, Colombian)
 *   llm_decomp   — LLM-generated decomposition (cached after first use)
 *   menustat     — Restaurant chain items with known macros
 *
 * Architecture (DietAI24-inspired):
 *   User input → LLM decompose → pgvector lookup per ingredient → aggregate → cache
 *   On cache hit: skip LLM, serve directly from stored ingredients + foods table
 */

import {
  pgTable,
  pgEnum,
  uuid,
  text,
  real,
  integer,
  jsonb,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { profiles } from './profiles';

export const recipeSourceEnum = pgEnum('recipe_source', [
  'fndds',       // USDA FNDDS pre-decomposed
  'manual',      // Hand-curated traditional dishes
  'llm_decomp',  // LLM-generated, cached
  'menustat',    // Restaurant chain data
]);

/**
 * Each row = one composite dish with its ingredient breakdown.
 * ingredients JSONB stores: [{food_id, food_name, grams, matched_confidence}]
 */
export const dishRecipes = pgTable(
  'dish_recipes',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // ── Dish identification ───────────────────────────────────────────
    dishName: text('dish_name').notNull(),             // normalized English: "souvlaki chicken pita"
    dishNameLocalized: text('dish_name_localized'),    // original: "σουβλάκι κοτόπουλο με πίτα"
    lang: text('lang').notNull().default('en'),        // primary language of the dish name
    region: text('region').array(),                    // e.g. ['GR'], ['CO'], ['US']

    // ── Nutritional breakdown ─────────────────────────────────────────
    totalGrams: real('total_grams').notNull(),
    totalKcal: real('total_kcal').notNull(),
    totalProtein: real('total_protein').notNull(),
    totalCarbs: real('total_carbs').notNull(),
    totalFat: real('total_fat').notNull(),
    totalFiber: real('total_fiber'),

    // ── Ingredient decomposition ──────────────────────────────────────
    // Array of: {food_id: uuid, food_name: string, grams: number, matched_confidence: number}
    ingredients: jsonb('ingredients').notNull(),

    // ── Provenance ────────────────────────────────────────────────────
    source: recipeSourceEnum('source').notNull().default('llm_decomp'),
    confidence: real('confidence').default(0.8),
    verifiedBy: uuid('verified_by').references(() => profiles.id),

    // ── Usage tracking ────────────────────────────────────────────────
    useCount: integer('use_count').notNull().default(0),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).defaultNow(),

    // ── Timestamps ────────────────────────────────────────────────────
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Prevent duplicate recipes for same dish
    unique('dish_recipes_name_lang_key').on(t.dishName, t.lang),
    // Text search on dish name
    index('idx_dish_recipes_name_gin').using('gin', t.dishName),
    // Region-filtered queries
    index('idx_dish_recipes_region').using('gin', t.region),
  ],
);
