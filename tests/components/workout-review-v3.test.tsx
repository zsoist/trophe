// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const push = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({
  state: { stage: 'review', draft: null as WorkoutDraft | null, startRequest: null, retrospectiveRequest: null },
  startLive: vi.fn(), returnToDraft: vi.fn(), updateDraftExercise: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string, params: Record<string, string | number> = {}) => ({
    'workout.draft_not_started': 'Draft · Not started',
    'workout.review_title': 'Review workout',
    'workout.plan_summary_line': `${params.exercises} exercises · ${params.sets} working sets`,
    'workout.plan_estimated_duration': `Estimated ${params.minutes} min`,
    'workout.plan_muscle_balance': 'Muscle balance',
    'workout.review_prescription': `${params.sets} sets · ${params.reps} reps · ${params.rest}s rest · RPE ${params.rpe}`,
    'workout.review_notes': `Note: ${params.notes}`,
    'workout.review_edit_plan': 'Edit workout',
    'workout.technique_named': `View ${params.name} technique`,
    'workout.start_workout': 'Start workout',
    'workout.log_completed': 'Log completed workout',
    'workout.save_plan': 'Save plan',
    'workout.start_live_explanation': 'Start workout creates a live session and starts the active clock. Logging completed work opens the retrospective logger.',
    'workout.plan_save_scope': 'Saved routines include name, order, sets and reps. Rest, RPE and notes stay in this device draft.',
    'workout.picker_exact_poster_alt': `${params.name} technique poster`,
    'workout.picker_anatomy_poster_alt': `Anatomy reference for ${params.name}`,
    'workout.detail_fallback_poster_alt': `Exercise placeholder for ${params.name}`,
    'workout.equipment_label': `Equipment: ${params.equipment}`,
    'workout.equipment_not_required': 'No equipment listed',
    'workout.exercise_name_unavailable': 'Exercise details unavailable',
  } as Record<string, string>)[key] ?? key }),
}));

import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';

const draft: WorkoutDraft = {
  version: 2, kind: 'strength', name: 'Upper evidence', updatedAt: 1,
  exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '6-8', restSeconds: 120, targetRpe: 8, notes: 'Pause on chest.' }],
};
const exercises = [{ id: 'bench', name: 'Barbell Bench Press', muscle_group: 'chest' as const, equipment: 'Barbell' }];

afterEach(() => { cleanup(); vi.clearAllMocks(); workspace.state.draft = null; });

describe('WorkoutReview explicit evidence', () => {
  it('uses a safe name while recovered exercise metadata is unavailable', () => {
    const technicalId = '58ff5cec-7340-4db4-9385-ad1f13439f25';
    workspace.state.draft = {
      ...draft,
      exercises: [{ exerciseId: technicalId, targetSets: 3, targetReps: '6-8' }],
    };

    render(<WorkoutReview exercises={[]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'Exercise details unavailable' })).toBeTruthy();
    expect(screen.queryByText(technicalId)).toBeNull();
    expect(screen.getByRole('button', { name: 'View Exercise details unavailable technique' })).toBeTruthy();
  });

  it('preserves a recovered custom exercise name without catalog metadata', () => {
    workspace.state.draft = {
      ...draft,
      exercises: [{ exerciseId: 'custom:floor-press', exerciseName: 'My custom floor press', targetSets: 3, targetReps: '8-10' }],
    };

    render(<WorkoutReview exercises={[]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByRole('heading', { name: 'My custom floor press' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View My custom floor press technique' })).toBeTruthy();
  });

  it('is immutable-looking and separates edit, detail, start, retrospective, and save actions', () => {
    workspace.state.draft = draft;
    render(<WorkoutReview exercises={exercises} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByText('1 exercises · 3 working sets')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('spinbutton')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit workout' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View Barbell Bench Press technique' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Start workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Log completed workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Save plan' }).hasAttribute('disabled')).toBe(false);
    expect(screen.queryByRole('button', { name: /finish workout/i })).toBeNull();
  });

  it('keeps start as the only live-session path', async () => {
    const onLogCompleted = vi.fn();
    const onSavePlan = vi.fn();
    workspace.state.draft = draft;
    workspace.startLive.mockResolvedValue(false);
    render(<WorkoutReview exercises={exercises} onSavePlan={onSavePlan} onLogCompleted={onLogCompleted} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Barbell Bench Press technique' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save plan' }));

    expect(workspace.startLive).not.toHaveBeenCalled();
    expect(workspace.returnToDraft).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
    expect(push).toHaveBeenCalledWith('/dashboard/workout/exercises/bench?return=review');
    expect(onLogCompleted).toHaveBeenCalledWith(draft);
    expect(onSavePlan).toHaveBeenCalledWith(draft);

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    expect(workspace.startLive).toHaveBeenCalledTimes(1);
  });
});
