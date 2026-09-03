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
