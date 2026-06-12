/**
 * Weekly meal plan entries — free-text per (day × slot), matching how coaches
 * actually prescribe ("salad + 2 beef patties + 1 cup rice").
 * Phase 0 of coach module (Michael Kavdas call, 2026-06-12).
 */
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  foreignKey,
  unique,
  check,
  pgPolicy,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

export const mealPlanEntries = pgTable('meal_plan_entries', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  clientId: uuid('client_id').notNull(),
  coachId: uuid('coach_id').notNull(),
  dayOfWeek: integer('day_of_week').notNull(),
  mealSlot: text('meal_slot').notNull(),
  description: text().default('').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index('idx_meal_plan_client').using('btree', table.clientId.asc().nullsLast().op('uuid_ops'), table.dayOfWeek.asc().nullsLast()),
  foreignKey({
    columns: [table.clientId],
    foreignColumns: [profiles.id],
    name: 'meal_plan_entries_client_id_fkey',
  }).onDelete('cascade'),
  foreignKey({
    columns: [table.coachId],
    foreignColumns: [profiles.id],
    name: 'meal_plan_entries_coach_id_fkey',
  }).onDelete('cascade'),
  unique('meal_plan_entries_client_id_day_of_week_meal_slot_key').on(table.clientId, table.dayOfWeek, table.mealSlot),
  check('meal_plan_entries_day_of_week_check', sql`day_of_week BETWEEN 0 AND 6`),
  check('meal_plan_entries_meal_slot_check', sql`meal_slot = ANY (ARRAY['breakfast'::text, 'snack1'::text, 'lunch'::text, 'snack2'::text, 'dinner'::text])`),
  pgPolicy('meal_plan_coach_all', { as: 'permissive', for: 'all', to: ['authenticated'], using: sql`coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id)` }),
  pgPolicy('meal_plan_client_select', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`client_id = (SELECT auth.uid())` }),
]);

export type SelectMealPlanEntry = typeof mealPlanEntries.$inferSelect;
