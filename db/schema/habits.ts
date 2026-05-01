import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  boolean,
  date,
  index,
  foreignKey,
  pgPolicy,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/** Habit definitions — template habits are visible to all users. */
export const habits = pgTable('habits', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdBy: uuid('created_by'),
  nameEn: text('name_en').notNull(),
  nameEs: text('name_es'),
  nameEl: text('name_el'),
  descriptionEn: text('description_en'),
  descriptionEs: text('description_es'),
  descriptionEl: text('description_el'),
  emoji: text().default('🎯'),
  category: text(),
  difficulty: text().default('beginner'),
  targetValue: real('target_value'),
  targetUnit: text('target_unit'),
  cycleDays: integer('cycle_days').default(14),
  suggestedOrder: integer('suggested_order'),
  isTemplate: boolean('is_template').default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.createdBy],
    foreignColumns: [profiles.id],
    name: 'habits_created_by_fkey',
  }),
  pgPolicy('All users see template habits', { as: 'permissive', for: 'select', to: ['public'], using: sql`(is_template = true)` }),
  pgPolicy('Coaches see own habits', { as: 'permissive', for: 'select', to: ['public'] }),
  pgPolicy('Coaches can create habits', { as: 'permissive', for: 'insert', to: ['public'] }),
  pgPolicy('Coaches can update own habits', { as: 'permissive', for: 'update', to: ['public'] }),
  check('habits_category_check', sql`category = ANY (ARRAY['nutrition'::text, 'hydration'::text, 'movement'::text, 'sleep'::text, 'mindset'::text, 'recovery'::text])`),
  check('habits_difficulty_check', sql`difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])`),
]);

/** Assignment of a habit to a client by a coach. */
export const clientHabits = pgTable('client_habits', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  clientId: uuid('client_id'),
  habitId: uuid('habit_id'),
  assignedBy: uuid('assigned_by'),
  status: text().default('active'),
  startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
  currentStreak: integer('current_streak').default(0),
  bestStreak: integer('best_streak').default(0),
  totalCompletions: integer('total_completions').default(0),
  sequenceNumber: integer('sequence_number').default(1),
  coachNote: text('coach_note'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_client_habits_client').using('btree', table.clientId.asc().nullsLast().op('uuid_ops')),
  index('idx_client_habits_status').using('btree', table.status.asc().nullsLast().op('text_ops')),
  foreignKey({ columns: [table.assignedBy], foreignColumns: [profiles.id], name: 'client_habits_assigned_by_fkey' }),
  foreignKey({ columns: [table.clientId], foreignColumns: [profiles.id], name: 'client_habits_client_id_fkey' }).onDelete('cascade'),
  foreignKey({ columns: [table.habitId], foreignColumns: [habits.id], name: 'client_habits_habit_id_fkey' }),
  pgPolicy('Clients see own habits', { as: 'permissive', for: 'select', to: ['public'], using: sql`(client_id = auth.uid())` }),
  pgPolicy('Coaches manage assigned habits', { as: 'permissive', for: 'all', to: ['public'] }),
  check('client_habits_status_check', sql`status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text, 'skipped'::text])`),
]);

/** Daily check-in against an assigned habit. One row per (client_habit, date). */
export const habitCheckins = pgTable('habit_checkins', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  clientHabitId: uuid('client_habit_id'),
  userId: uuid('user_id'),
  checkedDate: date('checked_date').default(sql`CURRENT_DATE`).notNull(),
  completed: boolean().notNull(),
  value: real(),
  note: text(),
  mood: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_habit_checkins_date').using('btree', table.checkedDate.asc().nullsLast().op('date_ops')),
  index('idx_habit_checkins_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
  foreignKey({ columns: [table.clientHabitId], foreignColumns: [clientHabits.id], name: 'habit_checkins_client_habit_id_fkey' }).onDelete('cascade'),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'habit_checkins_user_id_fkey' }),
  unique('habit_checkins_client_habit_id_checked_date_key').on(table.clientHabitId, table.checkedDate),
  pgPolicy('Clients manage own checkins', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client checkins', { as: 'permissive', for: 'select', to: ['public'] }),
  check('habit_checkins_mood_check', sql`mood = ANY (ARRAY['great'::text, 'good'::text, 'okay'::text, 'tough'::text, 'struggled'::text])`),
]);
