// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { WorkoutWorkspaceState } from '@/lib/workout/workspace-state';

const api = vi.hoisted(() => ({
  completeLiveSet: vi.fn(), loadLiveSessionSets: vi.fn(), loadLivePainFlags: vi.fn(), loadLivePrMap: vi.fn(), loadLiveStructure: vi.fn(),
}));
const state: WorkoutWorkspaceState = {
  stage: 'live', sessionId: 'session-real', clock: { runningSince: Date.now(), accumulatedMs: 0 }, clientRequestId: '11111111-1111-4111-8111-111111111111',
  draft: { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] },
};
const workspace = { state, pause: vi.fn(), resume: vi.fn(), requestFinish: vi.fn(), cancelFinish: vi.fn(), completeFinish: vi.fn(), discardLive: vi.fn(), updateLiveCardioDraft: vi.fn(), commitLiveStrengthStructure: vi.fn() };

vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => { void _initial; void _animate; void _exit; void _transition; return <div {...props}>{children}</div>; } }, useReducedMotion: () => true }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], displayToKg: (value: number) => value, kgToDisplay: (value: number) => value }));
vi.mock('@/lib/workout/live-session', () => ({
  completeLiveSet: api.completeLiveSet, loadLiveSessionSets: api.loadLiveSessionSets, loadLivePainFlags: api.loadLivePainFlags, loadLivePrMap: api.loadLivePrMap, loadLiveStructure: api.loadLiveStructure,
  finishLiveSession: vi.fn(), appendLivePainFlag: vi.fn(), uncompleteLiveSet: vi.fn(), recoverLiveExtraRows: vi.fn(() => []), updateLiveStructure: vi.fn(), removeAndNormalizeLiveExercises: vi.fn(),
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: { n?: number; unit?: string }) => ({
  'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.add_set': 'Add set', 'workout.finish': 'Finish workout', 'workout.saving': 'Saving…',
  'workout.loading_live_session': 'Loading', 'workout.no_live_session': 'No session', 'workout.weight_in_unit': `Weight in ${values?.unit ?? 'kg'}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional', 'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set', 'workout.warmup': 'Warm-up', 'workout.resting': 'Resting', 'workout.set_number': `Set ${values?.n ?? 1}`, 'workout.more': 'More', 'workout.more_exercise_options': 'More exercise options', 'workout.info_technique': 'Technique', 'workout.report_pain': 'Report pain', 'workout.plate_title': 'Plate calculator', 'workout.superset_link': 'Superset', 'workout.remove_exercise': 'Remove',
  'workout.plate_total_label': 'Total weight', 'workout.plate_bar_label': 'Bar weight', 'workout.plate_inventory_label': 'Available plates per side', 'workout.plate_inventory_help': 'Use semicolons.', 'workout.plate_left_side': 'Left side', 'workout.plate_right_side': 'Right side', 'workout.plate_per_side': 'Per side', 'workout.plate_exact': 'Exact load', 'workout.plate_nearest': 'Nearest achievable load', 'workout.plate_impossible': 'No achievable load', 'workout.warmup_title': 'Warm-up ramp', 'workout.warmup_explanation': 'Suggestions.', 'workout.warmup_no_ramp': 'No ramp', 'workout.add_warmup_sets': 'Add warm-up sets', 'workout.add_warmup_sets_saving': 'Adding warm-up sets…', 'workout.add_warmup_sets_failed': 'Warm-up sets could not be added. Retry.', 'workout.custom_cancel': 'Close',
}[key] ?? key) }) }));

import { LiveWorkout } from '@/components/workout/workspace/LiveWorkout';

beforeEach(() => {
  api.loadLiveSessionSets.mockResolvedValue({ ok: true, sets: [] });
  api.loadLivePainFlags.mockResolvedValue({ ok: true, flags: [] });
  api.loadLivePrMap.mockResolvedValue({});
  api.loadLiveStructure.mockResolvedValue({ ok: true, version: 0, structure: [{ exercise_id: 'bench', target_sets: 1, target_reps: '8', superset_group: null }] });
  api.completeLiveSet.mockImplementation(async (input: { setNumber: number }) => ({ ok: true, setId: `set-${input.setNumber}` }));
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it('runs the real logger and calculator controls to persist kilogram warm-up payloads', async () => {
  render(<LiveWorkout exercises={[{ id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' }]} />);
  fireEvent.change(await screen.findByLabelText('Weight in kg'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'More exercise options' }));
  fireEvent.click(screen.getByRole('button', { name: 'Plate calculator' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
  await vi.waitFor(() => expect(api.completeLiveSet).toHaveBeenCalledTimes(3));
  expect(api.completeLiveSet.mock.calls.map(([input]) => ({ setNumber: input.setNumber, weightKg: input.weightKg }))).toEqual([
    { setNumber: 1, weightKg: 40 }, { setNumber: 2, weightKg: 60 }, { setNumber: 3, weightKg: 80 },
  ]);
});
