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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { profiles } from './profiles';

/** Exercise library — template exercises are visible to all users. */
export const exercises = pgTable('exercises', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  name: text().notNull(),
  nameEs: text('name_es'),
  nameEl: text('name_el'),
  muscleGroup: text('muscle_group').notNull(),
  secondaryMuscles: text('secondary_muscles').array(),
  equipment: text(),
  isCompound: boolean('is_compound').default(false),
  isTemplate: boolean('is_template').default(true),
  createdBy: uuid('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_exercises_muscle').using('btree', table.muscleGroup.asc().nullsLast().op('text_ops')),
  foreignKey({ columns: [table.createdBy], foreignColumns: [profiles.id], name: 'exercises_created_by_fkey' }),
  pgPolicy('All see template exercises', { as: 'permissive', for: 'select', to: ['public'], using: sql`(is_template = true)` }),
  pgPolicy('Users see own exercises', { as: 'permissive', for: 'select', to: ['public'] }),
  pgPolicy('Users create exercises', { as: 'permissive', for: 'insert', to: ['public'] }),
  check('exercises_muscle_group_check', sql`muscle_group = ANY (ARRAY['chest'::text, 'back'::text, 'shoulders'::text, 'biceps'::text, 'triceps'::text, 'forearms'::text, 'quads'::text, 'hamstrings'::text, 'glutes'::text, 'calves'::text, 'core'::text, 'full_body'::text, 'cardio'::text])`),
]);

/** Coach-created or client-personal workout templates. */
export const workoutTemplates = pgTable('workout_templates', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  createdBy: uuid('created_by'),
  name: text().notNull(),
  description: text(),
  targetMuscles: text('target_muscles').array(),
  exercises: jsonb().default([]).notNull(),
  dayLabel: text('day_label'),
  difficulty: text().default('intermediate'),
  shared: boolean().default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  foreignKey({ columns: [table.createdBy], foreignColumns: [profiles.id], name: 'workout_templates_created_by_fkey' }),
  pgPolicy('Coaches manage own templates', { as: 'permissive', for: 'all', to: ['public'], using: sql`(created_by = auth.uid())` }),
  pgPolicy('Clients see shared templates', { as: 'permissive', for: 'select', to: ['public'] }),
  check('workout_templates_difficulty_check', sql`difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])`),
]);

/** A single workout logged by the client. */
export const workoutSessions = pgTable('workout_sessions', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  sessionDate: date('session_date').default(sql`CURRENT_DATE`).notNull(),
  name: text(),
  templateId: uuid('template_id'),
  durationMinutes: integer('duration_minutes'),
  notes: text(),
  painFlags: jsonb('pain_flags').default([]),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_workout_sessions_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops'), table.sessionDate.asc().nullsLast().op('date_ops')),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'workout_sessions_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Users manage own sessions', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client sessions', { as: 'permissive', for: 'select', to: ['public'] }),
]);

/** Individual sets within a workout session. */
export const workoutSets = pgTable('workout_sets', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  sessionId: uuid('session_id'),
  exerciseId: uuid('exercise_id'),
  setNumber: integer('set_number').notNull(),
  weightKg: real('weight_kg'),
  reps: integer(),
  rpe: real(),
  isWarmup: boolean('is_warmup').default(false),
  isPr: boolean('is_pr').default(false),
  notes: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_workout_sets_exercise').using('btree', table.exerciseId.asc().nullsLast().op('uuid_ops')),
  index('idx_workout_sets_session').using('btree', table.sessionId.asc().nullsLast().op('uuid_ops')),
  foreignKey({ columns: [table.exerciseId], foreignColumns: [exercises.id], name: 'workout_sets_exercise_id_fkey' }),
  foreignKey({ columns: [table.sessionId], foreignColumns: [workoutSessions.id], name: 'workout_sets_session_id_fkey' }).onDelete('cascade'),
  pgPolicy('Users manage own sets', { as: 'permissive', for: 'all', to: ['public'],
    using: sql`(session_id IN ( SELECT workout_sessions.id
   FROM workout_sessions
  WHERE (workout_sessions.user_id = auth.uid())))` }),
  pgPolicy('Coaches view client sets', { as: 'permissive', for: 'select', to: ['public'] }),
]);

/** AI form-check analysis stored per rep set. */
export const formAnalyses = pgTable('form_analyses', {
  id: uuid().defaultRandom().primaryKey().notNull(),
  userId: uuid('user_id'),
  exerciseId: uuid('exercise_id'),
  sessionId: uuid('session_id'),
  side: text().default('right'),
  repsAnalyzed: integer('reps_analyzed').default(0),
  overallScore: real('overall_score'),
  overallAssessment: text('overall_assessment'),
  perRepScores: jsonb('per_rep_scores'),
  referenceComparison: jsonb('reference_comparison'),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
  index('idx_form_analyses_user').using('btree', table.userId.asc().nullsLast().op('uuid_ops')),
  foreignKey({ columns: [table.exerciseId], foreignColumns: [exercises.id], name: 'form_analyses_exercise_id_fkey' }),
  foreignKey({ columns: [table.sessionId], foreignColumns: [workoutSessions.id], name: 'form_analyses_session_id_fkey' }),
  foreignKey({ columns: [table.userId], foreignColumns: [profiles.id], name: 'form_analyses_user_id_fkey' }).onDelete('cascade'),
  pgPolicy('Users manage own form analyses', { as: 'permissive', for: 'all', to: ['public'], using: sql`(user_id = auth.uid())` }),
  pgPolicy('Coaches view client form analyses', { as: 'permissive', for: 'select', to: ['public'] }),
]);
