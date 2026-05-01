import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  real,
  index,
  foreignKey,
  pgPolicy,
  check,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { userRoleEnum } from './enums';
import { usersInAuth } from './auth';

/**
 * Core identity tables.
 *
 * `profiles` — one row per authenticated user; mirrors `auth.users` via FK.
 *   Phase 1 change: `role` column upgraded from `text` + check constraint
 *   to `userRoleEnum` (super_admin | admin | coach | client).
 *   The migration coerces legacy `'both'` → `'coach'` before the ALTER TYPE.
 *
 * `client_profiles` — nutrition/fitness metadata for client-role users.
 *   Owned by the client; coach has UPDATE access for macro targets.
 */

export const profiles = pgTable('profiles', {
  id: uuid().primaryKey().notNull(),
  fullName: text('full_name').notNull(),
  email: text().notNull(),
  /** Phase 1: upgraded from text → userRoleEnum. */
  role: userRoleEnum('role').default('client').notNull(),
  avatarUrl: text('avatar_url'),
  language: text().default('en'),
  timezone: text().default('UTC'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.id],
    foreignColumns: [usersInAuth.id],
    name: 'profiles_id_fkey',
  }).onDelete('cascade'),
  pgPolicy('Users can view own profile', { as: 'permissive', for: 'select', to: ['public'], using: sql`(auth.uid() = id)` }),
  pgPolicy('Users can update own profile', { as: 'permissive', for: 'update', to: ['public'] }),
  pgPolicy('Users can insert own profile', { as: 'permissive', for: 'insert', to: ['public'] }),
  pgPolicy('Coaches can view client profiles', { as: 'permissive', for: 'select', to: ['public'] }),
  /** Phase 1: super_admin and admin can see all profiles. */
  pgPolicy('Super admin full profile access', { as: 'permissive', for: 'all', to: ['public'],
    using: sql`(SELECT is_super_admin())` }),
  check('profiles_language_check', sql`language = ANY (ARRAY['en'::text, 'es'::text, 'el'::text])`),
]);

export const clientProfiles = pgTable('client_profiles', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  coachId: uuid('coach_id'),
  age: integer(),
  sex: text(),
  heightCm: real('height_cm'),
  weightKg: real('weight_kg'),
  bodyFatPct: real('body_fat_pct'),
  activityLevel: text('activity_level'),
  goal: text(),
  bmr: real(),
  tdee: real(),
  targetCalories: integer('target_calories'),
  targetProteinG: integer('target_protein_g'),
  targetCarbsG: integer('target_carbs_g'),
  targetFatG: integer('target_fat_g'),
  targetFiberG: integer('target_fiber_g'),
  targetWaterMl: integer('target_water_ml'),
  currentHabitId: uuid('current_habit_id'),
  coachingPhase: text('coaching_phase').default('onboarding'),
  notes: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_client_profiles_coach').using('btree', table.coachId.asc().nullsLast().op('uuid_ops')),
  index('idx_client_profiles_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
  foreignKey({
    columns: [table.coachId],
    foreignColumns: [profiles.id],
    name: 'client_profiles_coach_id_fkey',
  }),
  foreignKey({
    columns: [table.userId],
    foreignColumns: [profiles.id],
    name: 'client_profiles_user_id_fkey',
  }).onDelete('cascade'),
  unique('client_profiles_user_id_key').on(table.userId),
  pgPolicy('Users can manage own client_profile', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches can view assigned clients', { as: 'permissive', for: 'select', to: ['public'] }),
  pgPolicy('Coaches can update assigned clients', { as: 'permissive', for: 'update', to: ['public'] }),
  check('client_profiles_activity_level_check', sql`activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text])`),
  check('client_profiles_coaching_phase_check', sql`coaching_phase = ANY (ARRAY['onboarding'::text, 'active'::text, 'maintenance'::text])`),
  check('client_profiles_goal_check', sql`goal = ANY (ARRAY['fat_loss'::text, 'muscle_gain'::text, 'maintenance'::text, 'recomp'::text, 'endurance'::text, 'health'::text])`),
  check('client_profiles_sex_check', sql`sex = ANY (ARRAY['male'::text, 'female'::text])`),
]);
