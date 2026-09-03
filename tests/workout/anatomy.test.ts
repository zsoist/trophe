import { describe, expect, it } from 'vitest';
import { resolveMuscleActivations } from '@/lib/workout/anatomy';

describe('resolveMuscleActivations', () => {
  it('maps bench press to curated primary and secondary muscles', () => {
    expect(resolveMuscleActivations({ name: 'Barbell Bench Press', equipment: 'Barbell' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pectoralis-major', role: 'primary', view: 'front' }),
        expect.objectContaining({ id: 'triceps-brachii', role: 'secondary' }),
        expect.objectContaining({ id: 'anterior-deltoid', role: 'secondary' }),
      ]),
    );
  });

  it('returns a stable, typed anatomy fallback for an uncovered exercise', () => {
    expect(resolveMuscleActivations({ name: 'Landmine Press', equipment: 'Barbell', muscleGroup: 'chest' })).toEqual([
      expect.objectContaining({ id: 'pectoralis-major', role: 'primary', view: 'front' }),
    ]);
  });
});
