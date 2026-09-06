// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { push, startLiveSession } = vi.hoisted(() => ({
  push: vi.fn(),
  startLiveSession: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/workout/live-session', () => ({
  startLiveSession,
  savePreparedRetrospectiveWorkout: vi.fn(),
  discardEmptyLiveSession: vi.fn(),
  validateRetrospectiveWorkoutInput: vi.fn(() => true),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'en',
      t: (key: string, params?: Record<string, string | number>) => {
        const source = actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          source,
        );
      },
    }),
  };
});

import { WorkoutHome, type WorkoutHomeProgram } from '@/components/workout/workspace/WorkoutHome';
import { WorkoutWorkspaceProvider } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import type { Exercise, WorkoutRecommendation } from '@/lib/types';
import { saveWorkspaceState } from '@/lib/workout/workspace-storage';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const exercises: Exercise[] = [
  { id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: ['triceps', 'shoulders'], equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
  { id: 'row', name: 'Seated Cable Row', name_es: null, name_el: null, muscle_group: 'back', secondary_muscles: ['biceps'], equipment: 'cable', is_compound: true, is_template: true, created_by: null, created_at: '' },
  { id: 'press', name: 'Shoulder Press', name_es: null, name_el: null, muscle_group: 'shoulders', secondary_muscles: ['triceps'], equipment: 'dumbbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
];

const coachProgram: WorkoutHomeProgram = {
  programName: 'Strength Base',
  todayTemplate: {
    templateKey: 'template:coach-push',
    templateId: '11111111-1111-4111-8111-111111111111',
    name: 'Coach Push',
    muscleSummary: ['chest', 'shoulders', 'triceps'],
    exercises: [{ exerciseId: 'bench', exerciseName: 'Barbell Bench Press', muscleGroup: 'chest', targetSets: 4, targetReps: '6-8' }],
  },
  alsoToday: [],
  nextWeekday: 5,
  nextTemplateName: 'Lower strength',
};

const recommendation: WorkoutRecommendation = {
  source: 'recommendation',
  reasons: ['Ranked from recent completed work.'],
  estimatedDurationMinutes: 32,
  equipment: ['barbell', 'cable'],
  muscleDistribution: { chest: 3, back: 3 },
  exercises: [
    { exerciseId: 'bench', name: 'Barbell Bench Press', muscleGroup: 'chest', equipment: 'barbell', targetSets: 3, targetReps: '8-10' },
    { exerciseId: 'row', name: 'Seated Cable Row', muscleGroup: 'back', equipment: 'cable', targetSets: 3, targetReps: '8-10' },
  ],
};

function renderHome({
  program = null,
  recommended = null,
  initialState,
  programLoading = false,
  recommendationLoading = false,
  workedExerciseIds = null,
}: {
  program?: WorkoutHomeProgram | null;
  recommended?: WorkoutRecommendation | null;
  initialState?: WorkoutWorkspaceState;
  programLoading?: boolean;
  recommendationLoading?: boolean;
  workedExerciseIds?: string[] | null;
} = {}) {
  const storage = new MemoryStorage();
  if (initialState) saveWorkspaceState(storage, 'nik', initialState);
  return render(
    <WorkoutWorkspaceProvider userId="nik" storage={storage}>
      <WorkoutHome
        exercises={exercises}
        workedExerciseIds={workedExerciseIds}
        program={program}
        recommendation={recommended}
        programLoading={programLoading}
        recommendationLoading={recommendationLoading}
        recents={[]}
        routines={[]}
      />
    </WorkoutWorkspaceProvider>,
  );
}

afterEach(() => {
  cleanup();
  push.mockReset();
  startLiveSession.mockReset();
});

describe('Workout home v3', () => {
  it('separates recorded muscles from the planned workout and switches to their view', () => {
    renderHome({ program: coachProgram, workedExerciseIds: ['row'] });
    const home = screen.getByRole('region', { name: "Today's target" });
    fireEvent.click(within(home).getByRole('button', { name: /Worked today/ }));
    expect(within(home).getByRole('button', { name: /^Latissimus dorsi primary muscle$/i })).toBeTruthy();
    expect(within(home).queryByRole('button', { name: /^Pectoralis major primary muscle$/i })).toBeNull();
    fireEvent.click(within(home).getByRole('button', { name: /^Latissimus dorsi primary muscle$/i }));
    expect(within(home).getByRole('button', { name: /^Back$/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(home).getByRole('button', { name: /^Latissimus dorsi primary muscle$/i }));
    expect(within(home).getByRole('button', { name: /^Latissimus dorsi primary muscle$/i }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(home).getByRole('button', { name: /Planned/ }));
    expect(within(home).getByRole('button', { name: /^Pectoralis major primary muscle$/i })).toBeTruthy();
  });

  it.each([
    [[], 'No working sets recorded today yet.'],
    [null, 'Recorded muscles are unavailable right now. Your planned workout is still here.'],
  ] as const)('distinguishes an empty recorded day from unavailable data: %s', (ids, message) => {
    renderHome({ program: coachProgram, workedExerciseIds: ids ? [...ids] : null });
    fireEvent.click(screen.getByRole('button', { name: /Worked today/ }));
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.getByTestId('workout-primary-action')).toBeTruthy();
  });
  it('makes a coach assignment, plan readiness, target, and review action immediately explicit', async () => {
    renderHome({ program: coachProgram, recommended: recommendation });

    expect(screen.getByText(/assigned by coach/i)).toBeTruthy();
    expect(screen.getByText(/ready to review/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Coach Push' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /review plan/i }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: /finish workout/i })).toBeNull();
    expect(screen.getByTestId('atlas-region-pectoralis-major')).toBeTruthy();
    expect(screen.getByText('Lower strength')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /build strength workout/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /workout templates/i })).toBeNull();

    fireEvent.click(screen.getByTestId('atlas-region-pectoralis-major'));
    expect(screen.getByRole('button', { name: /^Pectoralis major primary muscle$/i })).toBeTruthy();
  });

  it('presents a deterministic recommendation for review without starting a live session', () => {
    renderHome({ recommended: recommendation });

    expect(screen.getByText(/recommended by trophē/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /review plan/i }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/review');
    expect(startLiveSession).not.toHaveBeenCalled();
  });

  it('uses one build action when no assigned or recommended plan exists', () => {
    renderHome();

    const primaryActions = screen.getAllByTestId('workout-primary-action');
    expect(primaryActions).toHaveLength(1);
    expect(primaryActions[0].textContent).toMatch(/build workout/i);
    fireEvent.click(primaryActions[0]);

    expect(push).toHaveBeenCalledWith('/dashboard/workout/exercises');
    expect(startLiveSession).not.toHaveBeenCalled();
  });

  it('does not label a represented strength target as absent when template summary is empty', async () => {
    renderHome({ program: { ...coachProgram, todayTemplate: { ...coachProgram.todayTemplate!, muscleSummary: [] } } });
    expect(screen.getByRole('button', { name: /^Pectoralis major primary muscle$/i })).toBeTruthy();
    expect(screen.queryByText('No muscle target selected')).toBeNull();
  });

  it('renders an honest neutral atlas when there is no strength target', () => {
    renderHome();

    expect(screen.getByText('No muscle target selected')).toBeTruthy();
    expect(screen.getByText(/add strength exercises to see their muscle roles/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pectoralis major|latissimus dorsi|quadriceps|hamstrings/i })).toBeNull();
  });

  it('does not invent strength activation evidence for a cardio draft', () => {
    renderHome({
      initialState: {
        stage: 'draft',
        draft: { version: 2, kind: 'cardio', name: 'Easy run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 6 },
        sessionId: null,
        clock: null,
        clientRequestId: null,
      },
    });

    expect(screen.getByText('Cardio session · no named muscle target')).toBeTruthy();
    expect(screen.getByText(/cardio is tracked by activity, duration, distance, and effort/i)).toBeTruthy();
    expect(screen.queryByText(/lower body · core/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /pectoralis major|quadriceps/i })).toBeNull();
  });

  it.each([
    ['an adaptive recommendation', null, recommendation],
    ['a coach offer', coachProgram, null],
  ] as const)('keeps a saved cardio draft neutral when %s also exists', (_label, program, recommended) => {
    renderHome({
      program,
      recommended,
      initialState: {
        stage: 'draft',
        draft: { version: 2, kind: 'cardio', name: 'Easy run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 6 },
        sessionId: null,
        clock: null,
        clientRequestId: null,
      },
    });

    expect(screen.getByRole('heading', { name: 'Easy run' })).toBeTruthy();
    expect(screen.getByText('Cardio session · no named muscle target')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /pectoralis major|latissimus dorsi/i })).toBeNull();
    expect(screen.queryByText(/pectoralis major · primary target/i)).toBeNull();
    expect(screen.getByTestId('workout-primary-action').textContent).toBe('Continue editing');
    const todaySchedule = within(screen.getByRole('region', { name: 'Schedule' })).getAllByRole('listitem')[0];
    expect(within(todaySchedule).getByText('Easy run')).toBeTruthy();
    expect(within(todaySchedule).getByText('Your saved draft')).toBeTruthy();
  });

  it('blocks draft actions and schedule claims until both plan queries resolve', () => {
    renderHome({ programLoading: true, recommendationLoading: true });

    expect(screen.getByRole('status', { name: 'Loading workout workspace' })).toBeTruthy();
    expect(screen.getByText(/checking the coach assignment and recommendation/i)).toBeTruthy();
    expect(screen.queryByTestId('workout-primary-action')).toBeNull();
    expect(screen.queryByRole('button', { name: /build workout|review plan/i })).toBeNull();
    expect(screen.queryByText(/no coach session is scheduled/i)).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it('keeps the recoverable draft as the singular action when an offered plan also exists', () => {
    renderHome({
      program: coachProgram,
      initialState: {
        stage: 'draft',
        draft: { version: 2, name: 'Saved pull', kind: 'strength', updatedAt: 1, exercises: [{ exerciseId: 'row', exerciseName: 'Seated Cable Row', muscleGroup: 'back', targetSets: 3, targetReps: '8' }] },
        sessionId: null,
        clock: null,
        clientRequestId: null,
      },
    });

    expect(screen.getAllByTestId('workout-primary-action')).toHaveLength(1);
    expect(screen.getByTestId('workout-primary-action').textContent).toMatch(/continue editing/i);
    expect(screen.queryByRole('button', { name: 'Review plan' })).toBeNull();
  });

  it('separates the model, muscle controls and primary action in normal flow', () => {
    renderHome({ program: coachProgram });
    const home = screen.getByRole('region', { name: "Today's target" });
    expect(within(home).getByRole('group', { name: 'Training view' })).toBeTruthy();
    expect(within(home).getByRole('button', { name: /^Pectoralis major primary muscle$/i })).toBeTruthy();
    expect(home.querySelector('.workout-muscle-body')).toBeTruthy();
    const action = screen.getByTestId('workout-primary-action');
    expect(home.contains(action)).toBe(true);
  });

  it('marks the readiness, atlas, and primary action as one mobile first-viewport composition', () => {
    renderHome({ program: coachProgram });

    const composition = screen.getByTestId('workout-home-first-view');
    expect(composition.className).toContain('workout-home-first-view');
    expect(within(composition).getByRole('region', { name: "Today's workout status" })).toBeTruthy();
    expect(within(composition).getByLabelText('Muscle activation atlas')).toBeTruthy();
    expect(within(composition).getByTestId('workout-primary-action')).toBeTruthy();
  });

  it.each([
    ['secondary first', ['bench', 'press']],
    ['primary first', ['press', 'bench']],
  ] as const)('keeps the strongest role when the same muscle is resolved more than once: %s', (_label, exerciseOrder) => {
    const byId = new Map([
      ['bench', coachProgram.todayTemplate!.exercises[0]],
      ['press', { exerciseId: 'press', exerciseName: 'Shoulder Press', muscleGroup: 'shoulders' as const, targetSets: 3, targetReps: '8-10' }],
    ]);
    const mixedProgram: WorkoutHomeProgram = {
      ...coachProgram,
      todayTemplate: {
        ...coachProgram.todayTemplate!,
        muscleSummary: ['chest', 'shoulders'],
        exercises: exerciseOrder.map((id) => byId.get(id)!),
      },
    };

    renderHome({ program: mixedProgram });

    // The shoulder press only carries a muscle group, so the strongest claim for the
    // region is the group estimate: it is named by group, never as a primary muscle.
    expect(screen.getByRole('button', { name: 'Shoulders, muscle group' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Anterior deltoid, primary muscle' })).toBeNull();
  });

  it('attributes an adaptive recommendation to the recommendation on a coach rest day', () => {
    renderHome({
      program: { ...coachProgram, todayTemplate: null },
      recommended: recommendation,
    });

    const schedule = screen.getByRole('region', { name: 'Schedule' });
    const today = within(schedule).getAllByRole('listitem')[0];
    expect(today.textContent).toContain('Adaptive plan');
    expect(today.textContent).not.toContain('Strength Base');
  });

  it.each(['live', 'paused'] as const)('uses Resume workout only for a recoverable %s session', async (stage) => {
    renderHome({
      program: coachProgram,
      initialState: {
        stage,
        draft: { version: 2, name: 'Push in progress', kind: 'strength', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Barbell Bench Press', muscleGroup: 'chest', targetSets: 3, targetReps: '8' }] },
        sessionId: 'session-1',
        clock: { runningSince: stage === 'live' ? 1 : null, accumulatedMs: 2000 },
        clientRequestId: null,
      },
    });

    expect(await screen.findByRole('button', { name: 'Resume workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Review plan' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Build workout' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume workout' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard/workout/live'));
  });
});
