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

    expect(recommendation).toContain("or(eq(exercises.isTemplate, true), eq(exercises.createdBy, ctx.user!.id))");
    expect(recommendation).toContain('new Date().getDay()');
    expect(recommendation).toContain('return buildWorkoutRecommendation({');
    expect(recommendation).not.toContain('.insert(workoutSessions)');
    expect(recommendation).not.toContain('.update(workoutSessions)');
  });
});
