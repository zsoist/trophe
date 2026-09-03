import { describe, expect, it, vi } from 'vitest';
import { createCallerFactory } from '@/lib/trpc/init';
import { appRouter } from '@/lib/trpc/router';
import { recommendationAsOfDate, selectCoachTemplateForWeekday } from '@/lib/trpc/routers/workouts';
import type { Context } from '@/lib/trpc/context';
import type { UserRole } from '@/lib/auth/get-session';
import type { WorkoutPreferences } from '@/lib/types';

const audit = vi.hoisted(() => ({ recordAuditEvent: vi.fn() }));
vi.mock('@/lib/utils/audit', () => audit);

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const COACH_ID = '00000000-0000-4000-8000-000000000002';
const ADMIN_ID = '00000000-0000-4000-8000-000000000003';

const preferences: WorkoutPreferences = {
  version: 1,
  experience: 'beginner',
  equipment: ['dumbbell', 'bench'],
  durationMinutes: 30,
  daysPerWeek: 3,
  location: 'home',
};

function context(id: string | null, role: UserRole = 'client', db?: Context['db']): Context {
  return {
    user: id ? { id, email: `${role}@test.local` } as Context['user'] : null,
    profile: id ? { id, role, fullName: role, email: `${role}@test.local` } : null,
    db: db ?? { select: vi.fn(), update: vi.fn() } as unknown as Context['db'],
    headers: new Headers(),
  };
}

function query(result: unknown) {
  const value = Promise.resolve(result) as Promise<unknown> & Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['from', 'where', 'limit', 'orderBy', 'innerJoin']) value[method] = vi.fn(() => value);
  return value;
}

describe('workouts.preferences', () => {
  it('requires authentication and a version-1 preference payload', async () => {
    const createCaller = createCallerFactory(appRouter);
    await expect(createCaller(context(null)).workouts.preferences.mine()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(createCaller(context(CLIENT_ID)).workouts.preferences.update({
      preferences: { ...preferences, version: 2 } as never,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('writes only the authenticated client preference document and audits it', async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ workoutPreferences: preferences }]) })) })),
    }));
    const caller = createCallerFactory(appRouter)(context(CLIENT_ID, 'client', { update } as unknown as Context['db']));

    await expect(caller.workouts.preferences.update({ preferences })).resolves.toEqual(preferences);
    expect(update).toHaveBeenCalledTimes(1);
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      actorId: CLIENT_ID,
      action: 'workout_preferences_updated',
      tableName: 'client_profiles',
    }));
  });

  it('allows an assigned coach through the final atomic update and audits the coach actor', async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ workoutPreferences: preferences }]) })) })),
    }));
    const caller = createCallerFactory(appRouter)(context(COACH_ID, 'coach', { update } as unknown as Context['db']));

    await expect(caller.workouts.preferences.update({ clientId: CLIENT_ID, preferences })).resolves.toEqual(preferences);
    expect(update).toHaveBeenCalledOnce();
    expect(audit.recordAuditEvent).toHaveBeenCalledWith(expect.objectContaining({ actorId: COACH_ID }));
  });

  it('denies admins even if they can access the client through general tenant helpers', async () => {
    const update = vi.fn();
    const caller = createCallerFactory(appRouter)(context(ADMIN_ID, 'admin', { update } as unknown as Context['db']));

    await expect(caller.workouts.preferences.update({ clientId: CLIENT_ID, preferences }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(update).not.toHaveBeenCalled();
  });

  it('fails closed when the coach assignment changes before the atomic update', async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => []) })) })),
    }));
    const caller = createCallerFactory(appRouter)(context(COACH_ID, 'coach', { update } as unknown as Context['db']));

    await expect(caller.workouts.preferences.update({ clientId: CLIENT_ID, preferences }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(update).toHaveBeenCalledOnce();
  });
});

