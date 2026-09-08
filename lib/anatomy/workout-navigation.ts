import type { WorkoutRouteContext } from '../workout/workspace-routes';
import { mappingForMuscle } from './mapping';
/** Existing exercise-library categories. Never inferred activation roles. */
export function workoutAtlasFilter(group: string | null | undefined) {
  const filters = {
    chest: { area: "chest", muscle: "all" },
    back: { area: "back", muscle: "all" },
    shoulders: { area: "shoulders", muscle: "all" },
    arms: { area: "arms", muscle: "all" },
    biceps: { area: "arms", muscle: "biceps" },
    triceps: { area: "arms", muscle: "triceps" },
    legs: { area: "legs", muscle: "all" },
    glutes: { area: "legs", muscle: "glutes" },
    core: { area: "core", muscle: "all" },
  } as const;
  return group && Object.prototype.hasOwnProperty.call(filters, group)
    ? filters[group as keyof typeof filters]
    : null;
}

/** Only known Workout destinations travel through Atlas; never arbitrary return URLs. */
export function atlasWorkoutContext(params: { get(name: string): string | null }): WorkoutRouteContext {
  if (params.get('from') !== 'exercises') return {};
  const replacement = params.get('replace')?.trim();
  return { returnToExercises: true, replaceExerciseId: replacement && replacement.length <= 200 ? replacement : undefined,
    returnRoute: params.get('return') === 'review' ? 'review' : params.get('return') === 'build' ? 'build' : undefined };
}
function exerciseParams(context: WorkoutRouteContext) {
  const params = new URLSearchParams();
  if (context.replaceExerciseId) params.set('replace', context.replaceExerciseId);
  if (context.returnRoute || context.replaceExerciseId) params.set('return', context.returnRoute === 'review' ? 'review' : 'build');
  return params;
}
export function atlasEntryHref(muscle?: string | null, context?: WorkoutRouteContext) {
  const params = context ? exerciseParams(context) : new URLSearchParams();
  if (muscle && mappingForMuscle(muscle)) params.set('muscle', muscle);
  if (context) params.set('from', 'exercises');
  return `/dashboard/workout/atlas${params.size ? `?${params}` : ''}`;
}
export function atlasExerciseLibraryHref(group?: string | null, context: WorkoutRouteContext = {}) {
  const params = new URLSearchParams();
  if (workoutAtlasFilter(group)) params.set('atlas', group!);
  for (const [key, value] of exerciseParams(context)) params.set(key, value);
  return `/dashboard/workout/exercises${params.size ? `?${params}` : ''}`;
}
