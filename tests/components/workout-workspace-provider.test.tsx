// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorkoutSession, discardEmptyLiveSession } = vi.hoisted(() => ({ createWorkoutSession: vi.fn(), discardEmptyLiveSession: vi.fn() }));

vi.mock('@/components/workout/workout-persistence', () => ({ createWorkoutSession }));
vi.mock('@/lib/workout/live-session', () => ({ discardEmptyLiveSession }));
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

function ProviderHarness({ userId, storage = new MemoryStorage() }: { userId: string; storage?: MemoryStorage }) {
  return (
    <WorkoutWorkspaceProvider userId={userId} storage={storage}>
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
      <button onClick={() => workspace.replaceDraftFromTemplate({
        templateKey: 'repeat:22222222-2222-4222-8222-222222222222',
        templateId: null,
        name: 'Repeated pull',
        exercises: [{ exerciseId: 'row', targetSets: 3, targetReps: '10' }],
      })}>Replace with repeated draft</button>
      <button onClick={() => void workspace.startLive()}>Start live workout</button>
      <button onClick={() => workspace.pause(11_000)}>Pause workout</button>
      <button onClick={() => workspace.requestFinish()}>Request finish</button>
      <button onClick={() => workspace.cancelFinish(31_000)}>Keep training</button>
      <button onClick={() => workspace.completeFinish()}>Complete verified finish</button>
      <button onClick={() => void workspace.discardLive()}>Discard empty workout</button>
      {workspace.state.draft?.kind === 'strength' ? (
        <output>{workspace.state.draft.name}:{workspace.state.draft.exercises.map((exercise) => `${exercise.exerciseId}-${exercise.targetSets}x${exercise.targetReps}`).join(',')}</output>
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  createWorkoutSession.mockReset();
  discardEmptyLiveSession.mockReset();
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

  it.each([
    ['draft', false],
    ['review', true],
  ] as const)('explicitly replaces a current %s with the requested local draft without a session write', async (_stage, review) => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    if (review) fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));

    fireEvent.click(screen.getByRole('button', { name: 'Replace with repeated draft' }));

    expect(screen.getByText('Draft · Not started')).toBeTruthy();
    expect(screen.getByText('Repeated pull:row-3x10')).toBeTruthy();
    expect(screen.queryByText(/bench-press/)).toBeNull();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('returns a finishing workout to its paused origin when the user keeps training', async () => {
    createWorkoutSession.mockResolvedValue('session-1');
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Pause workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep training' }));
    expect(screen.getByText('paused')).toBeTruthy();
  });

  it('keeps recovery when empty-session deletion is unverified and clears it after verified deletion', async () => {
    const storage = new MemoryStorage();
    createWorkoutSession.mockResolvedValue('session-1');
    discardEmptyLiveSession.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ProviderHarness userId="nik" storage={storage} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Request finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    await waitFor(() => expect(discardEmptyLiveSession).toHaveBeenCalledTimes(1));
    expect(storage.getItem('trophe:workout-workspace:nik')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    await waitFor(() => expect(storage.getItem('trophe:workout-workspace:nik')).toBeNull());
  });
});
