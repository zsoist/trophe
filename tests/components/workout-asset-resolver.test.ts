import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset } from '@/lib/workout-assets';

describe('resolveWorkoutAsset', () => {
  it('uses a named movement asset when the library has one', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Barbell Bench Press', bodyArea: 'chest' })).toEqual({
      src: '/workout/exercises/bench-press.webp',
      altKey: 'workout.visual.bench_press',
      kind: 'exercise',
    });
  });

  it('normalizes punctuation and common exercise naming variants', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Pull-Up', bodyArea: 'back' }).src).toBe('/workout/exercises/pull-up.webp');
    expect(resolveWorkoutAsset({ exerciseName: 'Pec Deck Machine', bodyArea: 'chest' }).src).toBe('/workout/exercises/pec-deck.webp');
  });

  it('falls back to the body area for long-tail and custom exercises', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Nick custom press', bodyArea: 'chest' })).toEqual({
      src: '/workout/body-areas/chest.webp',
      altKey: 'workout.body_area.chest',
      kind: 'body-area',
    });
  });

  it('uses full body when no body area is known', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Unknown movement' })).toEqual({
      src: '/workout/body-areas/full-body.webp',
      altKey: 'workout.body_area.full_body',
      kind: 'body-area',
    });
  });
});
