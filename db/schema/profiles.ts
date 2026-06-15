import {
  pgTable,
  uuid,
  text,
  boolean,
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
  /** Coach's default pre-appointment instructions, shown to clients on booking (migration 0041). */
  appointmentInstructions: text('appointment_instructions'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({
    columns: [table.id],
    foreignColumns: [usersInAuth.id],
    name: 'profiles_id_fkey',
  }).onDelete('cascade'),
  // TO authenticated (not public/anon) + private.is_super_admin — matches the
  // hardened SQL migration 0008. The TS source previously drifted to TO public.
  pgPolicy('Users can view own profile', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`(auth.uid() = id)` }),
  pgPolicy('Users can update own profile', { as: 'permissive', for: 'update', to: ['authenticated'],
    using: sql`(auth.uid() = id)`, withCheck: sql`(auth.uid() = id)` }),
  pgPolicy('Users can insert own profile', { as: 'permissive', for: 'insert', to: ['authenticated'], withCheck: sql`(auth.uid() = id)` }),
  pgPolicy('Coaches can view client profiles', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`private.is_coach_of(id)` }),
  /** Phase 1: super_admin and admin can see all profiles. */
  pgPolicy('Super admin full profile access', { as: 'permissive', for: 'all', to: ['authenticated'],
    using: sql`(SELECT private.is_super_admin())`,
    withCheck: sql`(SELECT private.is_super_admin())` }),
  check('profiles_language_check', sql`language = ANY (ARRAY['en'::text, 'es'::text, 'el'::text, 'fr'::text, 'de'::text, 'it'::text, 'pt'::text, 'nl'::text])`),
]);

/**
 * Coach→client invitation (migration 0038). Coach generates a shareable token;
 * the client activates via /activate?token=, is linked to the coach, and gives
 * Art.9 consent. Status: pending → accepted (or revoked).
 */
export const clientInvites = pgTable('client_invites', {
  id: uuid('id').primaryKey().defaultRandom(),
  token: uuid('token').notNull().defaultRandom(),
  coachId: uuid('coach_id').notNull(),
  clientEmail: text('client_email'),
  clientName: text('client_name'),
  status: text('status').default('pending').notNull(),
  acceptedUserId: uuid('accepted_user_id'),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_client_invites_coach').on(table.coachId),
  index('idx_client_invites_token').on(table.token),
  foreignKey({ columns: [table.coachId], foreignColumns: [profiles.id], name: 'client_invites_coach_id_fkey' }).onDelete('cascade'),
  pgPolicy('coach manages own invites', { as: 'permissive', for: 'all', to: ['authenticated'], using: sql`coach_id = (SELECT auth.uid())`, withCheck: sql`coach_id = (SELECT auth.uid())` }),
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
  // Phase 0 coach module (Michael call 2026-06-12)
  assessment: text(),
  goalTitle: text('goal_title'),
  goalMetric: text('goal_metric'),
  goalWindow: text('goal_window'),
  stabilization: boolean().default(false).notNull(),
  contactCadenceDays: integer('contact_cadence_days').default(14).notNull(),
  // Graduation / expected return (Michael call 2026-06-12, migration 0040)
  graduatedAt: timestamp('graduated_at', { withTimezone: true, mode: 'string' }),
  expectedReturnMonth: integer('expected_return_month'),
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
  pgPolicy('Users can manage own client_profile', { as: 'permissive', for: 'all', to: ['authenticated'],
    using: sql`(user_id = auth.uid())`, withCheck: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches can view assigned clients', { as: 'permissive', for: 'select', to: ['authenticated'], using: sql`private.is_coach_of(user_id)` }),
  pgPolicy('Coaches can update assigned clients', { as: 'permissive', for: 'update', to: ['authenticated'],
    using: sql`private.is_coach_of(user_id)`,
    withCheck: sql`private.is_coach_of(user_id)` }),
  check('client_profiles_activity_level_check', sql`activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text])`),
  check('client_profiles_coaching_phase_check', sql`coaching_phase = ANY (ARRAY['onboarding'::text, 'active'::text, 'maintenance'::text])`),
  check('client_profiles_goal_check', sql`goal = ANY (ARRAY['fat_loss'::text, 'muscle_gain'::text, 'maintenance'::text, 'recomp'::text, 'endurance'::text, 'health'::text])`),
  check('client_profiles_sex_check', sql`sex = ANY (ARRAY['male'::text, 'female'::text])`),
]);
