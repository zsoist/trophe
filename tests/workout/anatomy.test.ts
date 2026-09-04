import { describe, expect, it } from 'vitest';
import { resolveCuratedMuscleActivations, resolveMuscleActivations, slugForExerciseName } from '@/lib/workout/anatomy';

describe('resolveMuscleActivations', () => {
  it('maps bench press to curated primary and secondary muscles', () => {
    expect(resolveMuscleActivations({ name: 'Barbell Bench Press', equipment: 'Barbell' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pectoralis-major', role: 'primary', view: 'front', confidence: 'curated' }),
        expect.objectContaining({ id: 'triceps-brachii', role: 'secondary', confidence: 'curated' }),
        expect.objectContaining({ id: 'anterior-deltoid', role: 'secondary', confidence: 'curated' }),
      ]),
    );
  });

  it('keeps posterior and posterior-data muscle activations on the back atlas view', () => {
    expect(resolveMuscleActivations({ name: 'Barbell Bench Press' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'triceps-brachii', view: 'back' }),
    ]));
    expect(resolveMuscleActivations({ name: 'Pull Up' })).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'forearm-flexors', view: 'back' }),
    ]));
  });

  it('marks the muscle-group fallback as a group estimate, not a curated named-muscle role', () => {
    expect(resolveMuscleActivations({ name: 'Landmine Press', equipment: 'Barbell', muscleGroup: 'chest' })).toEqual([
      expect.objectContaining({ id: 'pectoralis-major', view: 'front', confidence: 'group', group: 'chest', label: 'Chest' }),
    ]);
    expect(resolveMuscleActivations({ name: 'Lateral Raises', equipment: 'Dumbbell', muscleGroup: 'shoulders' })).toEqual([
      expect.objectContaining({ id: 'anterior-deltoid', confidence: 'group', group: 'shoulders', label: 'Shoulders' }),
    ]);
  });

  it('returns no activations when neither a curated slug nor a muscle group is known', () => {
    expect(resolveMuscleActivations({ name: 'Mystery Movement' })).toEqual([]);
  });
});

describe('resolveCuratedMuscleActivations', () => {
  it('returns curated roles only for curated movements', () => {
    expect(resolveCuratedMuscleActivations({ name: 'Barbell Bench Press', equipment: 'Barbell', muscleGroup: 'chest' })).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'pectoralis-major', confidence: 'curated' })]),
    );
  });

  it('returns nothing for a muscle-group-only exercise so estimates are never persisted as anatomy', () => {
    expect(resolveCuratedMuscleActivations({ name: 'Landmine Press', equipment: 'Barbell', muscleGroup: 'chest' })).toEqual([]);
    expect(resolveCuratedMuscleActivations({ name: 'Lateral Raises', equipment: 'Dumbbell', muscleGroup: 'shoulders' })).toEqual([]);
  });
});

describe('slugForExerciseName catalogue aliases', () => {
  it.each([
    ['Bench Press', 'bench-press'],
    ['Squat', 'squat'],
    ['Deadlift', 'deadlift'],
    ['Overhead Press', 'overhead-press'],
    ['Dumbbell Curl', 'curl'],
    ['Tricep Pushdown', 'triceps-extension'],
    ['Triceps Pushdown', 'triceps-extension'],
    ['Rope Pushdown', 'triceps-extension'],
  ])('maps the seeded name %s to %s', (name, slug) => {
    expect(slugForExerciseName(name)).toBe(slug);
  });

  it.each(['Cable Crossover', 'Front Squat', 'Goblet Squat', 'Sumo Deadlift', 'Incline Bench Press', 'Hammer Curl'])(
    'does not borrow a curated slug for %s',
    (name) => {
      expect(slugForExerciseName(name)).toBeUndefined();
    },
  );
});
