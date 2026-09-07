/** Example data and browser-only persistence. Never imported by product routes. */
import { ATLAS_EXERCISES } from '../../../lib/anatomy/exercises';
import type { Exercise, WorkoutSession } from '../../../lib/types';
import type { PersistedWorkoutSet, LiveExerciseStructureInput } from '../../../components/workout/workout-persistence';
import type { WorkoutHomeTemplate } from '../../../components/workout/workspace/WorkoutHome';
import { localToday, localDateStr } from '../../../lib/utils/dates';

export const REVIEW_USER = '00000000-0000-4000-8000-000000000001';
export const REVIEW_STORAGE_KEY = 'trophe:private-workout-review:v1';
export const reviewExercises: Exercise[] = ATLAS_EXERCISES.map((exercise, index) => ({ ...exercise, muscle_group: exercise.muscle_group as Exercise['muscle_group'], id: `00000000-0000-4000-8001-${String(index + 1).padStart(12, '0')}`, created_by: null, created_at: '2026-01-01T12:00:00Z', is_template: true }));
export function exerciseNamed(name: string) {
  const exercise = reviewExercises.find(item => item.name === name);
  if (!exercise) throw new Error(`Review fixture missing: ${name}`);
  return exercise;
}
export function reviewTemplate(name: string, names: string[]): WorkoutHomeTemplate {
  const exercises = names.map(exerciseNamed);
  return { templateKey: `review:${name}`, name, muscleSummary: [...new Set(exercises.map(e => e.muscle_group))], exercises: exercises.map(e => ({ exerciseId: e.id, exerciseName: e.name, muscleGroup: e.muscle_group, targetSets: 3, targetReps: '8-12', restSeconds: 90 })) };
}
export interface ReviewSession extends WorkoutSession { structure: LiveExerciseStructureInput[]; version: number; requestId?: string }
export interface ReviewData { sessions: ReviewSession[]; sets: PersistedWorkoutSet[]; routines: WorkoutHomeTemplate[]; customExercises: Exercise[]; scenario: 'plan' | 'empty' }
let current: ReviewData | null = null;
const listeners = new Set<() => void>();
export function subscribeReview(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }
export function makeReviewData(): ReviewData {
  const date = new Date(); date.setDate(date.getDate() - 2);
  const previous = localDateStr(date);
  const sessions: ReviewSession[] = [0, 1].map(index => ({ id: `00000000-0000-4000-8002-${String(index + 1).padStart(12, '0')}`, user_id: REVIEW_USER, name: index ? 'Strength' : 'Bench Press', session_date: index ? previous : localToday(), template_id: null, duration_minutes: index ? 38 : 12, notes: null, pain_flags: [], workout_kind: 'strength', completed_at: `${index ? previous : localToday()}T12:00:00`, created_at: `${index ? previous : localToday()}T11:00:00`, structure: [], version: 0 }));
  const sets = sessions.flatMap((session, index) => [1, 2, 3].map(number => ({ id: `00000000-0000-4000-8003-${String(index * 3 + number).padStart(12, '0')}`, session_id: session.id, exercise_id: exerciseNamed('Bench Press').id, set_number: number, weight_kg: index ? 40 : 45, reps: 10, rpe: 7, is_warmup: false, is_pr: !index && number === 1, notes: null, created_at: session.created_at })));
  return { sessions, sets, routines: [reviewTemplate('Strength', ['Bench Press', 'Squat', 'Lat Pulldown']), reviewTemplate('Upper body', ['Bench Press', 'Lat Pulldown'])], customExercises: [], scenario: 'plan' };
}
export function reviewData(): ReviewData {
  if (!current) {
    try { const saved = JSON.parse(sessionStorage.getItem(REVIEW_STORAGE_KEY) || 'null'); if (saved?.sessions && saved?.sets && saved?.routines) current = saved; } catch { /* A fresh isolated example is sufficient. */ }
    current ??= makeReviewData();
  }
  return current;
}
export function updateReview(update: (data: ReviewData) => ReviewData) {
  current = update(reviewData());
  try { sessionStorage.setItem(REVIEW_STORAGE_KEY, JSON.stringify(current)); } catch { /* In-memory review remains usable. */ }
  listeners.forEach(listener => listener());
}
export function resetReview(scenario: ReviewData['scenario'] = 'plan') {
  current = { ...makeReviewData(), scenario };
  if (scenario === 'empty') { current.sessions = []; current.sets = []; current.routines = []; }
  updateReview(data => data);
}
export const reviewWorkspaceStorage = {
  getItem(key: string) { try { return sessionStorage.getItem(`private-review:${key}`); } catch { return null; } },
  setItem(key: string, value: string) { try { sessionStorage.setItem(`private-review:${key}`, value); } catch { /* memory state continues */ } },
  removeItem(key: string) { try { sessionStorage.removeItem(`private-review:${key}`); } catch { /* no saved state */ } },
};
