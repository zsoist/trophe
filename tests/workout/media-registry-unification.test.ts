import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset } from '@/lib/workout-assets';
import { EXERCISE_MEDIA_REGISTRY } from '@/lib/workout/exercise-media';
describe('canonical workout registry compatibility', () => {
  it.each(EXERCISE_MEDIA_REGISTRY.flatMap(r => r.canonicalNames.map(name => ({ ...r, name }))))('uses exact canonical identity $name', r => {
    expect(resolveWorkoutAsset({ exerciseName: r.name, equipment: r.equipment[0] }).src).toBe(`/workout-v2/exercises/${r.slug}.webp`);
  });
  it('rejects equipment strings that merely contain an allowed word', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Barbell Bench Press', equipment: 'not a barbell', muscleGroup: 'chest' }).kind).toBe('anatomy');
  });
});
