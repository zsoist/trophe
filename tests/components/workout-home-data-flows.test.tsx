// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  repeatId: '',
  programData: null as unknown,
  push: vi.fn(),
  createWorkoutSession: vi.fn(),
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  repeatedSessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  customExerciseId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  templateId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
}));

const user = { id: harness.userId };
const repeatedSessionId = harness.repeatedSessionId;
const customExerciseId = harness.customExerciseId;
const templateId = harness.templateId;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: harness.push }),
  useSearchParams: () => new URLSearchParams(harness.repeatId ? `repeat=${harness.repeatId}` : ''),
}));
vi.mock('@/lib/utils/dates', () => ({ localToday: () => '2026-08-24' }));
vi.mock('@/lib/trpc/client', () => ({
  trpc: { workouts: { program: { mine: { useQuery: () => ({ data: harness.programData, isLoading: false, error: null }) } } } },
}));
vi.mock('@/components/workout/workout-persistence', () => ({ createWorkoutSession: harness.createWorkoutSession }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (key: string, params?: Record<string, string | number>) => ({
    'workout.program_today': `${params?.program} · Today`,
    'workout.review_today': 'Review today’s workout',
    'workout.exercise_count': `${params?.n} exercises`,
    'workout.est_sets': `${params?.n} sets`,
    'workout.repeat_replace_title': 'Replace current draft?',
    'workout.repeat_replace_message': 'You have an unfinished workout. Replace it with this repeated workout?',
    'workout.repeat_replace_confirm': 'Replace draft',
    'workout.repeat_replace_cancel': 'Keep current draft',
  }[key] ?? key) }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: harness.userId } } }) },
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      harness.queries.push({ table, filters });
      const result = () => {
        if (table === 'workout_sessions' && filters.some(([key, value]) => key === 'id' && value === harness.repeatedSessionId)) {
          return {
            data: {
              id: harness.repeatedSessionId,
              user_id: harness.userId,
              name: 'Repeated push',
              template_id: null,
            },
            error: null,
          };
        }
        if (table === 'workout_sets') {
          return {
            data: [
              { exercise_id: harness.customExerciseId, set_number: 1, reps: 8, is_warmup: false, exercise: { id: harness.customExerciseId, name: 'Tempo Press', muscle_group: 'chest' } },
              { exercise_id: harness.customExerciseId, set_number: 2, reps: 10, is_warmup: false, exercise: { id: harness.customExerciseId, name: 'Tempo Press', muscle_group: 'chest' } },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      };
      const query: Record<string, unknown> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn((key: string, value: unknown) => { filters.push([key, value]); return query; });
      query.order = vi.fn(() => query);
      query.limit = vi.fn(() => query);
      query.maybeSingle = vi.fn(() => Promise.resolve(result()));
      query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve);
      return query;
    },
  },
}));

import WorkoutPage from '@/app/dashboard/workout/page';
import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  constructor(initialState?: unknown) {
    if (initialState) this.values.set(`trophe:workout-workspace:${user.id}`, JSON.stringify(initialState));
  }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function DraftProbe() {
  const { state } = useWorkoutWorkspace();
  return <output aria-label="Draft state">{JSON.stringify(state)}</output>;
}

function renderPage(initialState?: unknown) {
  return render(
    <WorkoutWorkspaceProvider userId={user.id} storage={new MemoryStorage(initialState)}>
      <WorkoutPage />
      <DraftProbe />
    </WorkoutWorkspaceProvider>,
  );
}

function recoveredWorkspace(stage: 'draft' | 'review') {
  return {
    version: 2,
    stage,
    draft: {
      version: 2,
      kind: 'strength',
      name: 'Unfinished legs',
      templateKey: 'split:legs',
      templateId: null,
      updatedAt: 1,
      exercises: [{ exerciseId: 'old-squat', exerciseName: 'Old Squat', muscleGroup: 'quads', targetSets: 5, targetReps: '5' }],
    },
    sessionId: null,
    clock: null,
  };
}

afterEach(() => {
  cleanup();
  harness.repeatId = '';
  harness.programData = null;
  harness.push.mockReset();
  harness.createWorkoutSession.mockReset();
  harness.queries.length = 0;
});

