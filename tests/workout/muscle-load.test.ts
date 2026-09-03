import { describe, expect, it } from 'vitest';
import { calculateMuscleLoad } from '@/lib/workout/muscle-load';

describe('calculateMuscleLoad', () => {
  it('weights completed working sets by curated muscle role', () => {
    const load = calculateMuscleLoad({
      sets: [
        { completed: true, isWarmup: false },
        { completed: true, isWarmup: false },
        { completed: true, isWarmup: true },
      ],
      activations: [
        { id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' },
        { id: 'triceps-brachii', label: 'Triceps brachii', role: 'secondary', view: 'front' },
        { id: 'rotator-cuff', label: 'Rotator cuff', role: 'stabilizer', view: 'back' },
      ],
    });

    expect(load).toEqual({
      'pectoralis-major': 2.25,
      'triceps-brachii': 1.125,
      'rotator-cuff': 0.45,
    });
  });

  it('ignores incomplete sets', () => {
    expect(calculateMuscleLoad({
      sets: [{ completed: false, isWarmup: false }],
      activations: [{ id: 'pectoralis-major', label: 'Pectoralis major', role: 'primary', view: 'front' }],
    })).toEqual({ 'pectoralis-major': 0 });
  });
});
