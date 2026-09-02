// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import type { Exercise } from '@/lib/types';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const { createWorkoutSession, push } = vi.hoisted(() => ({
  createWorkoutSession: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/components/workout/workout-persistence', () => ({ createWorkoutSession }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'bench' }),
}));
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.priority;
    delete imageProps.fill;
    return React.createElement('img', imageProps);
  },
}));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), p: element('p') },
    useReducedMotion: () => true,
  };
});
vi.mock('@/lib/workout/units', () => ({
  useWeightUnit: () => ['kg'],
  kgToDisplay: (value: number) => value,
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'workout.strength': 'Strength',
        'workout.exercise_requires_strength_draft': 'Exercises can only be added to a strength draft.',
        'workout.create_strength_draft': 'Create strength draft',
        'workout.resume_current_workout': 'Resume current workout',
        'workout.start_request_locked': 'This workout start is waiting for confirmation. Retry the same start before editing exercises.',
        'workout.retry_same_start': 'Retry same start',
        'workout.back_exercises': 'Back to exercises',
        'workout.add_exercise': 'Add exercise',
        'workout.search_exercises': 'Search all exercises',
        'workout.picker_choose_area': 'What are you training?',
        'workout.picker_choose_area_hint': 'Choose a body area to see relevant exercises.',
        'workout.picker_recent': 'Recent',
        'workout.picker_options': '{n} options',
        'workout.picker_back_areas': 'Back to body areas',
        'workout.picker_result_title': '{area} exercises',
        'workout.picker_result_count': '{n} exercises',
        'workout.picker_none': 'No matching exercises',
        'workout.picker_custom': 'Create custom exercise',
        'workout.picker_custom_hint': "Can't find it?",
        'workout.picker_equipment': 'Equipment',
        'workout.picker_all_equipment': 'All equipment',
        'workout.picker_all_area': 'All {area}',
        'workout.picker_add_named': 'Add {name}',
        'workout.picker_add': 'Add',
        'workout.picker_info_named': 'Exercise info: {name}',
        'workout.picker_search_results': 'Search results',
        'workout.picker_clear_search': 'Clear search',
        'workout.compound': 'Compound',
        'workout.info_technique': 'Technique',
        'workout.info_muscles_worked': 'Muscles worked',
        'workout.info_primary': 'Primary',
        'workout.info_secondary': 'Secondary',
        'workout.info_setup': 'Setup',
        'workout.info_execution': 'Execution',
        'workout.info_breathing': 'Breathing',
        'workout.info_common_mistakes': 'Common mistakes',
        'workout.info_safety': 'Safety note',
        'workout.info_not_provided': 'No specific guidance is available.',
        'workout.info_safety_unavailable': 'No exercise-specific safety note is available.',
        'workout.info_pr': 'Personal best',
        'workout.info_last': 'Recent sessions',
        'workout.info_no_history': 'No history yet',
        'workout.exercise_added': 'Added',
        'workout.exercise_added_named': '{name} added',
        'workout.back_to_workout': 'Back to Workout',
        'workout.exercise_count': '{n} exercises',
        'workout.body_area_chest': 'Chest',
        'workout.body_area_back': 'Back',
        'workout.body_area_shoulders': 'Shoulders',
        'workout.body_area_arms': 'Arms',
        'workout.body_area_legs': 'Legs',
        'workout.body_area_core': 'Core',
        'workout.body_area_full_body': 'Full body',
        'workout.body_area_cardio': 'Cardio',
        'workout.muscle_chest': 'Chest',
        'workout.muscle_triceps': 'Triceps',
      };
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        copy[key] ?? key,
      );
    },
  }),
}));

import { ExerciseBrowser } from '@/components/workout/workspace/ExerciseBrowser';
import { RoutedExerciseDetail } from '@/components/workout/workspace/RoutedExerciseDetail';
import {
  WorkoutWorkspaceProvider,
  useWorkoutWorkspace,
} from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { saveWorkspaceState, type WorkspaceStorage } from '@/lib/workout/workspace-storage';