describe('Workout home data flows', () => {
  it('loads only the signed-in user’s repeated session into a local Build draft without creating a session', async () => {
    harness.repeatId = repeatedSessionId;
    renderPage();

    await waitFor(() => expect(harness.push).toHaveBeenCalledWith('/dashboard/workout/build'));
    const state = JSON.parse(screen.getByLabelText('Draft state').textContent ?? '{}');
    expect(state.stage).toBe('draft');
    expect(state.draft).toMatchObject({
      name: 'Repeated push',
      templateKey: `repeat:${repeatedSessionId}`,
      templateId: null,
      exercises: [{
        exerciseId: customExerciseId,
        exerciseName: 'Tempo Press',
        muscleGroup: 'chest',
        targetSets: 2,
        targetReps: '8-10',
      }],
    });
    expect(harness.queries).toContainEqual(expect.objectContaining({
      table: 'workout_sessions',
      filters: expect.arrayContaining([['id', repeatedSessionId], ['user_id', user.id]]),
    }));
    expect(harness.createWorkoutSession).not.toHaveBeenCalled();
  });

  it.each([
    ['draft', '/dashboard/workout/build'],
    ['review', '/dashboard/workout/review'],
  ] as const)('keeps a recovered %s when repeat replacement is cancelled and routes back predictably', async (stage, route) => {
    harness.repeatId = repeatedSessionId;
    renderPage(recoveredWorkspace(stage));

    expect(await screen.findByRole('heading', { name: 'Replace current draft?' })).toBeTruthy();
    expect(harness.push).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Keep current draft' }));

    await waitFor(() => expect(harness.push).toHaveBeenCalledWith(route));
    const state = JSON.parse(screen.getByLabelText('Draft state').textContent ?? '{}');
    expect(state.stage).toBe(stage);
    expect(state.draft.name).toBe('Unfinished legs');
    expect(state.draft.exercises[0].exerciseId).toBe('old-squat');
    expect(harness.createWorkoutSession).not.toHaveBeenCalled();
  });

  it.each(['draft', 'review'] as const)('replaces a recovered %s only after confirmation, then routes the historical draft to Build', async (stage) => {
    harness.repeatId = repeatedSessionId;
    renderPage(recoveredWorkspace(stage));

    expect(await screen.findByText('You have an unfinished workout. Replace it with this repeated workout?')).toBeTruthy();
    expect(screen.getByLabelText('Draft state').textContent).toContain('Unfinished legs');
    fireEvent.click(screen.getByRole('button', { name: 'Replace draft' }));

    await waitFor(() => expect(harness.push).toHaveBeenCalledWith('/dashboard/workout/build'));
    const state = JSON.parse(screen.getByLabelText('Draft state').textContent ?? '{}');
    expect(state.stage).toBe('draft');
    expect(state.draft.name).toBe('Repeated push');
    expect(state.draft.exercises[0].exerciseId).toBe(customExerciseId);
    expect(JSON.stringify(state)).not.toContain('old-squat');
    expect(harness.createWorkoutSession).not.toHaveBeenCalled();
  });

  it('carries fully resolved tRPC coach exercise metadata into the program draft', async () => {
    harness.programData = {
      program: { name: 'Coach block' },
      exercises: [{ id: customExerciseId, name: 'Coach Tempo Press', nameEs: null, nameEl: null, muscleGroup: 'chest', equipment: 'barbell', isCompound: true }],
      days: [{
        id: 'day-1', weekday: 1, sort: 0,
        template: {
          id: templateId,
          name: 'Coach custom day',
          exercises: [{ exercise_id: customExerciseId, target_sets: 3, target_reps: '10' }],
        },
      }],
    };
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Review today’s workout' }));

    await waitFor(() => expect(harness.push).toHaveBeenCalledWith('/dashboard/workout/review'));
    const state = JSON.parse(screen.getByLabelText('Draft state').textContent ?? '{}');
    expect(state.draft.exercises[0]).toMatchObject({
      exerciseId: customExerciseId,
      exerciseName: 'Coach Tempo Press',
      muscleGroup: 'chest',
    });
    expect(state.draft.templateId).toBe(templateId);
    expect(harness.createWorkoutSession).not.toHaveBeenCalled();
  });
});
