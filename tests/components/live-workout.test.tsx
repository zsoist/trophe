// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const harness = vi.hoisted(() => ({
  requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(),
  updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn(),
  finishLiveSession: vi.fn(), loadLiveSessionSets: vi.fn(),
  completeLiveSet: vi.fn(), loadLivePrMap: vi.fn(), loadLivePainFlags: vi.fn(),
  appendLivePainFlag: vi.fn(), loadLiveStructure: vi.fn(),
  updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
}));

const liveState: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-1', clock: { runningSince: Date.now(), accumulatedMs: 0 },
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] },
};
let workspace = { state: liveState, pause: vi.fn(), resume: vi.fn(), ...harness };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: ({ onSave }: { onSave: (flag: { exercise_id: string; body_part: string; severity: number }, mutationId: string) => Promise<boolean> }) => <button type="button" onClick={() => void onSave({ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }, '33333333-3333-4333-8333-333333333333')}>Save pain note</button> }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => { void _initial; void _animate; void _exit; void _transition; return <div {...props}>{children}</div>; } }, useReducedMotion: () => true }));
vi.mock('@/components/workout/workspace/ExerciseSetLogger', () => ({
  ExerciseSetLogger: ({ exercise, disabled, onComplete, onSuperset, onRemove, onPain, onPlateCalculator }: { exercise: { name: string }; disabled?: boolean; onComplete: (value: { weight: number; reps: number; rpe: number | null; isWarmup: boolean }) => Promise<string | null>; onSuperset?: () => void; onRemove?: () => void; onPain?: () => void; onPlateCalculator?: (weight: number) => void }) => (
    <div>
      <button type="button" disabled={disabled} onClick={() => void onComplete({ weight: 60, reps: 8, rpe: null, isWarmup: false })}>Complete {exercise.name}</button>
      <button type="button" disabled={disabled} onClick={onSuperset}>Superset {exercise.name}</button>
      <button type="button" disabled={disabled} onClick={onRemove}>Remove {exercise.name}</button>
      <button type="button" disabled={disabled} onClick={onPain}>Pain {exercise.name}</button>
      <button type="button" disabled={disabled} onClick={() => onPlateCalculator?.(100)}>Plate {exercise.name}</button>
    </div>
  ),
}));
vi.mock('@/lib/workout/live-session', () => ({
  finishLiveSession: harness.finishLiveSession,
  loadLiveSessionSets: harness.loadLiveSessionSets,
  completeLiveSet: harness.completeLiveSet, uncompleteLiveSet: vi.fn(),
  loadLivePrMap: harness.loadLivePrMap, loadLivePainFlags: harness.loadLivePainFlags,
  recoverLiveExtraRows: vi.fn(() => []),
  appendLivePainFlag: harness.appendLivePainFlag, loadLiveStructure: harness.loadLiveStructure,
  updateLiveStructure: harness.updateLiveStructure, removeAndNormalizeLiveExercises: harness.removeAndNormalizeLiveExercises,
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.finish': 'Finish workout', 'workout.finish_question': 'Finish workout?',
  'workout.keep_training': 'Keep training', 'workout.save_and_finish': 'Save and finish',
  'workout.discard_empty': 'Discard empty workout', 'workout.finish_duration': 'Duration 1 min',
  'workout.finish_completed_sets': '0 completed sets', 'workout.finish_pending_sets': '1 pending sets',
  'workout.finish_pain_notes': '0 pain notes', 'workout.finish_prs': '0 PRs', 'workout.saving': 'Saving…',
  'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.add_set': 'Add set',
  'workout.distance_optional': 'Distance optional', 'workout.effort': 'Effort',
  'workout.save_failed': 'Save failed',
  'workout.mutation_failed': 'A workout change could not be saved. Retry that change before finishing.',
  'workout.recovery_failed': 'Workout recovery could not be verified.', 'workout.retry_recovery': 'Retry recovery',
  'workout.plate_title': 'Plate calculator', 'workout.plate_total_label': 'Total weight', 'workout.plate_bar_label': 'Bar weight',
  'workout.plate_inventory_label': 'Available plates per side', 'workout.plate_inventory_help': 'Use semicolons.',
  'workout.plate_left_side': 'Left side', 'workout.plate_right_side': 'Right side', 'workout.plate_per_side': 'Plates are listed per side',
  'workout.plate_exact': 'Exact load', 'workout.plate_nearest': 'Nearest achievable load', 'workout.plate_impossible': 'No achievable load',
  'workout.warmup_title': 'Warm-up ramp', 'workout.warmup_explanation': 'Suggestions based on your working weight.', 'workout.warmup_no_ramp': 'No ramp available.',
  'workout.add_warmup_sets': 'Add warm-up sets', 'workout.add_warmup_sets_saving': 'Adding warm-up sets…', 'workout.add_warmup_sets_failed': 'Warm-up sets could not be added. Retry.', 'workout.custom_cancel': 'Close',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

beforeEach(() => {
  harness.loadLivePrMap.mockResolvedValue({});
  harness.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [
    { exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null },
  ] });
  harness.appendLivePainFlag.mockResolvedValue({ ok: true, flags: [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }] });
  harness.updateLiveStructure.mockResolvedValue({ ok: true, version: 1, structure: [] });
  harness.removeAndNormalizeLiveExercises.mockImplementation((items: Array<{ exerciseId: string }>, removeId: string) => items.filter((item) => item.exerciseId !== removeId).map((item) => ({ ...item, linkedBelow: false })));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); workspace = { state: liveState, pause: vi.fn(), resume: vi.fn(), ...harness }; });

