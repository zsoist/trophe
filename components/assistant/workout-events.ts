export const COACH_WORKOUT_SET_REFRESH = 'trophe:coach-workout-set-refresh';

export interface CoachWorkoutSetRefresh {
  actorId: string;
  setId: string;
  sessionId: string;
  exerciseId: string;
  version: string;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A refresh hint only. Workout screens still refetch their authorized data. */
export function readWorkoutSetRefresh(event: Event): CoachWorkoutSetRefresh | null {
  if (!(event instanceof CustomEvent) || !event.detail || typeof event.detail !== 'object') return null;
  const value = event.detail as Partial<CoachWorkoutSetRefresh>;
  if (![value.actorId, value.setId, value.sessionId, value.exerciseId].every(item => typeof item === 'string' && uuid.test(item))) return null;
  if (typeof value.version !== 'string' || value.version.length < 1 || value.version.length > 128) return null;
  return value as CoachWorkoutSetRefresh;
}
