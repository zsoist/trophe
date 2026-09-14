/** Explicit synthetic integration fixture. Never used as real-query fallback. */
import { authorizeSubject } from './context';
import type { CoachRepository, ExerciseRow, NutritionRow, PlanRow, WorkoutRow } from './repository';

export function fixtureRepository(overrides: { nutrition?: readonly NutritionRow[]; workouts?: readonly WorkoutRow[]; plans?: readonly PlanRow[]; exercises?: readonly ExerciseRow[]; revokeAfterAuthorizations?: number } = {}): CoachRepository & { readCount(): number } {
  let authorizations = 0;
  let reads = 0;
  const owner = 'synthetic-client';
  const meals: readonly NutritionRow[] = overrides.nutrition ?? [
    { id: 'meal-a1', userId: owner, date: '2026-09-06', calories: 420, proteinG: 30 },
    { id: 'meal-a2', userId: owner, date: '2026-09-06', calories: 580, proteinG: 45 },
    { id: 'meal-a1', userId: owner, date: '2026-09-06', calories: 420, proteinG: 30 },
  ];
  const workouts: readonly WorkoutRow[] = overrides.workouts ?? [{
    id: 'session-a1', userId: owner, date: '2026-09-06', completedAt: '2026-09-06T20:00:00Z', idempotencyKey: 'key-a1', durationMinutes: 20, templateId:'template-a1',
    sets: [{ id: 'set-a1', reps: 10, weightKg: 40, isWarmup: false }, { id: 'set-a2', reps: 8, weightKg: 40, isWarmup: false }],
  }];
  const plans: readonly PlanRow[] = overrides.plans ?? [{ id: 'plan-a1', userId: owner, startsOn: '2026-08-01', status: 'active', days: [{ id: 'day-a1', weekday: 0, targetSets: 3,templateId:'template-a1',targetReps:30 }] }];
  const exercises:readonly ExerciseRow[]=overrides.exercises??[];
  const result = <T>(rows: readonly T[], limit: number) => { reads++; return Promise.resolve({ rows: structuredClone(rows.slice(0, limit)), truncated: rows.length > limit }); };
  return {
    dataSource: 'synthetic', readCount: () => reads,
    async authorize(actorId, subjectId, signal) {
      signal.throwIfAborted();
      if (++authorizations > (overrides.revokeAfterAuthorizations ?? Infinity)) throw new Error('forbidden');
      if (subjectId !== owner || ![owner, 'synthetic-coach'].includes(actorId)) throw new Error('forbidden');
      return authorizeSubject({ id: actorId, role: actorId === owner ? 'client' : 'coach', organizationIds: ['synthetic-org'] },
        { id: subjectId, coachId: 'synthetic-coach', organizationIds: ['synthetic-org'], timezone: 'America/Bogota', language: 'en' });
    },
    plan: args => result(plans, args.limit),
    workouts: args => result(workouts, args.limit),
    nutrition: args => result(meals, args.limit),
    exercise: args => result(exercises.filter(row=>row.id===args.exerciseId), args.limit),
  };
}