class MemoryStorage implements WorkspaceStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const bench: Exercise = {
  id: 'bench',
  name: 'Bench Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'barbell',
  is_compound: true,
  instructions: null,
  instructions_es: null,
  instructions_el: null,
  is_template: true,
  created_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
};

function strengthState(exercises: string[] = []): WorkoutWorkspaceState {
  return {
    stage: 'draft',
    draft: {
      version: 2,
      name: 'Push',
      kind: 'strength',
      updatedAt: 1,
      exercises: exercises.map((exerciseId) => ({ exerciseId, targetSets: 3, targetReps: '8-12' })),
    },
    sessionId: null,
    clock: null,
    clientRequestId: null,
  };
}

function reviewState(exercises: string[] = []): WorkoutWorkspaceState {
  return { ...strengthState(exercises), stage: 'review' };
}

function pendingStartState(exercises: string[] = ['bench']): WorkoutWorkspaceState {
  const state = reviewState(exercises);
  return {
    ...state,
    clientRequestId: '11111111-1111-4111-8111-111111111111',
    startRequest: {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      draftFingerprint: 'pending-push',
      sessionDate: '2026-08-24',
      name: 'Push',
      templateId: null,
      kind: 'strength',
      liveStructure: exercises.map((exerciseId) => ({ exerciseId, targetSets: 3, targetReps: '8-12', supersetGroup: null })),
    },
  };
}

const cardioState: WorkoutWorkspaceState = {
  stage: 'draft',
  draft: {
    version: 2,
    name: 'Run',
    kind: 'cardio',
    updatedAt: 1,
    activity: 'run',
    durationMinutes: 30,
    distanceKm: null,
    effort: null,
  },
  sessionId: null,
  clock: null,
  clientRequestId: null,
};

const liveState: WorkoutWorkspaceState = {
  ...strengthState(),
  stage: 'live',
  sessionId: 'session-1',
  clock: { runningSince: 1, accumulatedMs: 0 },
};

function WorkspaceProbe() {
  const { state } = useWorkoutWorkspace();
  const exerciseIds = state.draft?.kind === 'strength'
    ? state.draft.exercises.map(({ exerciseId }) => exerciseId).join(',')
    : '';
  return <output data-testid="workspace-state">{`${state.stage}:${state.draft?.kind ?? 'none'}:${exerciseIds}`}</output>;
}

