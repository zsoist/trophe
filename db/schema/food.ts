import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  date,
  jsonb,
  index,
  foreignKey,
  pgPolicy,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/**
 * Food-related tables.
 *
 * `food_log` — daily meal entries. Phase 4 will add `food_id FK → foods.id`
 *   and `qty_g numeric` for deterministic macro computation (DietAI24 pattern).
 *   Until then, legacy `calories/protein_g/carbs_g/fat_g` text columns stay.
 *
 * `food_database` — curated food reference data (seed + USDA v0.3).
 *   Phase 4 replaces this with the full `foods` table (pgvector + pg_trgm).
 *
 * `custom_foods` — user-created food definitions shared within coach's roster.
 */

export const foodLog = pgTable('food_log', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  loggedDate: date('logged_date').default(sql`CURRENT_DATE`).notNull(),
  mealType: text('meal_type'),
  foodName: text('food_name').notNull(),
  quantity: real().default(1).notNull(),
  unit: text().default('serving'),
  calories: integer(),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  fiberG: real('fiber_g'),
  source: text(),
  sourceId: text('source_id'),
  photoUrl: text('photo_url'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_food_log_user_date').using('btree', table.userId.asc().nullsLast().op('date_ops'), table.loggedDate.asc().nullsLast().op('date_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'food_log_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Clients manage own food log', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client food log', { as: 'permissive', for: 'select', to: ['public'] }),
  check('food_log_meal_type_check', sql`meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'pre_workout'::text, 'post_workout'::text])`),
  check('food_log_source_check', sql`source = ANY (ARRAY['usda'::text, 'openfoodfacts'::text, 'custom'::text, 'photo_ai'::text, 'natural_language'::text, 'ai_estimate'::text])`),
]);

export const foodDatabase = pgTable('food_database', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  nameEl: text('name_el'),
  nameEs: text('name_es'),
  caloriesPer100G: real('calories_per_100g').notNull(),
  proteinPer100G: real('protein_per_100g').notNull(),
  carbsPer100G: real('carbs_per_100g').notNull(),
  fatPer100G: real('fat_per_100g').notNull(),
  fiberPer100G: real('fiber_per_100g').default(0),
  defaultServingGrams: real('default_serving_grams').default(100),
  defaultServingUnit: text('default_serving_unit').default('100g'),
  commonUnits: jsonb('common_units').default([]),
  category: text(),
  source: text(),
  sourceId: text('source_id'),
  popularity: integer().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_food_db_name').using('btree', table.name.asc().nullsLast().op('text_ops')),
  index('idx_food_db_name_el').using('btree', table.nameEl.asc().nullsLast().op('text_ops')),
  index('idx_food_db_name_es').using('btree', table.nameEs.asc().nullsLast().op('text_ops')),
  index('idx_food_db_popularity').using('btree', table.popularity.desc().nullsFirst().op('int4_ops')),
  index('idx_food_db_search').using('gin', sql`to_tsvector('simple'::regconfig, (((COALESCE(name, ''::text) || ' '::text) || COALESCE(name_el, ''::text)) || ' '::text) || COALESCE(name_es, ''::text))`),
  unique('food_database_name_source_key').on(table.name, table.source),
  pgPolicy('All authenticated read food_database', { as: 'permissive', for: 'select', to: ['public'], using: sql`(auth.uid() IS NOT NULL)` }),
  pgPolicy('Coaches insert food_database', { as: 'permissive', for: 'insert', to: ['public'] }),
  check('food_database_source_check', sql`source = ANY (ARRAY['seed'::text, 'usda'::text, 'openfoodfacts'::text, 'coach'::text])`),
]);

export const customFoods = pgTable('custom_foods', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdBy: uuid('created_by'),
  name: text().notNull(),
  calories: integer(),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  fiberG: real('fiber_g'),
  unit: text().default('100g'),
  category: text(),
  shared: boolean().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.createdBy], foreignColumns: [profiles.id], name: 'custom_foods_created_by_fkey' }),
  pgPolicy('Users manage own custom foods', { as: 'permissive', for: 'all', to: ['public'], using: sql`(created_by = auth.uid())` }),
  pgPolicy('Clients see coach shared foods', { as: 'permissive', for: 'select', to: ['public'] }),
]);
