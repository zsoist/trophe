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
      <button onClick={() => void workspace.startLive()}>Start live workout</button>
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
});