function renderWithWorkspace(children: ReactNode, initialState?: WorkoutWorkspaceState) {
  const storage = new MemoryStorage();
  if (initialState) saveWorkspaceState(storage, 'nik', initialState);
  return render(
    <WorkoutWorkspaceProvider userId="nik" storage={storage}>
      {children}
      <WorkspaceProbe />
    </WorkoutWorkspaceProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('exercise routes with the real workout workspace provider', () => {
  it('returns from the routed browser at the top of the workout workspace', async () => {
    const originalUserAgent = window.navigator.userAgent;
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: 'Mobile Safari' });
    const scrollTo = vi.fn();
    vi.stubGlobal('scrollTo', scrollTo);
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, strengthState());
    await screen.findByRole('heading', { name: 'What are you training?' });

    fireEvent.click(screen.getByRole('button', { name: 'workout.picker_close' }));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, value: originalUserAgent });
  });

  it('adds multiple exercises in the browser and returns from the explicit footer without creating a session', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, strengthState());
    await screen.findByRole('heading', { name: 'What are you training?' });

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));

    await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:bench'));
    expect(push).not.toHaveBeenCalledWith('/dashboard/workout/build');
    fireEvent.click(screen.getByRole('button', { name: /Back to Workout/ }));
    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('closes the browser back to Review when final editing opened it from Review', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, reviewState());
    await screen.findByRole('heading', { name: 'What are you training?' });

    fireEvent.click(screen.getByRole('button', { name: 'workout.picker_close' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/review');
    expect(screen.getByTestId('workspace-state').textContent).toBe('review:strength:');
  });

  it('shows an already-added browser row as disabled and stays on the browser route', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, strengthState(['bench']));
    await screen.findByRole('heading', { name: 'What are you training?' });

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    const added = screen.getByRole('button', { name: 'Bench Press added' });
    expect(added.textContent).toContain('Added');
    expect(added.hasAttribute('disabled')).toBe(true);
    fireEvent.click(added);

    expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:bench');
    expect(push).not.toHaveBeenCalled();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('shows an already-added recent shortcut as disabled and stays on the browser route', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} initialRecentIds={['bench']} />, strengthState(['bench']));
    await screen.findByRole('heading', { name: 'What are you training?' });

    const added = screen.getByRole('button', { name: 'Bench Press added' });
    expect(added.textContent).toContain('Added');
    expect(added.hasAttribute('disabled')).toBe(true);
    fireEvent.click(added);

    expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:bench');
    expect(push).not.toHaveBeenCalled();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('creates a strength draft before exposing browser Add actions on a direct route', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />);

    expect(await screen.findByRole('button', { name: 'Create strength draft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();
    expect(screen.queryByRole('searchbox', { name: 'Search all exercises' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create strength draft' }));
    await screen.findByRole('heading', { name: 'What are you training?' });
    expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('offers a cardio draft resume path instead of browser Add actions', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, cardioState);

    expect(await screen.findByRole('button', { name: 'Resume current workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume current workout' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('routes an unsupported live state back to the active workout without exposing Add', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, liveState);

    expect(await screen.findByRole('button', { name: 'Resume current workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume current workout' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/live');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('routes browser exercise info without mutating or persisting the draft', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, strengthState());
    await screen.findByRole('heading', { name: 'What are you training?' });

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exercise info: Bench Press' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/exercises/bench');
    expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('adds from detail to a strength draft and returns to Build without creating a session', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />, strengthState());
    const add = await screen.findByRole('button', { name: 'Add Bench Press' });

    fireEvent.click(add);

    await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:bench'));
    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('adds from detail back to Review when final editing opened it from Review', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />, reviewState());

    fireEvent.click(await screen.findByRole('button', { name: 'Add Bench Press' }));

    await waitFor(() => expect(screen.getByTestId('workspace-state').textContent).toBe('review:strength:bench'));
    expect(push).toHaveBeenCalledWith('/dashboard/workout/review');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('blocks browser mutations for a recovered pending start and routes Retry to immutable Review', async () => {
    renderWithWorkspace(<ExerciseBrowser initialExercises={[bench]} />, pendingStartState(['bench']));

    expect(await screen.findByText('This workout start is waiting for confirmation. Retry the same start before editing exercises.')).toBeTruthy();
    expect(screen.queryByRole('searchbox', { name: 'Search all exercises' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry same start' }));
    expect(push).toHaveBeenCalledWith('/dashboard/workout/review');
    expect(screen.getByTestId('workspace-state').textContent).toBe('review:strength:bench');
  });

  it('blocks detail Add for a recovered pending start and never navigates as if it mutated', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />, pendingStartState());

    expect(await screen.findByText('This workout start is waiting for confirmation. Retry the same start before editing exercises.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Retry same start' }));
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/workout/review');
    expect(screen.getByTestId('workspace-state').textContent).toBe('review:strength:bench');
  });

  it('keeps the routed detail action disabled when the exercise is already added', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />, strengthState(['bench']));

    const added = await screen.findByRole('button', { name: 'Bench Press added' });
    expect(added.hasAttribute('disabled')).toBe(true);
    fireEvent.click(added);
    expect(push).not.toHaveBeenCalled();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('requires creating a strength draft before detail exposes Add', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />);

    expect(await screen.findByRole('button', { name: 'Create strength draft' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create strength draft' }));

    expect(await screen.findByRole('button', { name: 'Add Bench Press' })).toBeTruthy();
    expect(screen.getByTestId('workspace-state').textContent).toBe('draft:strength:');
    expect(push).not.toHaveBeenCalled();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('offers a cardio resume path instead of detail Add', async () => {
    renderWithWorkspace(<RoutedExerciseDetail exercise={bench} userId={null} />, cardioState);

    expect(await screen.findByRole('button', { name: 'Resume current workout' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add Bench Press' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Resume current workout' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });
});
