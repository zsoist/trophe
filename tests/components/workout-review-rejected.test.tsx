// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const workspace = vi.hoisted(() => ({
  state: { stage: 'review', draft: null as WorkoutDraft | null, startRequest: null as { idempotencyKey: string } | null },
  startRejection: null as { code: string } | null,
  startLive: vi.fn(), returnToDraft: vi.fn(), updateDraftExercise: vi.fn(),
}));
const push = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.start_workout': 'Start workout', 'workout.retry_same_start': 'Retry same start',
  'workout.log_completed': 'Log completed workout', 'workout.save_plan': 'Save plan',
  'workout.review_edit_plan': 'Edit workout',
  'workout.start_live_failed': 'Workout could not start. Try again.',
  'workout.start_request_locked': 'Retry the same start before editing.',
  'workout.start_rejected': 'The server refused to create this workout, so the start request was released.',
  'workout.back_to_draft': 'Back to draft',
}[key] ?? key) }) }));

import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';

const pushDraft: WorkoutDraft = {
  version: 2, kind: 'strength', name: 'Push', updatedAt: 1,
  exercises: [{ exerciseId: 'bench', targetSets: 4, targetReps: '6-8' }],
};

afterEach(() => { cleanup(); vi.clearAllMocks(); workspace.state.startRequest = null; workspace.startRejection = null; });

describe('WorkoutReview definitive start rejection', () => {
  it('shows the refusal, keeps edit unlocked, and offers Back to draft once the envelope is released', () => {
    workspace.state.draft = pushDraft;
    workspace.state.startRequest = null;
    workspace.startRejection = { code: '42501' };
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByRole('alert').textContent).toContain('refused to create this workout');
    expect(screen.queryByText('Retry the same start before editing.')).toBeNull();
    expect(screen.queryByText('Workout could not start. Try again.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit workout' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('button', { name: 'Start workout' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Back to draft' }));
    expect(workspace.returnToDraft).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/dashboard/workout/build');
  });

  it('keeps the transient lock message when the envelope is still pinned', () => {
    workspace.state.draft = pushDraft;
    workspace.state.startRequest = { idempotencyKey: 'request-1' };
    render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    expect(screen.getByText('Retry the same start before editing.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry same start' })).toBeTruthy();
  });

  it('prefers the refusal explanation over the generic start failure after a rejected attempt', async () => {
    workspace.state.draft = pushDraft;
    workspace.startLive.mockImplementation(async () => { workspace.startRejection = { code: '22023' }; return false; });
    const view = render(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Start workout' }));
    await vi.waitFor(() => expect(workspace.startLive).toHaveBeenCalledTimes(1));
    view.rerender(<WorkoutReview exercises={[{ id: 'bench', name: 'Bench Press' }]} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />);

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((alert) => alert.textContent)).toEqual([expect.stringContaining('refused to create this workout')]);
    expect(push).not.toHaveBeenCalledWith('/dashboard/workout/live');
  });
});
