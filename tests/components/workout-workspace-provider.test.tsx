// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorkoutSession } = vi.hoisted(() => ({ createWorkoutSession: vi.fn() }));

vi.mock('@/components/workout/workout-persistence', () => ({ createWorkoutSession }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() } },
}));

import {
  WorkoutWorkspaceProvider,
  useWorkoutWorkspace,
} from '@/components/workout/workspace/WorkoutWorkspaceProvider';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function ProviderHarness({ userId }: { userId: string }) {
  return (
    <WorkoutWorkspaceProvider userId={userId} storage={new MemoryStorage()}>
      <WorkspaceControls />
    </WorkoutWorkspaceProvider>
  );
}

function WorkspaceControls() {
  const workspace = useWorkoutWorkspace();
  return (
    <>
      <p>{workspace.state.stage === 'draft' ? 'Draft · Not started' : workspace.state.stage === 'live' ? 'Live' : workspace.state.stage}</p>
      <button onClick={() => workspace.createDraft({ name: 'Push', kind: 'strength' })}>Create Push draft</button>
      <button onClick={() => workspace.addDraftExercise('bench-press')}>Add Bench Press</button>
      <button onClick={() => workspace.createDraftFromTemplate({
        templateKey: 'template:11111111-1111-4111-8111-111111111111',
        templateId: '11111111-1111-4111-8111-111111111111', name: 'Coach Push',
        exercises: [
          { exerciseId: 'bench-press', targetSets: 4, targetReps: '6-8' },
          { exerciseId: 'shoulder-press', targetSets: 3, targetReps: '8-10' },
        ],
      })}>Create coach draft</button>
      <button onClick={() => workspace.createDraftFromTemplate({
        templateKey: 'split:push', templateId: null, name: 'Push',
        exercises: [{ exerciseId: 'bench-press', targetSets: 3, targetReps: '8-12' }],
      })}>Create built-in Push draft</button>
      <button onClick={() => workspace.goToReview()}>Review draft</button>
      <button onClick={() => workspace.updateDraftName('Push A')}>Rename draft</button>
      <button onClick={() => workspace.reorderDraftExercise('shoulder-press', 'up')}>Move Shoulder Press up</button>
      <button onClick={() => void workspace.startLive()}>Start live workout</button>
      {workspace.state.draft?.kind === 'strength' ? (
        <output>{workspace.state.draft.name}:{workspace.state.draft.exercises.map((exercise) => `${exercise.exerciseId}-${exercise.targetSets}x${exercise.targetReps}`).join(',')}</output>
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  createWorkoutSession.mockReset();
});

describe('WorkoutWorkspaceProvider', () => {
  it('does not call createWorkoutSession when creating or editing a draft', async () => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));

    expect(createWorkoutSession).not.toHaveBeenCalled();
    expect(screen.getByText('Draft · Not started')).toBeTruthy();
  });

  it('creates one session only after explicit live start', async () => {
    createWorkoutSession.mockResolvedValue('session-1');
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start live workout' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(createWorkoutSession).toHaveBeenCalledTimes(1));
    expect(createWorkoutSession).toHaveBeenCalledWith('nik', 'Push', null);
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('creates and edits a populated template draft without persistence writes', async () => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create coach draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create coach draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Shoulder Press up' }));

    expect(screen.getByText('Push A:shoulder-press-3x8-10,bench-press-4x6-8')).toBeTruthy();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('persists a built-in split without sending its local template key as a database UUID', async () => {
    createWorkoutSession.mockResolvedValue('session-push');
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create built-in Push draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create built-in Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    expect(createWorkoutSession).toHaveBeenCalledWith('nik', 'Push', null);
  });
});
