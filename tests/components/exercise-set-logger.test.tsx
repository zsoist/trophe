// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.weight_in_unit': 'Weight in kg', 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
  'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set', 'workout.saving': 'Saving…',
  'workout.more_exercise_options': 'More exercise options', 'workout.report_pain': 'Report pain',
  'workout.info_technique': 'Technique', 'workout.plate_title': 'Plate calculator',
  'workout.superset_link': 'Link with next exercise', 'workout.remove_exercise': 'Remove exercise',
  'workout.resting': 'Resting', 'workout.rest_target': 'Rest target',
}[key] ?? key) }) }));

import { ExerciseSetLogger } from '@/components/workout/workspace/ExerciseSetLogger';

afterEach(cleanup);

describe('ExerciseSetLogger', () => {
  it('uses explicit set labels and hides secondary tools under More', () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press', isCompound: true, equipment: 'barbell' }} setNumber={1} unit="kg" onComplete={vi.fn()} />);
    expect(screen.getByLabelText('Weight in kg')).toBeTruthy();
    expect(screen.getByLabelText('Reps')).toBeTruthy();
    expect(screen.getByLabelText('RPE optional')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Complete set' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More exercise options' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Report pain' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More exercise options' }));
    expect(screen.getByRole('button', { name: 'Report pain' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove exercise' })).toBeTruthy();
  });

  it('converts entered values into a labeled completion request and exposes saving/completed states', async () => {
    let resolve!: (value: string | null) => void;
    const onComplete = vi.fn(() => new Promise<string | null>((done) => { resolve = done; }));
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={2} unit="kg" onComplete={onComplete} />);
    fireEvent.change(screen.getByLabelText('Weight in kg'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('RPE optional'), { target: { value: '7.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(screen.getByRole('button', { name: 'Saving…' }).hasAttribute('disabled')).toBe(true);
    expect(onComplete).toHaveBeenCalledWith({ weight: 60, reps: 8, rpe: 7.5, isWarmup: false });
    resolve('set-2');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo set' })).toBeTruthy());
  });

  it('shows a rest target only after a set completes', async () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" restTargetSeconds={90} onComplete={vi.fn().mockResolvedValue('set-1')} />);
    expect(screen.queryByText(/Resting/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    expect(await screen.findByText(/Resting/)).toBeTruthy();
    expect(screen.getByText(/90s/)).toBeTruthy();
  });

  it('re-enables completion when persistence rejects', async () => {
    render(<ExerciseSetLogger exercise={{ id: 'bench', name: 'Bench Press' }} setNumber={1} unit="kg" onComplete={vi.fn().mockRejectedValue(new Error('offline'))} />);
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Complete set' }).hasAttribute('disabled')).toBe(false));
    expect(screen.queryByRole('button', { name: 'Undo set' })).toBeNull();
  });
});
