// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const live = vi.hoisted(() => ({ saveRetrospectiveWorkout: vi.fn(), loadLivePrMap: vi.fn() }));
const units = vi.hoisted(() => ({ value: 'kg' as 'kg' | 'lb' }));
vi.mock('@/lib/workout/live-session', () => live);
vi.mock('@/lib/workout/units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/units')>();
  return { ...actual, useWeightUnit: () => [units.value, vi.fn()] };
});
vi.mock('@/components/workout/PainFlagModal', () => ({ default: () => null }));
vi.mock('@/components/workout/ExerciseInfoSheet', () => ({ default: () => null }));
vi.mock('framer-motion', () => ({ motion: { div: ({ children, initial: _initial, animate: _animate, exit: _exit, transition: _transition, ...props }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) => {
  void _initial; void _animate; void _exit; void _transition;
  return <div {...props}>{children}</div>;
} }, useReducedMotion: () => true }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, values?: { n?: number; unit?: string }) => ({
  'workout.cardio_run': 'Run', 'workout.duration_minutes': 'Duration in minutes', 'workout.distance_optional': 'Distance optional',
  'workout.effort': 'Effort', 'workout.log_completed': 'Log completed workout',
  'workout.save_completed_question': 'Save completed workout?', 'workout.save_workout': 'Save workout',
  'workout.keep_editing': 'Keep editing', 'workout.saving': 'Saving…', 'workout.save_completed': 'Save completed workout',
  'workout.cancel': 'Cancel', 'workout.save_failed': 'Save failed', 'workout.strength_duration': 'Workout duration in minutes',
  'workout.weight_in_unit': `Weight in ${values?.unit ?? 'kg'}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
  'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set', 'workout.more_exercise_options': 'More exercise options',
  'workout.more': 'More', 'workout.warmup': 'Warm-up', 'workout.resting': 'Resting',
  'workout.set_number': `Set ${String(values?.n ?? 1)}`,
}[key] ?? key) }) }));

import { RetrospectiveWorkoutLogger } from '@/components/workout/workspace/RetrospectiveWorkoutLogger';

const cardio: WorkoutDraft = { version: 2, kind: 'cardio', name: 'Morning run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 7 };
const strength: WorkoutDraft = { version: 2, kind: 'strength', name: 'Push', updatedAt: 1, exercises: [{ exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' }] };
const strengthSuperset: WorkoutDraft = { version: 2, kind: 'strength', name: 'Upper', updatedAt: 1, exercises: [
  { exerciseId: 'bench', exerciseName: 'Bench Press', targetSets: 1, targetReps: '8' },
  { exerciseId: 'row', exerciseName: 'Row', targetSets: 1, targetReps: '8' },
] };
const bench = { id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest' as const, secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' };
const row = { ...bench, id: 'row', name: 'Row', muscle_group: 'back' as const };
const idempotencyKey = '11111111-1111-4111-8111-111111111111';

beforeEach(() => { units.value = 'kg'; live.loadLivePrMap.mockResolvedValue({ bench: 50 }); live.saveRetrospectiveWorkout.mockResolvedValue({ ok: true, sessionId: 'session-1' }); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('RetrospectiveWorkoutLogger', () => {
  it('does not create retrospective cardio until the final save confirmation', async () => {
    const onSaved = vi.fn();
    render(<RetrospectiveWorkoutLogger userId="nik" idempotencyKey={idempotencyKey} draft={cardio} exercises={[]} onSaved={onSaved} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    expect(screen.getByRole('dialog', { name: 'Save completed workout?' })).toBeTruthy();
    expect(live.saveRetrospectiveWorkout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }));
    await vi.waitFor(() => expect(live.saveRetrospectiveWorkout).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('collects strength sets locally and creates one durable session only after confirmation', async () => {
    render(<RetrospectiveWorkoutLogger userId="nik" idempotencyKey={idempotencyKey} draft={strength} exercises={[bench]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Weight in kg'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Save completed workout' }));
    expect(live.saveRetrospectiveWorkout).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }));
    await vi.waitFor(() => expect(live.saveRetrospectiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey,
      sets: [expect.objectContaining({ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, is_pr: true })],
    })));
  });

  it('preserves adjacent superset groups in confirmed retrospective strength sets', async () => {
    render(<RetrospectiveWorkoutLogger userId="nik" idempotencyKey={idempotencyKey} draft={strengthSuperset} exercises={[bench, row]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(await screen.findAllByLabelText('Weight in kg').then((inputs) => inputs[0]), { target: { value: '80' } });
    const moreButtons = await screen.findAllByRole('button', { name: 'More exercise options' });
    fireEvent.click(moreButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'workout.superset_link' }));

    const weights = screen.getAllByLabelText('Weight in kg');
    const reps = screen.getAllByLabelText('Reps');
    const complete = screen.getAllByRole('button', { name: 'Complete set' });
    for (let index = 0; index < 2; index++) {
      fireEvent.change(weights[index], { target: { value: String(60 - index * 10) } });
      fireEvent.change(reps[index], { target: { value: '8' } });
      fireEvent.click(complete[index]);
    }

    const confirm = await screen.findByRole('button', { name: 'Save completed workout' });
    fireEvent.click(confirm);
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }));
    await vi.waitFor(() => expect(live.saveRetrospectiveWorkout).toHaveBeenCalledWith(expect.objectContaining({
      sets: expect.arrayContaining([
        expect.objectContaining({ exercise_id: 'bench', superset_group: 1 }),
        expect.objectContaining({ exercise_id: 'row', superset_group: 1 }),
      ]),
    })));
  });

  it('saves an exact lb payload with two ramp blocks and the shifted working set', async () => {
    units.value = 'lb';
    live.loadLivePrMap.mockResolvedValue({ bench: 200 });
    render(<RetrospectiveWorkoutLogger userId="nik" idempotencyKey={idempotencyKey} draft={strength} exercises={[bench]} onSaved={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText('Weight in lb'), { target: { value: '220' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    await screen.findByRole('button', { name: 'Undo set' });
    fireEvent.click(screen.getByRole('button', { name: 'More exercise options' }));
    fireEvent.click(screen.getByRole('button', { name: 'workout.plate_title' }));
    fireEvent.click(screen.getByRole('button', { name: 'workout.add_warmup_sets' }));
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(4));
    fireEvent.click(await screen.findByRole('button', { name: 'workout.add_warmup_sets' }));
    await vi.waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(7));
    fireEvent.click(screen.getByRole('button', { name: 'Save completed workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save workout' }));

    await vi.waitFor(() => expect(live.saveRetrospectiveWorkout).toHaveBeenCalledWith({
      idempotencyKey,
      draft: strength,
      durationMinutes: 1,
      painFlags: [],
      sets: [
        { exercise_id: 'bench', set_number: 1, weight_kg: 40.82, reps: 10, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 2, weight_kg: 58.97, reps: 6, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 3, weight_kg: 79.38, reps: 3, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 4, weight_kg: 40.82, reps: 10, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 5, weight_kg: 58.97, reps: 6, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 6, weight_kg: 79.38, reps: 3, rpe: null, is_warmup: true, is_pr: false, superset_group: null },
        { exercise_id: 'bench', set_number: 7, weight_kg: 99.79, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null },
      ],
    }));
  });
});
