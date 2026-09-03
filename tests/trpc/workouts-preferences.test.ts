import { describe, expect, it, vi } from 'vitest';
import { createCallerFactory } from '@/lib/trpc/init';
import { appRouter } from '@/lib/trpc/router';
import type { Context } from '@/lib/trpc/context';
import type { UserRole } from '@/lib/auth/get-session';
import type { WorkoutPreferences } from '@/lib/types';

const CLIENT_ID = '00000000-0000-4000-8000-000000000001';
const COACH_ID = '00000000-0000-4000-8000-000000000002';

const preferences: WorkoutPreferences = {
  version: 1,
  experience: 'beginner',
  equipment: ['dumbbell', 'bench'],
  durationMinutes: 30,
  daysPerWeek: 3,
  location: 'home',
};

function chain(result: unknown) {
  const query = Promise.resolve(result) as Promise<unknown> & Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['from', 'where', 'limit', 'returning']) query[method] = vi.fn(() => query);
  return query;
}

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

  it('writes only the authenticated client preference document', async () => {
    const update = vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(async () => [{ workoutPreferences: preferences }]) })) })),
    }));
    const caller = createCallerFactory(appRouter)(context(CLIENT_ID, 'client', { update } as unknown as Context['db']));

    await expect(caller.workouts.preferences.update({ preferences })).resolves.toEqual(preferences);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('does not allow a coach without an assigned client relationship to update preferences', async () => {
    const db = { select: vi.fn(() => chain([])), update: vi.fn() } as unknown as Context['db'];
    const caller = createCallerFactory(appRouter)(context(COACH_ID, 'coach', db));

    await expect(caller.workouts.preferences.update({ clientId: CLIENT_ID, preferences }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
