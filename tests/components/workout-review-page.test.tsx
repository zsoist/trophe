// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const draft: WorkoutDraft = { version: 2, kind: 'cardio', name: 'Run', updatedAt: 1, activity: 'run', durationMinutes: 30, distanceKm: 5, effort: 7 };
const harness = vi.hoisted(() => ({
  discardDraft: vi.fn(),
  ensureClientRequestId: vi.fn(() => '11111111-1111-4111-8111-111111111111'),
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), getUser: vi.fn(), saveRoutine: vi.fn(), stage: 'review',
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: harness.push, replace: harness.replace, refresh: harness.refresh }) }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: harness.getUser },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [] }) }) }),
  },
}));
vi.mock('@/lib/workout/routine-repository', () => ({ saveWorkoutRoutine: harness.saveRoutine }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => ({ ready: true, state: { stage: harness.stage, draft }, discardDraft: harness.discardDraft, ensureClientRequestId: harness.ensureClientRequestId }) }));
vi.mock('@/components/workout/workspace/WorkoutReview', () => ({ WorkoutReview: ({ onLogCompleted, onSavePlan, saveDisabled, saveState }: { onLogCompleted: (value: WorkoutDraft) => void; onSavePlan: (value: WorkoutDraft) => void; saveDisabled: boolean; saveState: string }) => <div><button onClick={() => onLogCompleted(draft)}>Log completed workout</button><button disabled={saveDisabled} onClick={() => onSavePlan(draft)}>Save plan</button><output data-testid="save-state">{saveState}</output></div> }));
vi.mock('@/components/workout/workspace/RetrospectiveWorkoutLogger', () => ({ RetrospectiveWorkoutLogger: ({ onSaved, onCancel }: { onSaved: () => void; onCancel: () => void }) => <div><p>Retrospective logger</p><button onClick={onSaved}>Simulate saved</button><button onClick={onCancel}>Cancel logging</button></div> }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import WorkoutReviewPage from '@/app/dashboard/workout/review/page';

afterEach(() => { cleanup(); vi.clearAllMocks(); harness.stage = 'review'; draft.updatedAt = 1; });

describe('WorkoutReviewPage retrospective seam', () => {
  it('opens durable retrospective logging and clears the draft only after save succeeds', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    render(<WorkoutReviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
    expect(await screen.findByText('Retrospective logger')).toBeTruthy();
    expect(harness.discardDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Simulate saved' }));
    expect(harness.discardDraft).toHaveBeenCalledTimes(1);
    expect(harness.push).toHaveBeenCalledWith('/dashboard/workout');
  });

  it('awaits the owner-scoped routine write and invalidates only after success', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockResolvedValue({ id: 'routine-1', name: 'Run' });
    render(<WorkoutReviewPage />);

    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(harness.saveRoutine).toHaveBeenCalledWith(expect.anything(), 'nik', draft, []));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it('never invalidates or reports success when the routine write rejects', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockRejectedValue(new Error('offline'));
    render(<WorkoutReviewPage />);

    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(harness.saveRoutine).toHaveBeenCalledTimes(1));
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it('clears stale save success after a final target edit changes the draft revision', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockResolvedValue({ id: 'routine-1', name: 'Run' });
    const view = render(<WorkoutReviewPage />);
    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('success'));

    draft.updatedAt = 2;
    view.rerender(<WorkoutReviewPage />);

    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('idle'));
  });

  it('replaces a direct Review URL with Build before rendering Review when state is draft', async () => {
    harness.stage = 'draft';
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    render(<WorkoutReviewPage />);

    await waitFor(() => expect(harness.replace).toHaveBeenCalledWith('/dashboard/workout/build'));
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull();
  });
});