describe('workouts.recommendation.mine route contract', () => {
  it('uses the current assigned weekday template rather than the first scheduled day', () => {
    const sunday = { id: 'sunday', exercises: [] };
    const wednesday = { id: 'wednesday', exercises: [] };

    expect(selectCoachTemplateForWeekday([
      { weekday: 0, template: sunday },
      { weekday: 3, template: wednesday },
    ], 3)).toBe(wednesday);
  });

  it('injects a stable date into recency ranking', () => {
    expect(recommendationAsOfDate(new Date('2026-09-02T23:00:00-05:00'))).toBe('2026-09-03');
  });

  it('keeps custom exercise reads tenant-scoped and has no workout-session write path', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile('lib/trpc/routers/workouts.ts', 'utf8');
    const recommendation = source.slice(source.indexOf('recommendation: router({'), source.indexOf('logs: router({'));

    expect(recommendation).toContain('inArray(exercises.id, coachTemplateIds)');
    expect(recommendation).toContain('eq(exercises.createdBy, profile.coachId!)');
    expect(recommendation).toContain('new Date().getDay()');
    expect(recommendation).toContain('return buildWorkoutRecommendation({');
    expect(recommendation).not.toContain('.insert(workoutSessions)');
    expect(recommendation).not.toContain('.update(workoutSessions)');
  });

  it('invokes the real caller with today’s coach template, curated pain input, and no session writes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 2, 12)); // Wednesday, 0=Sunday
    const coachPrivate = {
      id: 'coach-private', name: 'Barbell Bench Press', nameEs: null, nameEl: null,
      muscleGroup: 'chest', secondaryMuscles: null, equipment: 'Barbell', isCompound: true,
      isTemplate: false, instructions: null, instructionsEs: null, instructionsEl: null,
      createdBy: COACH_ID, createdAt: '2026-09-01T00:00:00Z',
    };
    const coachPrivateSafe = {
      ...coachPrivate, id: 'coach-private-safe', name: 'Private Barbell Curl', muscleGroup: 'biceps',
    };
    const otherCoachPrivate = {
      ...coachPrivate, id: 'other-coach-private', name: 'Other Coach Cable Exercise', muscleGroup: 'full_body',
      equipment: 'Cable', createdBy: '00000000-0000-4000-8000-000000000099',
    };
    const currentTemplate = { id: 'wed-template', exercises: [
      { exercise_id: 'coach-private', target_sets: 3, target_reps: '8-10' },
      { exercise_id: 'coach-private-safe', target_sets: 3, target_reps: '8-10' },
      // A malformed template reference must not authorize another coach's private exercise.
      { exercise_id: 'other-coach-private', target_sets: 3, target_reps: '8-10' },
    ] };
    const select = vi.fn()
      .mockReturnValueOnce(query([{ goal: 'muscle_gain', activityLevel: 'active', coachId: COACH_ID, workoutPreferences: { ...preferences, equipment: ['barbell', 'cable'] } }]))
      .mockReturnValueOnce(query([{ id: 'program', coachId: COACH_ID }]))
      .mockReturnValueOnce(query([
        { id: 'sun', weekday: 0, sort: 0, template: { id: 'sun-template', exercises: [] } },
        { id: 'wed', weekday: 3, sort: 0, template: currentTemplate },
      ]))
      .mockReturnValueOnce(query([coachPrivate, coachPrivateSafe, otherCoachPrivate]))
      .mockReturnValueOnce(query([]))
      .mockReturnValueOnce(query([{ painFlags: [{ body_part: 'shoulder', severity: 2 }] }]));
    const insert = vi.fn();
    const update = vi.fn();
    const caller = createCallerFactory(appRouter)(context(CLIENT_ID, 'client', { select, insert, update } as unknown as Context['db']));

    const result = await caller.workouts.recommendation.mine();

    expect(result).toEqual(expect.objectContaining({
      source: 'coach', reasons: expect.any(Array), estimatedDurationMinutes: expect.any(Number),
      equipment: expect.any(Array), muscleDistribution: expect.any(Object), exercises: expect.any(Array),
    }));
    expect(result.exercises.map((exercise) => exercise.exerciseId)).toEqual(['coach-private-safe']);
    expect(result.reasons).toContain('Excluded coach-template exercises affecting painful regions: shoulders.');
    expect(result.reasons).toContain('Some coach-template exercises are unavailable and need coach review.');
    expect(result.equipment).toEqual(['Barbell']);
    expect(result.muscleDistribution).toEqual({ biceps: 3 });
    expect(result.exercises.map((exercise) => exercise.exerciseId)).not.toContain('other-coach-private');
    expect(result.reasons.join(' ')).not.toContain('Other Coach Cable Exercise');
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
