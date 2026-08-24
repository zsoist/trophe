import { describe, expect, it } from 'vitest';
import { resolveWorkoutAsset } from '@/lib/workout-assets';

describe('resolveWorkoutAsset', () => {
  it('uses a named movement asset when the library has one', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Barbell Bench Press', bodyArea: 'chest' })).toEqual({
      src: '/workout/exercises/bench-press.webp',
      kind: 'technique',
      fit: 'contain',
      background: 'neutral',
    });
  });

  it('normalizes punctuation and common exercise naming variants', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Pull-Up', bodyArea: 'back' }).src).toBe('/workout/exercises/pull-up.webp');
    expect(resolveWorkoutAsset({ exerciseName: 'Pec Deck Machine', bodyArea: 'chest' }).src).toBe('/workout/exercises/pec-deck.webp');
  });

  it.each([
    ['Incline Dumbbell Press', 'chest', 'incline-press'],
    ['Overhead Press', 'shoulders', 'overhead-press'],
    ['Cable Fly', 'chest', 'cable-fly'],
    ['Deadlift', 'back', 'deadlift'],
    ['Back Squat', 'quads', 'squat'],
    ['Dips', 'triceps', 'dip'],
    ['Seated Cable Row', 'back', 'row'],
    ['Dumbbell Curl', 'biceps', 'curl'],
    ['Triceps Pushdown', 'triceps', 'triceps-extension'],
  ] as const)('maps the represented %s technique exactly', (exerciseName, muscleGroup, slug) => {
    expect(resolveWorkoutAsset({ exerciseName, muscleGroup })).toMatchObject({
      src: `/workout/exercises/${slug}.webp`,
      kind: 'technique',
    });
  });

  it.each([
    ['Seated Leg Curl', 'hamstrings', 'legs'],
    ['Nordic Curl', 'hamstrings', 'legs'],
    ['Meadows Row', 'back', 'back'],
    ['Inverted Row', 'back', 'back'],
    ['Smith Machine Squat', 'quads', 'legs'],
    ['Sissy Squat', 'quads', 'legs'],
    ['Pendulum Squat', 'quads', 'legs'],
    ['Belt Squat', 'quads', 'legs'],
    ['Stiff-Leg Deadlift', 'hamstrings', 'legs'],
    ['Snatch-Grip Deadlift', 'back', 'back'],
    ['Smith Machine Bench Press', 'chest', 'chest'],
    ['Incline Bench Press', 'chest', 'chest'],
    ['Chin-Up', 'back', 'back'],
    ['Barbell Row', 'back', 'back'],
    ['Barbell Curl', 'biceps', 'arms'],
    ['Triceps Dips', 'triceps', 'arms'],
    ['Overhead Tricep Extension', 'triceps', 'arms'],
    ['Skull Crushers', 'triceps', 'arms'],
    ['Triceps Extension', 'triceps', 'arms'],
    ['Dumbbell Shoulder Press', 'shoulders', 'shoulders'],
    ['Cable Crossover', 'chest', 'chest'],
    ['Romanian Deadlift', 'hamstrings', 'legs'],
    ['Front Squat', 'quads', 'legs'],
    ['Goblet Squat', 'quads', 'legs'],
  ] as const)('labels unsupported near-name %s artwork as anatomy', (exerciseName, muscleGroup, areaSlug) => {
    expect(resolveWorkoutAsset({ exerciseName, muscleGroup })).toEqual({
      src: `/workout/body-areas/${areaSlug}.webp`,
      kind: 'anatomy',
      fit: 'contain',
      background: 'neutral',
    });
  });

  it('falls back to the body area for long-tail and custom exercises', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Nick custom press', bodyArea: 'chest' })).toEqual({
      src: '/workout/body-areas/chest.webp',
      kind: 'anatomy',
      fit: 'contain',
      background: 'neutral',
    });
  });

  it('uses full body when no body area is known', () => {
    expect(resolveWorkoutAsset({ exerciseName: 'Unknown movement' })).toEqual({
      src: '/workout/body-areas/full-body.webp',
      kind: 'anatomy',
      fit: 'contain',
      background: 'neutral',
    });
  });
});
