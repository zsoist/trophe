// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const push = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({
  state: { stage: 'draft', draft: null as WorkoutDraft | null, startRequest: null, retrospectiveRequest: null },
  updateDraftName: vi.fn(), updateCardioDraft: vi.fn(), updateDraftExercise: vi.fn(),
  reorderDraftExercise: vi.fn(), removeDraftExercise: vi.fn(), replaceDraftExercise: vi.fn(),
  goToReview: vi.fn(), startLive: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string, params: Record<string, string | number> = {}) => {
    const values: Record<string, string> = {
      'workout.draft_not_started': 'Draft · Not started',
      'workout.name': 'Workout name',
      'workout.plan_summary_line': `${params.exercises} exercises · ${params.sets} working sets`,
      'workout.plan_estimated_duration': `Estimated ${params.minutes} min`,
      'workout.plan_muscle_balance': 'Muscle balance',
      'workout.plan_missing_evidence': 'Some exercises do not have verified muscle evidence yet.',
      'workout.plan_balance_concentrated': 'This plan is concentrated in one muscle area.',
      'workout.target_sets': 'Sets',
      'workout.target_reps': 'Reps',
      'workout.rest_seconds': 'Rest',
      'workout.target_rpe': 'Target RPE',
      'workout.notes_optional': 'Notes',
      'workout.target_sets_named': `Target sets for ${params.name}`,
      'workout.target_reps_named': `Target reps for ${params.name}`,
      'workout.rest_seconds_named': `Rest seconds for ${params.name}`,
      'workout.target_rpe_named': `Target RPE for ${params.name}`,
      'workout.notes_named': `Notes for ${params.name}`,
      'workout.move_named_earlier': `Move ${params.name} earlier`,
      'workout.move_named_later': `Move ${params.name} later`,
      'workout.drag_named': `Drag ${params.name} to reorder`,
      'workout.replace_named': `Replace ${params.name}`,
      'workout.technique_named': `View ${params.name} technique`,
      'workout.remove_named': `Remove ${params.name}`,
      'workout.replace_exercise': 'Replace',
      'workout.technique': 'Technique',
      'workout.remove_exercise': 'Remove',
      'workout.add_exercise': 'Add exercise',
      'workout.save_plan': 'Save plan',
      'workout.review_workout': 'Review workout',
      'workout.plan_save_scope': 'Saved routines include name, order, sets and reps. Rest, RPE and notes stay in this device draft.',
      'workout.picker_exact_poster_alt': `${params.name} technique poster`,
      'workout.picker_anatomy_poster_alt': `Anatomy reference for ${params.name}`,
      'workout.detail_fallback_poster_alt': `Exercise placeholder for ${params.name}`,
      'workout.equipment_label': `Equipment: ${params.equipment}`,
      'workout.equipment_not_required': 'No equipment listed',
      'workout.invalid_prescription': 'Every exercise needs a valid prescription.',
    };
    return values[key] ?? key;
  } }),
}));

import { WorkoutBuilder } from '@/components/workout/workspace/WorkoutBuilder';

const draft: WorkoutDraft = {
  version: 2,
  kind: 'strength',
  name: 'Upper evidence',
  updatedAt: 1,
  exercises: [
    { exerciseId: 'bench', targetSets: 3, targetReps: '6-8', restSeconds: 120, targetRpe: 8, notes: 'Pause on chest.' },
    { exerciseId: 'row', targetSets: 3, targetReps: '8-10', restSeconds: 90, targetRpe: 7.5 },
    { exerciseId: 'curl', targetSets: 3, targetReps: '10-12' },
  ],
};

const exercises = [
  { id: 'bench', name: 'Barbell Bench Press', muscle_group: 'chest' as const, equipment: 'Barbell' },
  { id: 'row', name: 'Seated Cable Row', muscle_group: 'back' as const, equipment: 'Cable' },
  { id: 'curl', name: 'Standing Dumbbell Biceps Curl', muscle_group: 'biceps' as const, equipment: 'Dumbbell' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  workspace.state.draft = null;
});

describe('WorkoutBuilder premium evidence board', () => {
  it('shows complete prescription evidence and accessible draft-only actions', () => {
    workspace.state.draft = draft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    expect(screen.getByText('3 exercises · 9 working sets')).toBeTruthy();
    expect(screen.getByText(/Estimated \d+ min/)).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Muscle balance' })).toBeTruthy();
    expect((screen.getByLabelText('Rest seconds for Barbell Bench Press') as HTMLInputElement).value).toBe('120');
    expect((screen.getByLabelText('Target RPE for Barbell Bench Press') as HTMLInputElement).value).toBe('8');
    expect((screen.getByLabelText('Notes for Barbell Bench Press') as HTMLTextAreaElement).value).toBe('Pause on chest.');
    expect(screen.getByRole('button', { name: 'Move Seated Cable Row earlier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move Seated Cable Row later' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Replace Seated Cable Row' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View Seated Cable Row technique' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Seated Cable Row' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /finish workout/i })).toBeNull();
  });

  it('edits, moves, replaces, and removes without starting a live session', () => {
    workspace.state.draft = draft;
    const view = render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Rest seconds for Barbell Bench Press'), { target: { value: '150' } });
    fireEvent.click(screen.getByRole('button', { name: 'Move Seated Cable Row earlier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Replace Seated Cable Row' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Standing Dumbbell Biceps Curl' }));

    expect(workspace.updateDraftExercise).toHaveBeenCalledWith('bench', { restSeconds: 150 });
    expect(workspace.reorderDraftExercise).toHaveBeenCalledWith('row', 'up');
    expect(push).toHaveBeenCalledWith('/dashboard/workout/exercises?replace=row&return=build');
    expect(workspace.removeDraftExercise).toHaveBeenCalledWith('curl');
    expect(workspace.startLive).not.toHaveBeenCalled();

    workspace.state.draft = { ...draft, exercises: [draft.exercises[1], draft.exercises[0], draft.exercises[2]] };
    view.rerender(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);
    expect(screen.getAllByTestId('plan-exercise')[0].textContent).toContain('Seated Cable Row');
  });

  it('reorders by pointer gesture using the stable exercise id while retaining button controls', () => {
    workspace.state.draft = draft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    const handle = screen.getByRole('button', { name: 'Drag Seated Cable Row to reorder' });
    const down = new Event('pointerdown', { bubbles: true });
    Object.defineProperties(down, { pointerId: { value: 7 }, clientY: { value: 180 } });
    const up = new Event('pointerup', { bubbles: true });
    Object.defineProperties(up, { pointerId: { value: 7 }, clientY: { value: 100 } });
    fireEvent(handle, down);
    fireEvent(handle, up);

    expect(workspace.reorderDraftExercise).toHaveBeenCalledWith('row', 'up');
    expect(screen.getByRole('button', { name: 'Move Seated Cable Row earlier' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Move Seated Cable Row later' })).toBeTruthy();
  });
});
