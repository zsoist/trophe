// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { workoutWorkspaceReducer, type WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const harness = vi.hoisted(() => ({
  pause: vi.fn(), resume: vi.fn(), requestFinish: vi.fn(), cancelFinish: vi.fn(),
  completeFinish: vi.fn(), discardLive: vi.fn(), commitLiveStrengthStructure: vi.fn(),
  loadLiveSessionSets: vi.fn(), loadLivePainFlags: vi.fn(), loadLivePrMap: vi.fn(),
  loadLiveStructure: vi.fn(), replayPendingLiveSets: vi.fn(), persistPendingLiveSet: vi.fn(),
  removePendingLiveSet: vi.fn(), completeLiveSet: vi.fn(), appendLivePainFlag: vi.fn(),
}));

const state: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-1', clock: { runningSince: Date.now(), accumulatedMs: 0 }, clientRequestId: null,
  draft: {
    version: 2, kind: 'strength', name: 'Upper', updatedAt: 1,
    exercises: [
      { exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' },
      { exerciseId: 'row', exerciseName: 'Dumbbell Row', targetSets: 1, targetReps: '10' },
    ],
  },
};
let workspace = { state, ...harness };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/components/workout/PlateCalculator', () => ({ default: () => null }));
vi.mock('@/components/workout/ExerciseMotion', () => ({ ExerciseMotion: ({ playbackDisabled }: { playbackDisabled?: boolean }) => <p role="status">{playbackDisabled ? 'Exercise media paused by workout' : 'Exercise media active'}</p> }));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/workout/live-session', () => ({
  loadLiveSessionSets: harness.loadLiveSessionSets, loadLivePainFlags: harness.loadLivePainFlags,
  loadLivePrMap: harness.loadLivePrMap, loadLiveStructure: harness.loadLiveStructure,
  replayPendingLiveSets: harness.replayPendingLiveSets, persistPendingLiveSet: harness.persistPendingLiveSet,
  removePendingLiveSet: harness.removePendingLiveSet, completeLiveSet: harness.completeLiveSet,
  appendLivePainFlag: harness.appendLivePainFlag,
  finishLiveSession: vi.fn(), uncompleteLiveSet: vi.fn(), recoverLiveExtraRows: vi.fn(() => []),
  updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: Record<string, unknown>) => ({
  'workout.loading_live_session': 'Loading live workout', 'workout.no_live_session': 'No live workout',
  'workout.active_duration': 'Active workout duration',
  'workout.pause_workout': 'Pause workout', 'workout.resume_workout': 'Resume workout',
  'workout.session_path': 'Workout path', 'workout.path_current': `Exercise ${values?.n}, current`,
  'workout.path_completed': `Exercise ${values?.n}, completed`, 'workout.path_pending': `Exercise ${values?.n}, pending`,
  'workout.exercise_position': `Exercise ${values?.current} of ${values?.total}`,
  'workout.current_target': `Target: ${values?.sets} × ${values?.reps}`,
  'workout.previous_values': 'Previous: no completed sets yet', 'workout.up_next_named': `Up next: ${values?.name}`,
  'workout.finish_ready_title': 'Ready to finish',
  'workout.complete_set': 'Complete set', 'workout.resting': 'Rest', 'workout.finish': 'Finish workout',
  'workout.weight_in_unit': `Weight in ${values?.unit}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
  'workout.undo_set': 'Undo set', 'workout.warmup': 'Warm-up', 'workout.set_number': `Set ${values?.n}`,
  'workout.more': 'More', 'workout.more_exercise_options': 'More exercise options', 'workout.add_set': 'Add set',
  'workout.info_technique': 'Technique', 'workout.report_pain': 'Report pain', 'workout.plate_title': 'Plate calculator',
  'workout.superset_link': 'Superset', 'workout.remove_exercise': 'Remove exercise', 'workout.saving': 'Saving…',
  'workout.finish_question': 'Finish workout?', 'workout.keep_training': 'Keep training', 'workout.save_and_finish': 'Save and finish',
  'workout.discard_empty': 'Discard', 'workout.finish_duration': 'Duration', 'workout.finish_pending_sets': 'Pending sets',
  'workout.finish_pain_notes': 'Pain notes', 'workout.finish_prs': 'PRs', 'workout.recovery_failed': 'Recovery failed',
  'workout.retry_recovery': 'Retry recovery', 'workout.mutation_failed': 'Mutation failed', 'workout.cancel': 'Cancel',
  'workout.remove_named': 'Remove', 'workout.finish_completed_sets': 'Completed sets',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

const bench = { id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' } as import('@/lib/types').Exercise;
const row = { ...bench, id: 'row', name: 'Dumbbell Row', equipment: 'dumbbell', muscle_group: 'back' as const };

beforeEach(() => {
  workspace = { state, ...harness };
  harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  harness.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  harness.loadLivePrMap.mockResolvedValue({});
  harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [
    { exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null },
    { exercise_id: 'row', target_sets: 1, target_reps: '10', superset_group: null },
  ] });
  harness.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [] });
  harness.persistPendingLiveSet.mockReturnValue(true);
  harness.completeLiveSet.mockResolvedValue({ ok: true, setId: 'set-1' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LiveWorkout focused stage', () => {
  it('keeps one current exercise in view with progress, target, set completion, rest, and the next exercise', async () => {
    render(<LiveWorkout exercises={[bench, row]} />);

    expect(await screen.findByText('Exercise 1 of 2')).toBeTruthy();
    expect(screen.getByLabelText('Active workout duration').textContent).toMatch(/^\d+:\d{2}$/);
    expect(screen.getByRole('button', { name: 'Pause workout' })).toBeTruthy();
    expect(screen.getByText('Target: 1 × 8')).toBeTruthy();
    expect(screen.getByText('Previous: no completed sets yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(await screen.findByText(/Rest/)).toBeTruthy();
    expect(screen.getByText('Up next: Dumbbell Row')).toBeTruthy();
    expect(screen.queryByText('Dumbbell Row', { selector: 'h3' })).toBeNull();
  });

  it('pauses with a finite elapsed duration instead of forwarding the button event into the clock', async () => {
    let pausedState = state;
    harness.pause.mockImplementationOnce((now = Date.now()) => {
      pausedState = workoutWorkspaceReducer(pausedState, { type: 'live.paused', payload: { now } });
    });
    render(<LiveWorkout exercises={[bench, row]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause workout' }));
    expect(pausedState.stage).toBe('paused');
    expect(Number.isFinite(pausedState.clock?.accumulatedMs)).toBe(true);
  });

  it('uses stable path controls to revisit a completed exercise without expanding the whole session', async () => {
    harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [{
      id: 'bench-set', session_id: 'session-1', exercise_id: 'bench', set_number: 1,
      weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null, created_at: new Date().toISOString(),
    }] });
    render(<LiveWorkout exercises={[bench, row]} />);
    expect(await screen.findByText('Exercise 2 of 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Exercise 1, completed' }));
    expect(await screen.findByText('Exercise 1 of 2')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Undo set' })).toBeTruthy();
    expect(screen.queryByText('Dumbbell Row', { selector: 'h3' })).toBeNull();
  });

  it('renders a finish-ready state after every exercise is complete while retaining the path for corrections', async () => {
    harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [
      { id: 'bench-set', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null, created_at: new Date().toISOString() },
      { id: 'row-set', session_id: 'session-1', exercise_id: 'row', set_number: 1, weight_kg: 30, reps: 10, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null, created_at: new Date().toISOString() },
    ] });
    render(<LiveWorkout exercises={[bench, row]} />);
    expect(await screen.findByText('Ready to finish')).toBeTruthy();
    expect(screen.queryByText('Exercise 1 of 2')).toBeNull();
    expect(screen.getByRole('button', { name: 'Finish workout' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exercise 1, completed' })).toBeTruthy();
  });

  it('keeps the clock paused and stops the exact exercise media until an explicit resume', async () => {
    workspace = { ...workspace, state: { ...state, stage: 'paused', clock: { runningSince: null, accumulatedMs: 30_000 } } };
    render(<LiveWorkout exercises={[bench, row]} />);
    expect((await screen.findByRole('status', { name: '' })).textContent).toBe('Exercise media paused by workout');
    expect(screen.getByRole('button', { name: 'Resume workout' })).toBeTruthy();
  });
});
