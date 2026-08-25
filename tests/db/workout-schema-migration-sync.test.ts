import { describe, expect, it } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { workoutSessions, workoutSets } from '@/db/schema/workouts';

describe('workout Drizzle schema mirrors migrations 0075 through 0077', () => {
  it('declares every atomic/live/cardio column', () => {
    const sessions = getTableConfig(workoutSessions);
    const sets = getTableConfig(workoutSets);
    expect(sessions.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'client_idempotency_key', 'client_request', 'live_structure',
      'live_structure_version', 'client_draft_fingerprint', 'client_draft_hash',
      'pain_mutation_ids', 'live_finish_request', 'workout_kind',
      'cardio_activity', 'cardio_distance_km', 'cardio_effort', 'completed_at',
    ]));
    expect(sets.columns.map((column) => column.name)).toContain('client_request');
  });

  it('declares the three canonical replay/identity indexes', () => {
    const sessionIndexes = getTableConfig(workoutSessions).indexes.map((index) => index.config.name);
    const setIndexes = getTableConfig(workoutSets).indexes.map((index) => index.config.name);
    expect(sessionIndexes).toEqual(expect.arrayContaining([
      'workout_sessions_user_id_client_idempotency_key_unique',
      'workout_sessions_user_draft_hash_unique',
    ]));
    expect(setIndexes).toContain('workout_sets_session_exercise_number_unique');
  });

  it('declares database checks for workout kind and structured cardio ranges', () => {
    const checks = getTableConfig(workoutSessions).checks.map((constraint) => constraint.name);
    expect(checks).toEqual(expect.arrayContaining([
      'workout_sessions_workout_kind_check',
      'workout_sessions_cardio_activity_check',
      'workout_sessions_cardio_distance_check',
      'workout_sessions_cardio_effort_check',
      'workout_sessions_cardio_shape_check',
    ]));
  });
});