describe('LiveWorkout', () => {
  it('requires confirmation before finishing', async () => {
    render(<LiveWorkout exercises={[]} />);
    const finish = screen.getByRole('button', { name: 'Finish workout' });
    await vi.waitFor(() => expect(finish.hasAttribute('disabled')).toBe(false));
    fireEvent.click(finish);
    expect(harness.finishLiveSession).not.toHaveBeenCalled();
    expect(harness.requestFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Finish workout?' })).toBeTruthy();
  });

  it('returns to the provider clock mode when Keep training is chosen', () => {
    workspace = { ...workspace, state: { ...liveState, stage: 'finishing', finishingFrom: 'live', clock: { runningSince: null, accumulatedMs: 60_000 } } };
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep training' }));
    expect(harness.cancelFinish).toHaveBeenCalledTimes(1);
  });

  it('clears finishing recovery after an exact committed finish replay is verified', async () => {
    workspace = { ...workspace, state: { ...liveState, stage: 'finishing', finishingFrom: 'live', clock: { runningSince: null, accumulatedMs: 60_000 } } };
    harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [{
      id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1,
      weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null,
    }] });
    harness.finishLiveSession.mockImplementation(async (_input: unknown, onVerified: () => void) => {
      onVerified();
      return { ok: true };
    });
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Save and finish' }));
    await vi.waitFor(() => expect(harness.completeFinish).toHaveBeenCalledTimes(1));
  });

  it('uses the pre-session kilogram baseline to persist compound PRs', async () => {
    harness.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
    harness.loadLivePrMap.mockResolvedValue({ bench: 50 });
    harness.completeLiveSet.mockResolvedValue({ ok: true, setId: 'set-1' });
    render(<LiveWorkout userId="nik" exercises={[{
      id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null,
      equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '',
    }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Bench Press' }));
    await vi.waitFor(() => expect(harness.completeLiveSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 60, isPr: true })));
  });

  it('uses the real plate calculator callback, retains identities for an exact retry, and blocks finish while it is pending', async () => {
    harness.completeLiveSet.mockResolvedValueOnce({ ok: true, setId: 'warmup-1' }).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, setId: 'warmup-retry' });
    render(<LiveWorkout exercises={[{
      id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null,
      equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '',
    }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Plate Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    await screen.findAllByRole('alert');
    const firstAttempt = harness.completeLiveSet.mock.calls.map(([input]) => input.setNumber);
    expect(firstAttempt).toEqual([1, 2]);
    fireEvent.change(screen.getByLabelText('Total weight (kg)'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Add warm-up sets' })).toBeTruthy());
    expect(harness.completeLiveSet.mock.calls).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('Total weight (kg)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(harness.completeLiveSet.mock.calls.length).toBeGreaterThan(2));
    expect(harness.completeLiveSet.mock.calls[2][0].setNumber).toBe(1);
  });

  it('blocks finish while a set write is pending and after a failed write until retry succeeds', async () => {
    let resolveWrite!: (value: { ok: false }) => void;
    harness.completeLiveSet.mockReturnValueOnce(new Promise((resolve) => { resolveWrite = resolve; }));
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Bench Press' }));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    resolveWrite({ ok: false });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be saved');
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);

    harness.completeLiveSet.mockResolvedValueOnce({ ok: true, setId: 'set-1' });
    let resolveRecovery!: (value: { ok: true; sets: [] }) => void;
    harness.loadLiveSessionSets.mockReturnValueOnce(new Promise((resolve) => { resolveRecovery = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(harness.requestFinish).not.toHaveBeenCalled();
    resolveRecovery({ ok: true, sets: [] });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Complete Bench Press' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Complete Bench Press' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(false));
  });

  it('never replaces pain flags after an unverified read and offers recovery retry', async () => {
    harness.loadLivePainFlags.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, flags: [] });
    render(<LiveWorkout exercises={[]} />);
    expect((await screen.findByRole('alert')).textContent).toContain('recovery could not be verified');
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry recovery' }));
    await vi.waitFor(() => expect(screen.queryByText('Workout recovery could not be verified.')).toBeNull());
  });

  it('keeps a failed pain write retryable and inside the finish barrier', async () => {
    let resolvePain!: (saved: { ok: false }) => void;
    harness.appendLivePainFlag.mockReturnValueOnce(new Promise((resolve) => { resolvePain = resolve; }));
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pain Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save pain note' }));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    resolvePain({ ok: false });
    expect((await screen.findByRole('alert')).textContent).toContain('could not be saved');
    expect(screen.getByRole('button', { name: 'Save pain note' })).toBeTruthy();

    harness.appendLivePainFlag.mockResolvedValueOnce({ ok: true, flags: [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Save pain note' }));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(false));
  });

  it('stores live cardio edits in the recoverable draft and offers discard for an immediate empty finish', async () => {
    workspace = { ...workspace, state: {
      ...liveState,
      draft: { version: 2, kind: 'cardio', name: 'Run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: null, effort: null },
      clock: { runningSince: Date.now(), accumulatedMs: 0 },
    } };
    harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [] });
    render(<LiveWorkout exercises={[]} />);
    fireEvent.change(await screen.findByLabelText('Distance optional'), { target: { value: '4.2' } });
    expect(harness.updateLiveCardioDraft).toHaveBeenCalledWith({ distanceKm: 4.2, effort: null });
    fireEvent.change(screen.getByLabelText('Distance optional'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(await screen.findByRole('button', { name: 'Discard empty workout' })).toBeTruthy();
  });

  it('persists superset links before sets exist and commits verified removals to recovery', async () => {
    workspace = { ...workspace, state: {
      ...liveState,
      draft: { version: 2, kind: 'strength', name: 'Upper', updatedAt: 1, exercises: [
        { exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' },
        { exerciseId: 'row', exerciseName: 'Row', targetSets: 1, targetReps: '8' },
      ] },
    } };
    harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 4, structure: [
      { exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null },
      { exercise_id: 'row', target_sets: 1, target_reps: '8', superset_group: null },
    ] });
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Superset Bench Press' }));
    await vi.waitFor(() => expect(harness.updateLiveStructure).toHaveBeenCalledWith('session-1', [
      { exerciseId: 'bench', targetSets: 1, targetReps: '8', supersetGroup: 1 },
      { exerciseId: 'row', targetSets: 1, targetReps: '8', supersetGroup: 1 },
    ], 4));
    await vi.waitFor(() => expect(harness.commitLiveStrengthStructure).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ exerciseId: 'bench', linkedBelow: true }),
    ])));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Bench Press' }));
    await vi.waitFor(() => expect(harness.updateLiveStructure).toHaveBeenCalledWith('session-1', [
      { exerciseId: 'row', targetSets: 1, targetReps: '8', supersetGroup: null },
    ], 1, 'bench'));
    await vi.waitFor(() => expect(harness.commitLiveStrengthStructure).toHaveBeenLastCalledWith([
      expect.objectContaining({ exerciseId: 'row', linkedBelow: false }),
    ]));
  });

  it('retains live structure and blocks finish when a superset write fails', async () => {
    workspace = { ...workspace, state: {
      ...liveState,
      draft: { version: 2, kind: 'strength', name: 'Upper', updatedAt: 1, exercises: [
        { exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8', linkedBelow: false },
        { exerciseId: 'row', exerciseName: 'Row', targetSets: 1, targetReps: '8', linkedBelow: false },
      ] },
    } };
    harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [
      { exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null },
      { exercise_id: 'row', target_sets: 1, target_reps: '8', superset_group: null },
    ] });
    harness.updateLiveStructure.mockResolvedValueOnce({ ok: false });
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Superset Bench Press' }));
    expect((await screen.findByRole('alert')).textContent).toContain('could not be saved');
    expect(harness.commitLiveStrengthStructure).not.toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ exerciseId: 'bench', linkedBelow: true }),
    ]));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
  });

  it('fails closed when set recovery cannot be verified', async () => {
    harness.loadLiveSessionSets.mockResolvedValue({ ok: false });
    render(<LiveWorkout exercises={[]} />);
    expect((await screen.findByRole('alert')).textContent).toContain('recovery could not be verified');
    expect(screen.queryByRole('button', { name: 'Complete Bench Press' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
  });

  it('recovers canonical server structure before allowing writes', async () => {
    harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 7, structure: [
      { exercise_id: 'bench', target_sets: 2, target_reps: '5', superset_group: null },
    ] });
    render(<LiveWorkout exercises={[]} />);
    await vi.waitFor(() => expect(harness.commitLiveStrengthStructure).toHaveBeenCalledWith([
      expect.objectContaining({ exerciseId: 'bench', targetSets: 2, targetReps: '5', linkedBelow: false }),
    ]));
  });
});
