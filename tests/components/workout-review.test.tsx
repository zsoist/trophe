// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const workspace = vi.hoisted(() => ({
  state: { stage: 'review', draft: null as WorkoutDraft | null },
  startLive: vi.fn(),
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

  it('summarizes cardio without strength rows', () => {
    workspace.state.draft = { version: 2, kind: 'cardio', name: 'Morning run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 7 };
    render(<WorkoutReview exercises={[]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByText('30 minutes')).toBeTruthy();
    expect(screen.getByText('5 km')).toBeTruthy();
    expect(screen.getByText('Effort 7/10')).toBeTruthy();
    expect(screen.queryByText(/sets/)).toBeNull();
  });
});
