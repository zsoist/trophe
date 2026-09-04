// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';
import type { Exercise } from '@/lib/types';

/**
 * House rule: exercise names stay English for Greek users; Spanish users see name_es.
 * The live session must render through the same resolver as Build/Review so an ES
 * user never sees "Press en el suelo" in Review and "Floor Press" in Live.
 */
const locale = vi.hoisted(() => ({ lang: 'es' }));

const harness = vi.hoisted(() => ({
  requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(),
  acknowledgeCompleted: vi.fn(), updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn(),
  finishLiveSession: vi.fn(), loadLiveSessionSets: vi.fn(), completeLiveSet: vi.fn(),
  loadLivePrMap: vi.fn(), loadLivePainFlags: vi.fn(), appendLivePainFlag: vi.fn(), loadLiveStructure: vi.fn(),
  updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
  persistPendingLiveSet: vi.fn(), removePendingLiveSet: vi.fn(), replayPendingLiveSets: vi.fn(),
}));

const liveState: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-1', clock: { runningSince: Date.now(), accumulatedMs: 0 },
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  // Draft storage keeps the canonical English name.
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [
    { exerciseId: 'floor-press', exerciseName: 'Floor Press', targetSets: 1, targetReps: '8' },
    { exerciseId: 'row', exerciseName: 'Barbell Row', targetSets: 1, targetReps: '8' },
  ] },
};
const workspace = { state: liveState, pause: vi.fn(), resume: vi.fn(), ...harness };

vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => <div role="status">info</div> }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: ({ exerciseName }: { exerciseName: string }) => <div data-testid="pain-modal-name">{exerciseName}</div> }));
vi.mock('framer-motion', () => ({ AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>, motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => { void _initial; void _animate; void _exit; void _transition; return <div {...props}>{children}</div>; } }, useReducedMotion: () => true }));
vi.mock('@/components/workout/workspace/ExerciseSetLogger', () => ({
  ExerciseSetLogger: ({ exercise, onRemove, onPain }: { exercise: { name: string }; onRemove?: () => void; onPain?: () => void }) => (
    <div>
      <h3 data-testid="set-logger-name">{exercise.name}</h3>
      <button type="button" onClick={onRemove}>Remove {exercise.name}</button>
      <button type="button" onClick={onPain}>Pain {exercise.name}</button>
    </div>
  ),
}));
vi.mock('@/lib/workout/live-session', () => ({
  finishLiveSession: harness.finishLiveSession, loadLiveSessionSets: harness.loadLiveSessionSets,
  completeLiveSet: harness.completeLiveSet, uncompleteLiveSet: vi.fn(),
  loadLivePrMap: harness.loadLivePrMap, loadLivePainFlags: harness.loadLivePainFlags,
  recoverLiveExtraRows: vi.fn(() => []),
  appendLivePainFlag: harness.appendLivePainFlag, loadLiveStructure: harness.loadLiveStructure,
  updateLiveStructure: harness.updateLiveStructure, removeAndNormalizeLiveExercises: harness.removeAndNormalizeLiveExercises,
  persistPendingLiveSet: harness.persistPendingLiveSet, removePendingLiveSet: harness.removePendingLiveSet,
  replayPendingLiveSets: harness.replayPendingLiveSets,
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({
  lang: locale.lang,
  t: (key: string, params?: Record<string, unknown>) => ({
    'workout.up_next_named': `Up next: ${String(params?.name ?? '')}`,
    'workout.remove_named': `Remove ${String(params?.name ?? '')}`,
    'workout.finish_completed_sets': `${String(params?.n ?? 0)} completed sets`,
    'workout.remove_exercise': 'Remove exercise', 'workout.cancel': 'Cancel',
    'workout.finish': 'Finish workout', 'workout.min': 'min',
  }[key] ?? key),
}) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

const floorPress: Exercise = {
  id: 'floor-press', name: 'Floor Press', name_es: 'Press en el suelo', name_el: 'Πιέσεις από το πάτωμα',
  muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '',
};
const row: Exercise = {
  id: 'row', name: 'Barbell Row', name_es: 'Remo con barra', name_el: 'Κωπηλατική με μπάρα',
  muscle_group: 'back', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '',
};

beforeEach(() => {
  harness.loadLivePrMap.mockResolvedValue({});
  harness.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  harness.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  harness.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [
    { exercise_id: 'floor-press', target_sets: 1, target_reps: '8', superset_group: null },
    { exercise_id: 'row', target_sets: 1, target_reps: '8', superset_group: null },
  ] });
  harness.replayPendingLiveSets.mockResolvedValue({ saved: [], failed: [] });
  harness.persistPendingLiveSet.mockReturnValue(true);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('live exercise names follow the shared locale resolver', () => {
  it('shows name_es on every live surface for a Spanish user while storage keeps the English name', async () => {
    locale.lang = 'es';
    render(<LiveWorkout exercises={[floorPress, row]} />);

    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.id).toBe('live-exercise-title');
    expect(title.textContent).toBe('Press en el suelo');
    expect(screen.getByText('Up next: Remo con barra')).toBeTruthy();
    expect(screen.getByTestId('set-logger-name').textContent).toBe('Press en el suelo');
    expect(screen.getByText('Remo con barra', { selector: '.live-session-path__name' })).toBeTruthy();
    expect(screen.getByText('Press en el suelo', { selector: '.live-session-path__name' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Remove Press en el suelo' }));
    expect(screen.getByRole('alertdialog', { name: 'Remove Press en el suelo' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    fireEvent.click(screen.getByRole('button', { name: 'Pain Press en el suelo' }));
    expect(screen.getByTestId('pain-modal-name').textContent).toBe('Press en el suelo');

    expect(liveState.draft?.kind === 'strength' && liveState.draft.exercises[0].exerciseName).toBe('Floor Press');
  });

  it('keeps English names for a Greek user even though name_el is seeded', async () => {
    locale.lang = 'el';
    render(<LiveWorkout exercises={[floorPress, row]} />);

    const title = await screen.findByRole('heading', { level: 1 });
    expect(title.textContent).toBe('Floor Press');
    expect(screen.getByText('Up next: Barbell Row')).toBeTruthy();
    expect(screen.getByTestId('set-logger-name').textContent).toBe('Floor Press');
    expect(screen.queryByText(/Πιέσεις/)).toBeNull();
  });
});
