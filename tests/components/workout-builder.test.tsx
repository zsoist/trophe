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
const exercises = [{ id: 'bench', name: 'Bench Press' }, { id: 'press', name: 'Shoulder Press' }];

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

  it('disables Review for an empty strength draft and teaches the next action', () => {
    workspace.state.draft = { ...pushDraft, exercises: [] };
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Review workout' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Add an exercise to review this workout.')).toBeTruthy();
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
