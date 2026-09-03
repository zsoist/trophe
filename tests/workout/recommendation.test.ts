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
    expect(result).toEqual(expect.objectContaining({
      source: 'coach', reasons: expect.any(Array), estimatedDurationMinutes: expect.any(Number),
      equipment: expect.any(Array), muscleDistribution: expect.any(Object), exercises: expect.any(Array),
    }));
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

  it('normalizes laterality and synonyms across primary, secondary, and curated activations', () => {
    const result = buildWorkoutRecommendation({
      preferences: { ...preferences, durationMinutes: 45 },
      profileGoal: 'health',
      exercises: [
        { ...exercises[0], id: 'shoulder-press', muscle_group: 'shoulders', secondary_muscles: ['triceps'] },
        { ...exercises[1], id: 'hinge', muscle_group: 'glutes', secondary_muscles: ['lower back'] },
        { ...exercises[1], id: 'curated', muscle_group: 'biceps', secondary_muscles: null, anatomy_activations: ['left shoulder'] },
        { ...exercises[1], id: 'safe-row', muscle_group: 'core', secondary_muscles: null },
      ] as Exercise[],
      recentSets: [],
      painRegions: ['right shoulder', 'lower back'],
      activeCoachTemplate: null,
    });

    expect(result.exercises.map((exercise) => exercise.exerciseId)).toEqual(['safe-row']);
    expect(result.reasons).toContain('Excluded exercises affecting painful regions: back, shoulders.');
  });

  it('reports a duration cap only when it actually omits otherwise eligible exercises', () => {
    const result = buildWorkoutRecommendation({
      preferences: { ...preferences, durationMinutes: 20 },
      profileGoal: 'health',
      exercises: [
        ...exercises,
        { ...exercises[1], id: 'squat', name: 'Dumbbell Squat', muscle_group: 'quads' },
        { ...exercises[1], id: 'curl', name: 'Dumbbell Curl', muscle_group: 'biceps' },
      ],
      recentSets: [],
      painRegions: [],
      activeCoachTemplate: null,
    });

    expect(result.exercises).toHaveLength(2);
    expect(result.reasons).toContain('Limited draft to 2 exercises for the 20-minute duration target.');
    expect(result.reasons.some((reason) => reason.includes('pain'))).toBe(false);
  });

  it('uses activity and completed volume/recency as deterministic ranking signals', () => {
    const candidates: Exercise[] = [
      { ...exercises[1], id: 'high-volume-row', name: 'A Row', muscle_group: 'back' },
      { ...exercises[1], id: 'recent-row', name: 'Z Row', muscle_group: 'back' },
      { ...exercises[0], id: 'press', muscle_group: 'chest' },
      { ...exercises[1], id: 'squat', name: 'Squat', muscle_group: 'quads' },
    ];
    const active = buildWorkoutRecommendation({
      preferences,
      profileGoal: 'health',
      profileActivity: 'active',
      asOf: '2026-09-02',
      exercises: candidates,
      recentSets: [
        { exerciseId: 'high-volume-row', reps: 12, weightKg: 20, completedOn: '2026-09-01', isWarmup: false },
        { exerciseId: 'recent-row', reps: 8, weightKg: 5, completedOn: '2026-08-31', isWarmup: false },
      ],
      painRegions: [],
      activeCoachTemplate: null,
    });
    const sedentary = buildWorkoutRecommendation({
      preferences,
      profileGoal: 'health',
      profileActivity: 'sedentary',
      asOf: '2026-09-02',
      exercises: candidates,
      recentSets: [],
      painRegions: [],
      activeCoachTemplate: null,
    });

    expect(active.exercises[0]?.exerciseId).toBe('high-volume-row');
    expect(active.reasons).toContain('Used completed volume and recency as progression evidence.');
    expect(active.exercises.length).toBeGreaterThan(sedentary.exercises.length);
  });
});
