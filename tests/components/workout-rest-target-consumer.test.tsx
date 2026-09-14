// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const api = vi.hoisted(() => ({
  loadLiveSessionSets: vi.fn(), loadLivePainFlags: vi.fn(), loadLivePrMap: vi.fn(),
  loadLiveStructure: vi.fn(), replayPendingLiveSets: vi.fn(), persistPendingLiveSet: vi.fn(),
  removePendingLiveSet: vi.fn(), completeLiveSetDetailed: vi.fn(), appendLivePainFlag: vi.fn(),
  recoverLiveExtraRows: vi.fn(), updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
}));

const state: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-rest', clock: { runningSince: Date.now(), accumulatedMs: 0 }, clientRequestId: null,
  draft: {
    version: 2, kind: 'strength', name: 'Upper', updatedAt: 1,
    exercises: [
      { exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' },
      { exerciseId: 'row', exerciseName: 'Dumbbell Row', targetSets: 1, targetReps: '10' },
    ],
  },
};
let workspace = { state, pause: vi.fn(), resume: vi.fn(), requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(), updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn() };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/components/workout/PlateCalculator', () => ({ default: () => null }));
vi.mock('@/components/workout/ExerciseMotion', () => ({ ExerciseMotion: () => null }));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/workout/live-session', () => ({
  clearPendingLiveSets: vi.fn(), loadLiveSessionSets: api.loadLiveSessionSets, loadLivePainFlags: api.loadLivePainFlags,
  loadLivePrMap: api.loadLivePrMap, loadLiveStructure: api.loadLiveStructure, replayPendingLiveSets: api.replayPendingLiveSets,
  persistPendingLiveSet: api.persistPendingLiveSet, removePendingLiveSet: api.removePendingLiveSet,
  completeLiveSet: api.completeLiveSetDetailed, completeLiveSetDetailed: api.completeLiveSetDetailed,
  appendLivePainFlag: api.appendLivePainFlag, recoverLiveExtraRows: api.recoverLiveExtraRows,
  updateLiveStructure: api.updateLiveStructure, removeAndNormalizeLiveExercises: api.removeAndNormalizeLiveExercises,
  finishLiveSession: vi.fn(), uncompleteLiveSet: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: Record<string, unknown>) => ({
      'workout.loading_live_session': 'Loading live workout', 'workout.complete_set': 'Complete set',
      'workout.undo_set': 'Undo set', 'workout.saving': 'Saving…', 'workout.warmup': 'Warm-up',
      'workout.weight_in_unit': `Weight in ${values?.unit}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
      'workout.set_number': `Set ${values?.n}`, 'workout.more': 'More', 'workout.more_exercise_options': 'More exercise options',
      'workout.info_technique': 'Technique', 'workout.report_pain': 'Report pain', 'workout.plate_title': 'Plate calculator',
      'workout.superset_link': 'Superset', 'workout.remove_exercise': 'Remove exercise', 'workout.add_set': 'Add set',
      'workout.resting': 'Resting', 'workout.rest_timer_label': 'Rest timer', 'workout.rest_complete': 'Rest complete',
      'workout.rest_started': `Rest started, ${values?.n}s target`, 'workout.rest_target': 'Rest target',
      'workout.rest_seconds_named': `Rest seconds for ${values?.name}`, 'workout.save_failed': 'Workout not saved',
    }[key] ?? key),
  }),
}));

import { ExerciseSetLogger } from '@/components/workout/workspace/ExerciseSetLogger';
import { useRestTarget } from '@/components/workout/workspace/useRestTarget';
import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

const STORAGE_KEY = 'trophe_rest_targets';
const bench = { id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' } as import('@/lib/types').Exercise;
const row = { ...bench, id: 'row', name: 'Dumbbell Row', muscle_group: 'back' as const, equipment: 'dumbbell', is_compound: false };

const readStorage = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked') === 'true';
const flushMicrotasks = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** Real ExerciseSetLogger wired to the real canonical rest-target hook (no storage mock). */
function RestLogger({ exerciseId, isCompound, name }: { exerciseId: string; isCompound: boolean; name: string }) {
  const rest = useRestTarget(exerciseId, isCompound);
  return (
    <ExerciseSetLogger
      exercise={{ id: exerciseId, name }}
      setNumber={1}
      unit="kg"
      restTargetSeconds={rest.seconds}
      onRestTargetChange={rest.choose}
      restTargetStorageFailed={rest.failed}
      onComplete={vi.fn().mockResolvedValue('set-1')}
    />
  );
}

/** Same wiring, but with a plan prescription that differs from the compound/isolation default. */
function RestLoggerWithPlan({ exerciseId, isCompound, name, planSeconds }: { exerciseId: string; isCompound: boolean; name: string; planSeconds: number }) {
  const rest = useRestTarget(exerciseId, isCompound, planSeconds);
  return (
    <ExerciseSetLogger
      exercise={{ id: exerciseId, name }}
      setNumber={1}
      unit="kg"
      restTargetSeconds={rest.seconds}
      onRestTargetChange={rest.choose}
      restTargetStorageFailed={rest.failed}
      onComplete={vi.fn().mockResolvedValue('set-1')}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  workspace = { state, pause: vi.fn(), resume: vi.fn(), requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(), updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn() };
  api.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  api.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  api.loadLivePrMap.mockResolvedValue({});
  api.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [
    { exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null },
    { exercise_id: 'row', target_sets: 1, target_reps: '10', superset_group: null },
  ] });
  api.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [] });
  api.persistPendingLiveSet.mockReturnValue(true);
  api.completeLiveSetDetailed.mockResolvedValue({ ok: true, setId: 'set-1' });
  api.recoverLiveExtraRows.mockReturnValue([]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('per-exercise rest target consumer wiring', () => {
  it('keeps a compound override equal to the default above a differing plan prescription across a remount', () => {
    // Compound default 150, plan 90. Choosing 150 must persist, not be read back
    // as "no override" (which would fall to the plan's 90) after remount.
    const first = render(<RestLoggerWithPlan exerciseId="bench" isCompound name="Bench Press" planSeconds={90} />);
    expect(checked('90s')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '150s' }));
    expect(checked('150s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 150 });
    first.unmount();

    render(<RestLoggerWithPlan exerciseId="bench" isCompound name="Bench Press" planSeconds={90} />);
    expect(checked('150s')).toBe(true);
  });

  it('keeps an isolation override equal to its default above a differing plan prescription across a remount', () => {
    // Isolation default 90, plan 120. Choosing 90 must persist above the plan.
    const first = render(<RestLoggerWithPlan exerciseId="row" isCompound={false} name="Dumbbell Row" planSeconds={120} />);
    expect(checked('120s')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '90s' }));
    expect(checked('90s')).toBe(true);
    expect(readStorage()).toEqual({ row: 90 });
    first.unmount();

    render(<RestLoggerWithPlan exerciseId="row" isCompound={false} name="Dumbbell Row" planSeconds={120} />);
    expect(checked('90s')).toBe(true);
  });

  it('uses the plan prescription when no override exists', () => {
    render(<RestLoggerWithPlan exerciseId="bench" isCompound name="Bench Press" planSeconds={90} />);
    expect(checked('90s')).toBe(true);
    expect(checked('150s')).toBe(false);
    expect(readStorage()).toEqual({});
  });

  it('keeps the radiogroup keyboard-reachable when the plan value is not a preset choice', () => {
    // 100s is a valid plan prescription but not one of REST_CHOICES. The
    // radiogroup must still expose exactly one tabbable radio.
    render(<RestLoggerWithPlan exerciseId="bench" isCompound name="Bench Press" planSeconds={100} />);
    const radios = screen.getAllByRole('radio') as HTMLButtonElement[];
    expect(radios.filter((radio) => radio.tabIndex === 0)).toHaveLength(1);
  });

  it('applies a mid-rest choice to the counted target without restarting elapsed time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    render(<RestLogger exerciseId="bench" isCompound name="Bench Press" />);
    expect(checked('150s')).toBe(true);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete set' })); });
    await flushMicrotasks();
    expect(screen.getByRole('timer').textContent).toMatch(/0s \/ 150s/);

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('timer').textContent).toMatch(/30s \/ 150s/);

    fireEvent.click(screen.getByRole('radio', { name: '60s' }));
    // Elapsed is preserved (not restarted from 0) while the target changes live.
    expect(screen.getByRole('timer').textContent).toMatch(/30s \/ 60s/);
    expect(checked('60s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 60 });
  });

  it('isolates the override per exercise and re-reads it after a remount', () => {
    const first = render(<RestLogger exerciseId="bench" isCompound name="Bench Press" />);
    expect(checked('150s')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '60s' }));
    expect(readStorage()).toEqual({ bench: 60 });
    first.unmount();

    // A different exercise keeps its own default and is not changed by bench's override.
    const second = render(<RestLogger exerciseId="row" isCompound={false} name="Dumbbell Row" />);
    expect(checked('90s')).toBe(true);
    expect(checked('60s')).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: '120s' }));
    second.unmount();

    // Remount re-reads the persisted override for each exercise independently.
    render(<RestLogger exerciseId="bench" isCompound name="Bench Press" />);
    expect(checked('60s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 60, row: 120 });
  });

  it('does not claim a durable save when storage rejects the write', () => {
    const real = window.localStorage;
    const throwing = {
      getItem: (key: string) => real.getItem(key),
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: (key: string) => real.removeItem(key),
      clear: () => real.clear(),
      key: () => null,
      length: 0,
    } as unknown as Storage;
    Object.defineProperty(window, 'localStorage', { value: throwing, configurable: true, writable: true });
    try {
      render(<RestLogger exerciseId="bench" isCompound name="Bench Press" />);
      fireEvent.click(screen.getByRole('radio', { name: '60s' }));

      expect(checked('150s')).toBe(true);
      expect(checked('60s')).toBe(false);
      expect(screen.getByText('Workout not saved')).toBeTruthy();
      expect(real.getItem(STORAGE_KEY)).toBeNull();
    } finally {
      Object.defineProperty(window, 'localStorage', { value: real, configurable: true, writable: true });
    }
  });

  it('changes the target of a paused session without starting or advancing the clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T12:00:00.000Z'));
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" paused restTargetSeconds={150} onRestTargetChange={vi.fn()} onComplete={vi.fn().mockResolvedValue('set-1')} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Complete set' })); });
    await flushMicrotasks();
    expect(screen.getByRole('timer').textContent).toMatch(/0s \/ 150s/);

    act(() => { vi.advanceTimersByTime(30_000); });
    // Paused: the countdown stays frozen at zero regardless of wall-clock time.
    expect(screen.getByRole('timer').textContent).toMatch(/0s \/ 150s/);
  });

  it('persists a per-exercise override from the real LiveWorkout flow and re-reads it on remount', async () => {
    const first = render(<LiveWorkout exercises={[bench, row]} />);
    expect(await screen.findByRole('radio', { name: '150s' })).toBeTruthy();
    expect(checked('150s')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '60s' }));
    expect(readStorage()).toEqual({ bench: 60 });

    fireEvent.click(await screen.findByRole('button', { name: 'Complete set' }));
    expect(await screen.findByText(/\/ 60s/)).toBeTruthy();
    first.unmount();

    render(<LiveWorkout exercises={[bench, row]} />);
    expect(await screen.findByRole('radio', { name: '60s' })).toBeTruthy();
    expect(checked('60s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 60 });
  });
});
