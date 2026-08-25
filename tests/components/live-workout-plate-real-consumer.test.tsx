// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const api = vi.hoisted(() => ({
  saveLiveWorkoutSetAtomic: vi.fn(), deleteLiveWorkoutSetAtomic: vi.fn(), loadWorkoutSessionSets: vi.fn(), loadWorkoutSessionPainFlags: vi.fn(), loadPrMap: vi.fn(), loadWorkoutSessionStructure: vi.fn(),
}));

const state: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-real', clock: { runningSince: Date.now(), accumulatedMs: 0 }, clientRequestId: '11111111-1111-4111-8111-111111111111',
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] },
};
const workspace = { state, pause: vi.fn(), resume: vi.fn(), requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(), updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn() };
const bench = { id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest' as const, secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' };

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => { void _initial; void _animate; void _exit; void _transition; return <div {...props}>{children}</div>; } },
  useReducedMotion: () => true,
}));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/lib/workout/units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/units')>();
  return { ...actual, useWeightUnit: () => ['lb', vi.fn()] };
});
vi.mock('@/components/workout/workout-persistence', () => ({
  deleteEmptyWorkoutSession: vi.fn(), deleteWorkoutSet: vi.fn(), deleteLiveWorkoutSetAtomic: api.deleteLiveWorkoutSetAtomic, appendWorkoutSessionPainFlag: vi.fn(), finishLiveWorkoutSessionAtomic: vi.fn(),
  loadWorkoutSessionSets: api.loadWorkoutSessionSets, loadWorkoutSessionStructure: api.loadWorkoutSessionStructure, resumeLegacyLiveWorkoutStructureAtomic: vi.fn(),
  loadPrMap: api.loadPrMap, loadWorkoutSessionPainFlags: api.loadWorkoutSessionPainFlags, saveRetrospectiveWorkoutAtomic: vi.fn(),
  saveLiveWorkoutSetAtomic: api.saveLiveWorkoutSetAtomic, startWorkoutSessionAtomic: vi.fn(), updateLiveWorkoutStructureAtomic: vi.fn(), updateWorkoutSupersetGroups: vi.fn(), deleteWorkoutSets: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: { n?: number; unit?: string }) => ({
  'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.add_set': 'Add set', 'workout.finish': 'Finish workout', 'workout.saving': 'Saving…',
  'workout.loading_live_session': 'Loading', 'workout.no_live_session': 'No session', 'workout.weight_in_unit': `Weight in ${values?.unit ?? 'kg'}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional', 'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set', 'workout.warmup': 'Warm-up', 'workout.resting': 'Resting', 'workout.set_number': `Set ${values?.n ?? 1}`, 'workout.more': 'More', 'workout.more_exercise_options': 'More exercise options', 'workout.info_technique': 'Technique', 'workout.report_pain': 'Report pain', 'workout.plate_title': 'Plate calculator', 'workout.superset_link': 'Superset', 'workout.remove_exercise': 'Remove',
  'workout.plate_total_label': 'Total weight', 'workout.plate_bar_label': 'Bar weight', 'workout.plate_inventory_label': 'Available plates per side', 'workout.plate_inventory_help': 'Use semicolons.', 'workout.plate_left_side': 'Left side', 'workout.plate_right_side': 'Right side', 'workout.plate_per_side': 'Per side', 'workout.plate_exact': 'Exact load', 'workout.plate_nearest': 'Nearest achievable load', 'workout.plate_impossible': 'No achievable load', 'workout.warmup_title': 'Warm-up ramp', 'workout.warmup_explanation': 'Suggestions.', 'workout.warmup_no_ramp': 'No ramp', 'workout.add_warmup_sets': 'Add warm-up sets', 'workout.add_warmup_sets_saving': 'Adding warm-up sets…', 'workout.add_warmup_sets_failed': 'Warm-up sets could not be added. Retry.', 'workout.custom_cancel': 'Close',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

function persisted(setNumber: number, isWarmup: boolean, id = `${isWarmup ? 'warmup' : 'work'}-${setNumber}`) {
  return { id, session_id: 'session-real', exercise_id: 'bench', set_number: setNumber, weight_kg: isWarmup ? [40.82, 58.97, 79.38][setNumber - 1] ?? 0 : 99.79, reps: isWarmup ? [10, 6, 3][setNumber - 1] ?? 0 : 8, rpe: null, is_warmup: isWarmup, is_pr: false, superset_group: null, notes: null };
}

async function openCalculatorForRow(index = 0) {
  fireEvent.click((await screen.findAllByRole('button', { name: 'More exercise options' }))[index]);
  fireEvent.click(screen.getByRole('button', { name: 'Plate calculator' }));
}

beforeEach(() => {
  api.saveLiveWorkoutSetAtomic.mockReset(); api.deleteLiveWorkoutSetAtomic.mockReset(); api.loadWorkoutSessionSets.mockReset(); api.loadWorkoutSessionPainFlags.mockReset(); api.loadPrMap.mockReset(); api.loadWorkoutSessionStructure.mockReset();
  api.loadWorkoutSessionSets.mockResolvedValue({ ok: true, sets: [] });
  api.loadWorkoutSessionPainFlags.mockResolvedValue({ ok: true, flags: [] });
  api.loadPrMap.mockResolvedValue({});
  api.loadWorkoutSessionStructure.mockResolvedValue({ ok: true, version: 0, structure: [{ exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null }] });
  api.saveLiveWorkoutSetAtomic.mockImplementation(async (input: { setNumber: number }) => `set-${input.setNumber}`);
  api.deleteLiveWorkoutSetAtomic.mockResolvedValue(true);
  if (state.draft?.kind === 'strength') state.draft.exercises[0].targetSets = 1;
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LiveWorkout warm-up real consumer', () => {
  it('persists the real lb calculator ramp as exact kilogram payloads', async () => {
    render(<LiveWorkout exercises={[bench]} />);
    fireEvent.change(await screen.findByLabelText('Weight in lb'), { target: { value: '220' } });
    await openCalculatorForRow();
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(3));
    expect(api.saveLiveWorkoutSetAtomic.mock.calls.map(([input]) => ({ setNumber: input.setNumber, weightKg: input.weightKg, reps: input.reps, isWarmup: input.isWarmup }))).toEqual([
      { setNumber: 1, weightKg: 40.82, reps: 10, isWarmup: true }, { setNumber: 2, weightKg: 58.97, reps: 6, isWarmup: true }, { setNumber: 3, weightKg: 79.38, reps: 3, isWarmup: true },
    ]);
  });

  it('refuses a warm-up insertion after a completed non-warmup working set', async () => {
    render(<LiveWorkout exercises={[bench]} />);
    fireEvent.change(await screen.findByLabelText('Weight in lb'), { target: { value: '220' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    await vi.waitFor(() => expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(1));
    // The transport invocation precedes the component's mutation-barrier
    // release; wait for the accepted-set UI before opening another control.
    await screen.findByRole('button', { name: 'Undo set' });
    await openCalculatorForRow();
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Warm-up sets could not be added. Retry.');
    expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(1);
  });

  it('allocates fresh logical set numbers for a second successful intentional ramp', async () => {
    render(<LiveWorkout exercises={[bench]} />);
    fireEvent.change(await screen.findByLabelText('Weight in lb'), { target: { value: '220' } });
    await openCalculatorForRow();
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(3));
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(6));
    expect(api.saveLiveWorkoutSetAtomic.mock.calls.map(([input]) => input.setNumber)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('keeps typed planned and extra working values on their stable rows after prefix insertion', async () => {
    render(<LiveWorkout exercises={[bench]} />);
    const initialWeights = await screen.findAllByLabelText('Weight in lb');
    fireEvent.change(initialWeights[0], { target: { value: '220' } });
    fireEvent.change(screen.getAllByLabelText('Reps')[0], { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
    const weightsWithExtra = screen.getAllByLabelText('Weight in lb');
    fireEvent.change(weightsWithExtra[1], { target: { value: '150' } });
    fireEvent.change(screen.getAllByLabelText('Reps')[1], { target: { value: '6' } });
    await openCalculatorForRow();
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    expect(screen.getAllByLabelText('Weight in lb').slice(-2).map((input) => (input as HTMLInputElement).value)).toEqual(['220', '150']);
    expect(screen.getAllByLabelText('Reps').slice(-2).map((input) => (input as HTMLInputElement).value)).toEqual(['8', '6']);
    expect(screen.getAllByText(/Set [1-5]/).map((item) => item.textContent)).toEqual(['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5']);
  });

  it('materializes a manually completed warm-up without lending its database identity to shifted work rows', async () => {
    if (state.draft?.kind !== 'strength') throw new Error('strength fixture required');
    state.draft.exercises[0].targetSets = 2;
    api.loadWorkoutSessionStructure.mockResolvedValue({ ok: true, version: 0, structure: [{ exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null }] });

    const first = render(<LiveWorkout exercises={[bench]} />);
    fireEvent.change((await screen.findAllByLabelText('Weight in lb'))[0], { target: { value: '100' } });
    fireEvent.change(screen.getAllByLabelText('Reps')[0], { target: { value: '10' } });
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Warm-up' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Complete set' })[0]);

    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(screen.getAllByRole('button', { name: 'Undo set' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Complete set' })).toHaveLength(2);
    expect((screen.getAllByLabelText('Weight in lb')[1] as HTMLInputElement).value).toBe('');
    expect((screen.getAllByLabelText('Reps')[1] as HTMLInputElement).value).toBe('');

    fireEvent.change(screen.getAllByLabelText('Weight in lb')[1], { target: { value: '120' } });
    fireEvent.change(screen.getAllByLabelText('Reps')[1], { target: { value: '8' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Complete set' })[0]);
    await vi.waitFor(() => expect(api.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(2));
    expect(api.saveLiveWorkoutSetAtomic.mock.calls.map(([input]) => ({ setNumber: input.setNumber, isWarmup: input.isWarmup }))).toEqual([
      { setNumber: 1, isWarmup: true },
      { setNumber: 2, isWarmup: false },
    ]);
    await vi.waitFor(() => expect(screen.getAllByRole('button', { name: 'Undo set' })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo set' })[1]);
    await vi.waitFor(() => expect(api.deleteLiveWorkoutSetAtomic).toHaveBeenCalledWith('session-real', 'set-2'));

    first.unmount();
    api.loadWorkoutSessionSets.mockResolvedValueOnce({ ok: true, sets: [persisted(1, true, 'warmup-1'), persisted(2, false, 'work-2')] });
    render(<LiveWorkout exercises={[bench]} />);
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(3));
    expect(screen.getAllByRole('button', { name: 'Undo set' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Complete set' })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Finish workout' }).hasAttribute('disabled')).toBe(false);
  });

  it('uses real recovery to show only warm-ups one through three and work four', async () => {
    api.loadWorkoutSessionSets.mockResolvedValueOnce({ ok: true, sets: [persisted(1, true), persisted(2, true), persisted(3, true), persisted(4, false)] });
    render(<LiveWorkout exercises={[bench]} />);
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    expect(screen.getAllByText(/Set [1-4]/).map((item) => item.textContent)).toEqual(['Set 1', 'Set 2', 'Set 3', 'Set 4']);
  });

  it('uses real recovery to retain genuine extra set five after the warm-up-prefixed work', async () => {
    api.loadWorkoutSessionSets.mockResolvedValueOnce({ ok: true, sets: [persisted(1, true), persisted(2, true), persisted(3, true), persisted(4, false), persisted(5, false, 'extra-5')] });
    render(<LiveWorkout exercises={[bench]} />);
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(5));
    expect(screen.getAllByText(/Set [1-5]/).map((item) => item.textContent)).toEqual(['Set 1', 'Set 2', 'Set 3', 'Set 4', 'Set 5']);
  });
});
