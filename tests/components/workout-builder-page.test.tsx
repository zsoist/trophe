// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const draft: WorkoutDraft = {
  version: 2,
  kind: 'strength',
  name: 'Push',
  updatedAt: 1,
  exercises: [{ exerciseId: 'bench', targetSets: 4, targetReps: '6-8' }],
};

const harness = vi.hoisted(() => ({
  stage: 'draft', ready: true, replace: vi.fn(), refresh: vi.fn(), getUser: vi.fn(), saveRoutine: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: harness.replace, refresh: harness.refresh }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({
  useWorkoutWorkspace: () => ({ ready: harness.ready, state: { stage: harness.stage, draft } }),
}));
vi.mock('@/components/workout/workspace/WorkoutBuilder', () => ({
  WorkoutBuilder: ({ onSavePlan, saveDisabled, saveState }: { onSavePlan: (value: WorkoutDraft) => void; saveDisabled: boolean; saveState: string }) => <div><button disabled={saveDisabled} onClick={() => onSavePlan(draft)}>Save plan</button><output data-testid="save-state">{saveState}</output></div>,
}));
vi.mock('@/lib/workout/routine-repository', () => ({ saveWorkoutRoutine: harness.saveRoutine }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: harness.getUser },
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [{ id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' }] }) }) }),
  },
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));

import WorkoutBuildPage from '@/app/dashboard/workout/build/page';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  harness.stage = 'draft';
  harness.ready = true;
  draft.updatedAt = 1;
});

describe('WorkoutBuildPage save and route boundaries', () => {
  it('awaits the authenticated owner write before invalidating Home data', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockResolvedValue({ id: 'routine-1', name: 'Push' });
    render(<WorkoutBuildPage />);

    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(harness.saveRoutine).toHaveBeenCalledWith(
      expect.anything(),
      'nik',
      draft,
      [{ id: 'bench', name: 'Bench Press', muscle_group: 'chest', equipment: 'barbell' }],
    ));
    expect(harness.refresh).toHaveBeenCalledTimes(1);
  });

  it('keeps Home data untouched when the owner write is rejected', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockRejectedValue(new Error('RLS denied'));
    render(<WorkoutBuildPage />);

    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);

    await waitFor(() => expect(harness.saveRoutine).toHaveBeenCalledTimes(1));
    expect(harness.refresh).not.toHaveBeenCalled();
  });

  it('clears stale save success as soon as the draft revision changes', async () => {
    harness.getUser.mockResolvedValue({ data: { user: { id: 'nik' } } });
    harness.saveRoutine.mockResolvedValue({ id: 'routine-1', name: 'Push' });
    const view = render(<WorkoutBuildPage />);
    const save = screen.getByRole('button', { name: 'Save plan' });
    await waitFor(() => expect(save.hasAttribute('disabled')).toBe(false));
    fireEvent.click(save);
    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('success'));

    draft.updatedAt = 2;
    view.rerender(<WorkoutBuildPage />);

    await waitFor(() => expect(screen.getByTestId('save-state').textContent).toBe('idle'));
  });

  it('shows only a loading boundary until recovery is ready', () => {
    harness.ready = false;
    render(<WorkoutBuildPage />);
    expect(screen.getByRole('status', { name: 'workout.loading_build' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull();
    expect(harness.replace).not.toHaveBeenCalled();
  });

  it('replaces a direct Build URL with the recovered live route before rendering Build', async () => {
    harness.stage = 'live';
    render(<WorkoutBuildPage />);
    await waitFor(() => expect(harness.replace).toHaveBeenCalledWith('/dashboard/workout/live'));
    expect(screen.queryByRole('button', { name: 'Save plan' })).toBeNull();
  });

  it('keeps Build available while Review transitions back to its editable draft', async () => {
    harness.stage = 'review';
    render(<WorkoutBuildPage />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Save plan' })).toBeTruthy());
    expect(harness.replace).not.toHaveBeenCalled();
  });
});
