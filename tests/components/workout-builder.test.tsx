// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const workspace = vi.hoisted(() => ({
  state: { stage: 'draft', draft: null as WorkoutDraft | null },
  updateDraftName: vi.fn(), updateCardioDraft: vi.fn(), updateDraftExercise: vi.fn(),
  reorderDraftExercise: vi.fn(), removeDraftExercise: vi.fn(), addDraftExercise: vi.fn(), goToReview: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ lang: 'en', t: (key: string, params?: Record<string, string | number>) => ({
  'workout.draft_not_started': 'Draft · Not started', 'workout.name': 'Workout name',
  'workout.add_exercise': 'Add Exercise', 'workout.save_plan': 'Save plan', 'workout.review_workout': 'Review workout',
  'workout.target_sets': 'Target sets', 'workout.target_reps': 'Target reps', 'workout.remove_exercise': 'Remove exercise',
  'workout.move_up': 'Move up', 'workout.move_down': 'Move down', 'workout.empty_strength_hint': 'Add an exercise to review this workout.',
  'workout.empty_cardio_hint': 'Add a duration to review this workout.', 'workout.activity': 'Activity',
  'workout.duration_minutes': 'Duration in minutes', 'workout.distance_optional': 'Distance optional', 'workout.effort': 'Effort',
  'workout.cardio_walk': 'Walk', 'workout.cardio_run': 'Run', 'workout.cardio_cycle': 'Cycle',
  'workout.cardio_hiit': 'HIIT', 'workout.cardio_swim': 'Swim', 'workout.cardio_other': 'Other',
  'workout.move_named_up': `Move ${params?.name} up`, 'workout.move_named_down': `Move ${params?.name} down`,
  'workout.remove_named': `Remove ${params?.name}`, 'workout.target_sets_named': `Target sets for ${params?.name}`,
  'workout.target_reps_named': `Target reps for ${params?.name}`,
  'workout.save_plan_pending': 'Saving plan…', 'workout.save_plan_failed': 'Plan could not be saved. Try again.',
  'workout.save_plan_success': 'Plan saved to My routines.', 'workout.movement_anatomy_alt': `Anatomy highlighting muscles used by ${params?.name}`,
  'workout.muscle_chest': 'Chest', 'workout.muscle_shoulders': 'Shoulders',
  'workout.equipment_label': `Equipment: ${params?.equipment}`, 'workout.primary_muscle_label': `Primary muscle: ${params?.muscle}`,
  'workout.name_required': 'Enter a workout name.',
}[key] ?? key) }) }));

import { WorkoutBuilder } from '@/components/workout/workspace/WorkoutBuilder';

const pushDraft: WorkoutDraft = {
  version: 2, kind: 'strength', name: 'Push', updatedAt: 1,
  exercises: [
    { exerciseId: 'bench', targetSets: 4, targetReps: '6-8' },
    { exerciseId: 'press', targetSets: 3, targetReps: '8-10' },
  ],
};
const cardioDraft: WorkoutDraft = {
  version: 2, kind: 'cardio', name: 'Cardio', updatedAt: 1,
  activity: 'run', durationMinutes: 30, distanceKm: null, effort: 6,
};
const exercises = [
  { id: 'bench', name: 'Bench Press', muscle_group: 'chest' as const, equipment: 'barbell' },
  { id: 'press', name: 'Shoulder Press', muscle_group: 'shoulders' as const, equipment: 'dumbbell' },
];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WorkoutBuilder', () => {
  it('never shows Finish Workout in a draft', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    expect(screen.getByText('Draft · Not started')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Review workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  });

  it('edits targets, reorders exercises, and invokes the save boundary', () => {
    const onSavePlan = vi.fn();
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={onSavePlan} />);

    fireEvent.change(screen.getByLabelText('Target sets for Bench Press'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Shoulder Press up' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(workspace.updateDraftExercise).toHaveBeenCalledWith('bench', { targetSets: 5 });
    expect(workspace.reorderDraftExercise).toHaveBeenCalledWith('press', 'up');
    expect(onSavePlan).toHaveBeenCalledWith(pushDraft);
  });

  it('keeps 44px reorder controls and labeled removal in a separate narrow-screen action rail', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    const moveUp = screen.getByRole('button', { name: 'Move Bench Press up' });
    const moveDown = screen.getByRole('button', { name: 'Move Bench Press down' });
    const remove = screen.getByRole('button', { name: 'Remove Bench Press' });
    expect(moveUp.className).toContain('min-w-11');
    expect(moveDown.className).toContain('min-w-11');
    expect(remove.textContent).toContain('Remove exercise');
    expect(remove.parentElement?.className).toContain('border-t');
    expect(screen.getByRole('heading', { name: 'Bench Press' }).parentElement).not.toBe(remove.parentElement);
  });

  it('keeps contained movement identity and muscle/equipment evidence with every exercise', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    const benchVisual = screen.getByRole('img', { name: 'Anatomy highlighting muscles used by Bench Press' });
    expect(benchVisual.getAttribute('data-visual-kind')).toBe('anatomy');
    expect(benchVisual.getAttribute('data-alpha')).toBe('true');
    expect(benchVisual.getAttribute('style')).toContain('object-fit: contain');
    expect(screen.getByText('Primary muscle: Chest')).toBeTruthy();
    expect(screen.getByText('Equipment: barbell')).toBeTruthy();
  });

  it('locks duplicate saves while pending and reports a rejected write without success', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} saveState="error" />);

    expect(screen.getByRole('alert').textContent).toBe('Plan could not be saved. Try again.');
    expect(screen.queryByText('Plan saved to My routines.')).toBeNull();

    cleanup();
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} saveState="pending" />);
    const pending = screen.getByRole('button', { name: 'Saving plan…' });
    expect(pending.hasAttribute('disabled')).toBe(true);
  });

  it('disables Review for an empty strength draft and teaches the next action', () => {
    workspace.state.draft = { ...pushDraft, exercises: [] };
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Review workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Add an exercise to review this workout.')).toBeTruthy();
  });

  it('blocks Build and Save Plan for an empty workout name with visible validation', () => {
    workspace.state.draft = { ...pushDraft, name: '   ' };
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Review workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Save plan' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('alert').textContent).toBe('Enter a workout name.');
  });

  it('opens the routed exercise browser from a strength draft', () => {
    workspace.state.draft = pushDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add Exercise' }));

    expect(push).toHaveBeenCalledWith('/dashboard/workout/exercises');
    expect(screen.queryByRole('button', { name: 'Shoulder Press' })).toBeNull();
  });

  it('renders cardio fields instead of strength set fields', () => {
    workspace.state.draft = cardioDraft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Duration in minutes'), { target: { value: '45' } });

    expect(workspace.updateCardioDraft).toHaveBeenCalledWith({ durationMinutes: 45 });
    expect(screen.getByLabelText('Distance optional')).toBeTruthy();
    expect(screen.queryByLabelText(/Target sets/)).toBeNull();
  });
});
