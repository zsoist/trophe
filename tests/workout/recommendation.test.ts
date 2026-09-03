import { describe, expect, it } from 'vitest';
import { buildWorkoutRecommendation } from '@/lib/workout/recommendation';
import type { Exercise, WorkoutPreferences, WorkoutTemplate } from '@/lib/types';

const preferences: WorkoutPreferences = {
  version: 1,
  experience: 'beginner',
  equipment: ['dumbbell', 'bench'],
  durationMinutes: 30,
  daysPerWeek: 3,
  location: 'home',
};

const exercises: Exercise[] = [
  { id: 'bench-press', name: 'Dumbbell Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: ['triceps'], equipment: 'Dumbbell', is_compound: true, is_template: true, created_by: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'row', name: 'Dumbbell Row', name_es: null, name_el: null, muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'Dumbbell', is_compound: true, is_template: true, created_by: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'push-up', name: 'Push-up', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: ['triceps'], equipment: 'Bodyweight', is_compound: true, is_template: true, created_by: null, created_at: '2026-09-01T00:00:00Z' },
  { id: 'machine-press', name: 'Machine Chest Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null, equipment: 'Machine', is_compound: true, is_template: true, created_by: null, created_at: '2026-09-01T00:00:00Z' },
];

const coachTemplate: WorkoutTemplate = {
  id: 'coach-template',
  created_by: 'coach',
  name: 'Coach day',
  description: null,
  target_muscles: ['chest', 'back'],
  exercises: [
    { exercise_id: 'bench-press', target_sets: 3, target_reps: '8-10' },
    { exercise_id: 'row', target_sets: 3, target_reps: '8-10' },
    { exercise_id: 'machine-press', target_sets: 3, target_reps: '8-10' },
  ],
  day_label: 'Upper',
  difficulty: 'beginner',
  shared: false,
  created_at: '2026-09-01T00:00:00Z',
};

describe('buildWorkoutRecommendation', () => {
  it('returns a reviewable equipment-compatible draft without replacing coach work', () => {
    const result = buildWorkoutRecommendation({
      preferences,
      profileGoal: 'muscle_gain',
      exercises,
      recentSets: [],
      painRegions: [],
      activeCoachTemplate: coachTemplate,
    });

    expect(result.source).toBe('coach');
    expect(result.exercises.every((item) => ['Dumbbell', 'Bench', 'Bodyweight'].includes(item.equipment ?? 'Bodyweight'))).toBe(true);
    expect(result.liveSessionId).toBeUndefined();
    expect(result.estimatedDurationMinutes).toBeLessThanOrEqual(preferences.durationMinutes);
  });

  it('is deterministic and excludes painful or incompatible exercises from a generated draft', () => {
    const input = {
      preferences,
      profileGoal: 'muscle_gain' as const,
      exercises,
      recentSets: [{ exerciseId: 'row', reps: 10, isWarmup: false }],
      painRegions: ['chest'],
      activeCoachTemplate: null,
    };

    const first = buildWorkoutRecommendation(input);
    const second = buildWorkoutRecommendation(input);

    expect(first).toEqual(second);
    expect(first.source).toBe('recommendation');
    expect(first.exercises.map((item) => item.exerciseId)).toEqual(['row']);
    expect(first.reasons).toContain('Excluded exercises affecting painful regions: chest.');
  });
});
