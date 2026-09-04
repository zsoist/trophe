import { describe, expect, it } from 'vitest';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';

describe('resolveExerciseMedia', () => {
  it('returns a complete verified technique record for an exact movement and equipment', () => {
    const record = resolveExerciseMedia({ name: 'Barbell Bench Press', equipment: 'Barbell', muscleGroup: 'chest' });
    expect(record).toMatchObject({
      slug: 'bench-press',
      posterSrc: '/workout-v3/posters/bench-press.webp',
      tier: 'verified-technique',
      motionSrc: '/workout-v3/motion/bench-press.webm',
      motionType: 'video/webm',
      provenance: { kind: 'generated' },
    });
    expect(record?.activations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'pectoralis-major', role: 'primary' }),
    ]));
    expect(record?.phases.map((phase) => phase.id)).toEqual(['setup', 'work', 'finish']);
  });

  it('never returns mismatched technique media', () => {
    expect(resolveExerciseMedia({ name: 'Landmine Press', equipment: 'Barbell', muscleGroup: 'chest' }).tier)
      .not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Floor Press', equipment: 'Dumbbell', muscleGroup: 'chest' }).tier)
      .not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Floor Press', muscleGroup: 'chest' }).tier)
      .not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Floor Press', equipment: 'bar', muscleGroup: 'chest' }).tier)
      .not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Floor Press', equipment: 'Dumbbell Barbell', muscleGroup: 'chest' }).tier)
      .not.toBe('verified-technique');
  });

  it('resolves the seeded catalogue names only with their real equipment', () => {
    expect(resolveExerciseMedia({ name: 'Bench Press', equipment: 'barbell', muscleGroup: 'chest' })).toMatchObject({
      slug: 'bench-press', tier: 'verified-technique', motionSrc: '/workout-v3/motion/bench-press.webm',
    });
    expect(resolveExerciseMedia({ name: 'Bench Press', equipment: 'dumbbell', muscleGroup: 'chest' }).tier).not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Bench Press', muscleGroup: 'chest' }).tier).not.toBe('verified-technique');
    expect(resolveExerciseMedia({ name: 'Tricep Pushdown', equipment: 'cable', muscleGroup: 'triceps' })).toMatchObject({
      slug: 'triceps-extension', tier: 'verified-technique',
    });
    expect(resolveExerciseMedia({ name: 'Tricep Pushdown', equipment: 'machine', muscleGroup: 'triceps' }).tier).not.toBe('verified-technique');
  });

  it('separates curated anatomy from a muscle-group estimate and from no anatomy at all', () => {
    // Curated movement pattern, wrong equipment: anatomy stays reviewed, technique does not.
    expect(resolveExerciseMedia({ name: 'Floor Press', equipment: 'Dumbbell', muscleGroup: 'chest' })).toMatchObject({
      tier: 'verified-anatomy', posterSrc: '/workout-v2/body-areas/chest.webp',
    });
    const estimate = resolveExerciseMedia({ name: 'Lateral Raises', equipment: 'dumbbell', muscleGroup: 'shoulders' });
    expect(estimate).toMatchObject({ tier: 'group-estimate', posterSrc: '/workout-v2/body-areas/shoulders.webp' });
    expect(estimate.motionSrc).toBeUndefined();
    expect(estimate.activations).toEqual([expect.objectContaining({ confidence: 'group', group: 'shoulders' })]);
    expect(resolveExerciseMedia({ name: 'Custom Press', muscleGroup: 'full_body' })).toMatchObject({
      tier: 'honest-fallback', activations: [], posterSrc: '/workout-v2/body-areas/full-body.webp',
    });
  });

  it.each([
    ['Barbell Bench Press', 'Barbell', 'bench-press'],
    ['Incline Dumbbell Press', 'Dumbbell', 'incline-press'],
    ['Smith Machine Bench Press', 'Smith Machine', 'smith-bench-press'],
    ['Machine Chest Press', 'Machine', 'machine-chest-press'],
    ['Floor Press', 'Barbell', 'floor-press'],
    ['Pec Deck Machine', 'Machine', 'pec-deck'],
    ['Standing Cable Chest Fly', 'Cable', 'cable-fly'],
    ['Push Ups', 'Bodyweight', 'push-up'],
    ['Parallel Bar Chest Dips', 'Bodyweight', 'dip'],
    ['Pull Ups', 'Bodyweight', 'pull-up'],
    ['Seated Cable Row', 'Cable', 'row'],
    ['Standing Overhead Barbell Press', 'Barbell', 'overhead-press'],
    ['Standing Dumbbell Biceps Curl', 'Dumbbell', 'curl'],
    ['Cable Rope Triceps Extension', 'Cable', 'triceps-extension'],
    ['Barbell Back Squat', 'Barbell', 'squat'],
    ['Conventional Barbell Deadlift', 'Barbell', 'deadlift'],
  ] as const)('uses V3 motion only for the verified exact %s / %s pair', (name, equipment, slug) => {
    expect(resolveExerciseMedia({ name, equipment })).toMatchObject({
      slug,
      tier: 'verified-technique',
      posterSrc: `/workout-v3/posters/${slug}.webp`,
      motionSrc: `/workout-v3/motion/${slug}.webm`,
    });
  });
});
