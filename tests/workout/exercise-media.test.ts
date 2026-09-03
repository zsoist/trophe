import { describe, expect, it } from 'vitest';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';

describe('resolveExerciseMedia', () => {
  it('returns a complete verified technique record for an exact movement and equipment', () => {
    const record = resolveExerciseMedia({ name: 'Barbell Bench Press', equipment: 'Barbell', muscleGroup: 'chest' });
    expect(record).toMatchObject({
      slug: 'bench-press',
      posterSrc: '/workout-v2/exercises/bench-press.webp',
      tier: 'verified-technique',
      provenance: { kind: 'repo-vector' },
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
});
