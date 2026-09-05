// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const harness = vi.hoisted(() => ({
  requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(),
  acknowledgeCompleted: vi.fn(), reconcileLive: vi.fn(),
  updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn(),
  finishLiveSession: vi.fn(), loadLiveSessionSets: vi.fn(),
  completeLiveSet: vi.fn(), loadLivePrMap: vi.fn(), loadLivePainFlags: vi.fn(),
  appendLivePainFlag: vi.fn(), loadLiveStructure: vi.fn(),
  updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
  persistPendingLiveSet: vi.fn(), removePendingLiveSet: vi.fn(), replayPendingLiveSets: vi.fn(),
  clearPendingLiveSets: vi.fn(),
}));

const liveState: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-1', clock: { runningSince: Date.now(), accumulatedMs: 0 },
  clientRequestId: null, startRequest: null, retrospectiveRequest: null, completedRetrospective: null, finishingFrom: null,
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] },
};
let workspace: Record<string, unknown> = { state: liveState, liveReconciliation: null, pause: vi.fn(), resume: vi.fn(), ...harness };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/components/workout/PlateCalculator', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> }, useReducedMotion: () => true }));
vi.mock('@/components/workout/workspace/ExerciseSetLogger', () => ({
  ExerciseSetLogger: ({ exercise, disabled, onComplete }: { exercise: { name: string }; disabled?: boolean; onComplete: (value: { weight: number; reps: number; rpe: number | null; isWarmup: boolean }) => Promise<string | null> }) => (
    <button type="button" disabled={disabled} onClick={() => void onComplete({ weight: 60, reps: 8, rpe: null, isWarmup: false })}>Complete {exercise.name}</button>
  ),
}));
vi.mock('@/lib/workout/live-session', () => ({
  finishLiveSession: harness.finishLiveSession, loadLiveSessionSets: harness.loadLiveSessionSets,
  completeLiveSet: harness.completeLiveSet, completeLiveSetDetailed: harness.completeLiveSet, uncompleteLiveSet: vi.fn(),
  loadLivePrMap: harness.loadLivePrMap, loadLivePainFlags: harness.loadLivePainFlags,
  recoverLiveExtraRows: vi.fn(() => []),
  appendLivePainFlag: harness.appendLivePainFlag, loadLiveStructure: harness.loadLiveStructure,
  updateLiveStructure: harness.updateLiveStructure, removeAndNormalizeLiveExercises: harness.removeAndNormalizeLiveExercises,
  persistPendingLiveSet: harness.persistPendingLiveSet, removePendingLiveSet: harness.removePendingLiveSet,
  replayPendingLiveSets: harness.replayPendingLiveSets, clearPendingLiveSets: harness.clearPendingLiveSets,
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.finish': 'Finish workout', 'workout.finish_question': 'Finish workout?',
  'workout.keep_training': 'Keep training', 'workout.save_and_finish': 'Save and finish',
  'workout.completed_title': 'Workout complete', 'workout.completed_message': 'Your workout is saved.',
  'workout.completed_done': 'Done', 'workout.history': 'History', 'workout.min': 'min',
  'workout.completed_elsewhere': 'This workout was already completed on another device.',
  'workout.mutation_failed': 'A workout change could not be saved. Retry that change before finishing.',
  'workout.set_not_saved': 'This set was not saved. Edit it and try again.',
  'workout.recovery_failed': 'Workout recovery could not be verified.', 'workout.retry_recovery': 'Retry recovery',
  'workout.finish_blocked_loading': 'Finish is unavailable while the workout is being recovered.',
  'workout.finish_blocked_pending': 'Finish is unavailable while changes are still saving.',
  'workout.finish_blocked_failed': 'Finish is unavailable because a change could not be saved. Retry it first.',
  'workout.finish_blocked_recovery': 'Finish is unavailable until workout recovery is verified.',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

const activeStructure = { ok: true, terminal: false, version: 0, structure: [{ exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null }] };

beforeEach(() => {
  harness.loadLivePrMap.mockResolvedValue({});
  harness.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  harness.loadLiveStructure.mockResolvedValue(activeStructure);
  harness.persistPendingLiveSet.mockReturnValue(true);
  harness.removePendingLiveSet.mockReturnValue(true);
  harness.clearPendingLiveSets.mockReturnValue(true);
  harness.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); workspace = { state: liveState, liveReconciliation: null, pause: vi.fn(), resume: vi.fn(), ...harness }; });

describe('LiveWorkout reconciles recovery with server truth', () => {
  it('reconciles a live session to completed when the server row is terminal and clears queued sets', async () => {
    harness.loadLiveStructure.mockResolvedValue({ ok: true, terminal: true, completedAt: '2026-09-03T10:00:00.000Z', durationMinutes: 40 });
    render(<LiveWorkout exercises={[]} />);
    await vi.waitFor(() => expect(harness.reconcileLive).toHaveBeenCalledWith({ outcome: 'completed', durationMinutes: 40 }));
    expect(harness.clearPendingLiveSets).toHaveBeenCalledWith('session-1');
    expect(harness.replayPendingLiveSets).not.toHaveBeenCalled();
    expect(harness.commitLiveStrengthStructure).not.toHaveBeenCalled();
  });

  it('reconciles a paused session whose server row is missing back home', async () => {
    workspace = { ...workspace, state: { ...liveState, stage: 'paused', clock: { runningSince: null, accumulatedMs: 30_000 } } };
    harness.loadLivePainFlags.mockResolvedValue({ ok: false });
    harness.loadLiveStructure.mockResolvedValue({ ok: false, reason: 'missing' });
    render(<LiveWorkout exercises={[]} />);
    await vi.waitFor(() => expect(harness.reconcileLive).toHaveBeenCalledWith({ outcome: 'missing' }));
    expect(harness.clearPendingLiveSets).toHaveBeenCalledWith('session-1');
    expect(screen.queryByText('Workout recovery could not be verified.')).toBeNull();
  });

  it('keeps a transport failure as retryable recovery without reconciling', async () => {
    harness.loadLiveStructure.mockResolvedValue({ ok: false, reason: 'transport' });
    render(<LiveWorkout exercises={[]} />);
    expect((await screen.findByRole('alert')).textContent).toContain('recovery could not be verified');
    expect(harness.reconcileLive).not.toHaveBeenCalled();
    expect(harness.clearPendingLiveSets).not.toHaveBeenCalled();
  });

  it('shows the terminal summary with its origin after reconciliation', async () => {
    workspace = { ...workspace, liveReconciliation: { outcome: 'completed' }, state: { ...liveState, stage: 'completed', clock: { runningSince: null, accumulatedMs: 40 * 60_000 } } };
    harness.loadLiveStructure.mockResolvedValue({ ok: true, terminal: true, completedAt: '2026-09-03T10:00:00.000Z', durationMinutes: 40 });
    harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [{ id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: true, superset_group: null, notes: null }] });
    render(<LiveWorkout exercises={[]} />);
    expect(await screen.findByRole('heading', { name: 'Workout complete' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('completed on another device');
    expect(document.body.textContent).toContain('40 min');
    expect(harness.reconcileLive).not.toHaveBeenCalled();
  });

  it('explains why Finish is disabled while a write is pending', async () => {
    let resolveWrite!: (value: { ok: true; setId: string }) => void;
    harness.completeLiveSet.mockReturnValueOnce(new Promise((resolve) => { resolveWrite = resolve; }));
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Bench Press' }));
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain('changes are still saving');
    resolveWrite({ ok: true, setId: 'set-1' });
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('carries the blocked reason and retry into the finish dialog for a finishing session with a failed write', async () => {
    workspace = { ...workspace, state: { ...liveState, stage: 'finishing', finishingFrom: 'live', clock: { runningSince: null, accumulatedMs: 60_000 } } };
    harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [{ id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null }] });
    harness.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [{ sessionId: 'session-1', exerciseId: 'bench', setNumber: 2, weightKg: 60, reps: 8 }] });
    render(<LiveWorkout exercises={[]} />);
    const dialog = await screen.findByRole('dialog', { name: 'Finish workout?' });
    await vi.waitFor(() => expect(dialog.querySelector('[role="status"]')?.textContent).toContain('could not be saved'));
    expect(screen.getByRole('button', { name: 'Save and finish' }).hasAttribute('disabled')).toBe(true);
    harness.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [] });
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[role="status"] button')!);
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Save and finish' }).hasAttribute('disabled')).toBe(false));
  });
});
