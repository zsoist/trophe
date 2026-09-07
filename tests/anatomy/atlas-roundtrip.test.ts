import { describe, expect, it } from 'vitest';
import { atlasEntryHref, atlasExerciseLibraryHref, atlasWorkoutContext } from '../../lib/anatomy/workout-navigation';
import { workoutBackRoute } from '../../lib/workout/workspace-routes';

describe('Atlas exercise replacement round trip', () => {
  it('retains the exact replacement and review destination through muscle discovery', () => {
    const href = atlasEntryHref('pectoralis-major', { replaceExerciseId: 'exercise-123', returnRoute: 'review' });
    const context = atlasWorkoutContext(new URL(href, 'https://local.test').searchParams);
    const library = new URL(atlasExerciseLibraryHref('chest', context), 'https://local.test');
    expect(library.pathname).toBe('/dashboard/workout/exercises');
    expect(Object.fromEntries(library.searchParams)).toEqual({ atlas: 'chest', replace: 'exercise-123', return: 'review' });
    expect(workoutBackRoute('/dashboard/workout/atlas', 'draft', context)).toBe('/dashboard/workout/exercises?replace=exercise-123&return=review');
  });
  it('keeps Home entry independent and rejects arbitrary navigation destinations', () => {
    expect(atlasEntryHref()).toBe('/dashboard/workout/atlas');
    const context = atlasWorkoutContext(new URLSearchParams('from=https://other.test&return=https://other.test&replace=x'));
    expect(atlasExerciseLibraryHref('unknown', context)).toBe('/dashboard/workout/exercises');
    expect(workoutBackRoute('/dashboard/workout/atlas', 'home', context)).toBe('/dashboard/workout');
  });
});
