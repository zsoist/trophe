// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const workspace = vi.hoisted(() => ({
  state: { stage: 'review', draft: null as WorkoutDraft | null },
  startLive: vi.fn(), updateDraftExercise: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string, params?: Record<string, string | number>) => ({
  'workout.review_title': 'Review workout', 'workout.start_live': 'Start live workout',
  'workout.log_completed': 'Log completed workout', 'workout.save_plan': 'Save plan',
  'workout.start_live_explanation': 'Starting live starts the active timer and creates your workout session.',
  'workout.exercise_count': `${params?.n} exercises`, 'workout.sets_reps_summary': `${params?.sets} sets · ${params?.reps} reps`,
  'workout.duration_summary': `${params?.minutes} minutes`, 'workout.distance_summary': `${params?.distance} km`,
  'workout.effort_summary': `Effort ${params?.effort}/10`, 'workout.empty_strength_hint': 'Add an exercise to review this workout.',
  'workout.empty_cardio_hint': 'Add a duration to review this workout.',
  'workout.start_live_failed': 'Workout could not start. Try again.',
  'workout.name_required': 'Enter a workout name.',
  'workout.save_plan_pending': 'Saving plan…', 'workout.save_plan_failed': 'Plan could not be saved. Try again.',
  'workout.save_plan_success': 'Plan saved to My routines.', 'workout.review_edit_exercise': `Edit ${params?.name}`,
  'workout.target_sets_named': `Target sets for ${params?.name}`, 'workout.target_reps_named': `Target reps for ${params?.name}`,
  'workout.movement_anatomy_alt': `Anatomy highlighting muscles used by ${params?.name}`,
  'workout.muscle_chest': 'Chest', 'workout.equipment_label': `Equipment: ${params?.equipment}`,
  'workout.primary_muscle_label': `Primary muscle: ${params?.muscle}`,
  'workout.target_sets': 'Target sets', 'workout.target_reps': 'Target reps',
}[key] ?? key) }) }));

import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';

const pushDraft: WorkoutDraft = {
  version: 2, kind: 'strength', name: 'Push', updatedAt: 1,
  exercises: [{ exerciseId: 'bench', targetSets: 4, targetReps: '6-8' }],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WorkoutReview', () => {
  it('explains persistence before starting live', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByText(/starts the active timer/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start live workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Log completed workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Save plan' }).hasAttribute('disabled')).toBe(false);
  });

  it('invokes each explicit persistence decision boundary', () => {
    const onSavePlan = vi.fn();
    const onLogCompleted = vi.fn();
    workspace.state.draft = pushDraft;
    workspace.startLive.mockResolvedValue(true);
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={onSavePlan} onLogCompleted={onLogCompleted} />);

    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    expect(onSavePlan).toHaveBeenCalledWith(pushDraft);
    expect(onLogCompleted).toHaveBeenCalledWith(pushDraft);
    expect(workspace.startLive).toHaveBeenCalledTimes(1);
  });

  it('uses compact editable disclosures for final exercise editing', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    const disclosure = screen.getByText('Bench Press').closest('details');
    expect(disclosure).toBeTruthy();
    expect(disclosure?.hasAttribute('open')).toBe(false);
    fireEvent.change(screen.getByLabelText('Target sets for Bench Press'), { target: { value: '5' } });
    expect(workspace.updateDraftExercise).toHaveBeenCalledWith('bench', { targetSets: 5 });
    expect(screen.getByText('Primary muscle: Chest')).toBeTruthy();
    expect(screen.getByText('Equipment: barbell')).toBeTruthy();
  });

  it('shows save rejection independently from live-start errors', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} saveState="error" />);
    expect(screen.getByRole('alert').textContent).toBe('Plan could not be saved. Try again.');
    expect(screen.queryByText('Plan saved to My routines.')).toBeNull();
  });

  it('summarizes cardio without strength rows', () => {
    workspace.state.draft = { version: 2, kind: 'cardio', name: 'Morning run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 7 };
    render(<WorkoutReview exercises={[]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByText('30 minutes')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('Effort 7/10')).toBeTruthy();
    expect(screen.queryByText(/sets/)).toBeNull();
  });

  it('blocks every persistence decision when the workout name is empty', () => {
    workspace.state.draft = { ...pushDraft, name: '   ' };
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Start live workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Log completed workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save plan' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Enter a workout name.');
  });

  it('shows a recoverable error and re-enables start when the provider returns false', async () => {
    workspace.state.draft = pushDraft;
    workspace.startLive.mockResolvedValue(false);
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Workout could not start. Try again.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start live workout' }).hasAttribute('disabled')).toBe(false));
    expect(push).not.toHaveBeenCalled();
  });

  it('shows the same recoverable error and re-enables start when the provider rejects', async () => {
    workspace.state.draft = pushDraft;
    workspace.startLive.mockRejectedValue(new Error('network unavailable'));
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Workout could not start. Try again.');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start live workout' }).hasAttribute('disabled')).toBe(false));
    expect(push).not.toHaveBeenCalled();
  });
});
