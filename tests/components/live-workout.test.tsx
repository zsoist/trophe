// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const harness = vi.hoisted(() => ({
  requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(),
  finishLiveSession: vi.fn(), loadLiveSessionSets: vi.fn(),
  completeLiveSet: vi.fn(), loadLivePrMap: vi.fn(), loadLivePainFlags: vi.fn(),
  saveLivePainFlags: vi.fn(), updateLiveSupersets: vi.fn(), removeLiveExerciseSets: vi.fn(),
}));

const liveState: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-1', clock: { runningSince: Date.now(), accumulatedMs: 0 },
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] },
};
let workspace = { state: liveState, pause: vi.fn(), resume: vi.fn(), ...harness };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/components/workout/PlateCalculator', () => ({ default: () => null }));
vi.mock('@/components/workout/workspace/ExerciseSetLogger', () => ({
  ExerciseSetLogger: ({ exercise, onComplete }: { exercise: { name: string }; onComplete: (value: { weight: number; reps: number; rpe: number | null; isWarmup: boolean }) => Promise<string | null> }) => (
    <button type="button" onClick={() => void onComplete({ weight: 60, reps: 8, rpe: null, isWarmup: false })}>Complete {exercise.name}</button>
  ),
}));
vi.mock('@/lib/workout/live-session', () => ({
  finishLiveSession: harness.finishLiveSession,
  loadLiveSessionSets: harness.loadLiveSessionSets,
  completeLiveSet: harness.completeLiveSet, uncompleteLiveSet: vi.fn(),
  loadLivePrMap: harness.loadLivePrMap, loadLivePainFlags: harness.loadLivePainFlags,
  recoverLiveExtraRows: vi.fn(() => []),
  recoverLiveSupersetLinks: vi.fn(() => []),
  saveLivePainFlags: harness.saveLivePainFlags, updateLiveSupersets: harness.updateLiveSupersets,
  removeLiveExerciseSets: harness.removeLiveExerciseSets,
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.finish': 'Finish workout', 'workout.finish_question': 'Finish workout?',
  'workout.keep_training': 'Keep training', 'workout.save_and_finish': 'Save and finish',
  'workout.discard_empty': 'Discard empty workout', 'workout.finish_duration': 'Duration 1 min',
  'workout.finish_completed_sets': '0 completed sets', 'workout.finish_pending_sets': '1 pending sets',
  'workout.finish_pain_notes': '0 pain notes', 'workout.finish_prs': '0 PRs', 'workout.saving': 'Saving…',
  'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.add_set': 'Add set',
  'workout.save_failed': 'Save failed',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

beforeEach(() => {
  harness.loadLivePrMap.mockResolvedValue({});
  harness.loadLivePainFlags.mockResolvedValue([]);
  harness.saveLivePainFlags.mockResolvedValue(true);
  harness.updateLiveSupersets.mockResolvedValue(true);
  harness.removeLiveExerciseSets.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); workspace = { state: liveState, pause: vi.fn(), resume: vi.fn(), ...harness }; });

describe('LiveWorkout', () => {
  it('requires confirmation before finishing', () => {
    harness.loadLiveSessionSets.mockResolvedValue([]);
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
    expect(harness.finishLiveSession).not.toHaveBeenCalled();
    expect(harness.requestFinish).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', { name: 'Finish workout?' })).toBeTruthy();
  });

  it('returns to the provider clock mode when Keep training is chosen', () => {
    workspace = { ...workspace, state: { ...liveState, stage: 'finishing', finishingFrom: 'live', clock: { runningSince: null, accumulatedMs: 60_000 } } };
    harness.loadLiveSessionSets.mockResolvedValue([]);
    render(<LiveWorkout exercises={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Keep training' }));
    expect(harness.cancelFinish).toHaveBeenCalledTimes(1);
  });

  it('uses the pre-session kilogram baseline to persist compound PRs', async () => {
    harness.loadLiveSessionSets.mockResolvedValue([]);
    harness.loadLivePainFlags.mockResolvedValue([]);
    harness.loadLivePrMap.mockResolvedValue({ bench: 50 });
    harness.completeLiveSet.mockResolvedValue({ ok: true, setId: 'set-1' });
    render(<LiveWorkout userId="nik" exercises={[{
      id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null,
      equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '',
    }]} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Complete Bench Press' }));
    await vi.waitFor(() => expect(harness.completeLiveSet).toHaveBeenCalledWith(expect.objectContaining({ weightKg: 60, isPr: true })));
  });
});
