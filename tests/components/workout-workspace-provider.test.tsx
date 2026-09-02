// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { startLiveSession, discardEmptyLiveSession, savePreparedRetrospectiveWorkout } = vi.hoisted(() => ({
  startLiveSession: vi.fn(),
  discardEmptyLiveSession: vi.fn(),
  savePreparedRetrospectiveWorkout: vi.fn(),
}));
const dateHarness = vi.hoisted(() => ({ today: '2026-08-24' }));

vi.mock('@/lib/workout/live-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/live-session')>();
  return { ...actual, startLiveSession, discardEmptyLiveSession, savePreparedRetrospectiveWorkout };
});
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() } },
}));
vi.mock('@/lib/utils/dates', () => ({ localToday: () => dateHarness.today }));

import {
  WorkoutWorkspaceProvider,
  useWorkoutWorkspace,
} from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { saveWorkspaceState } from '@/lib/workout/workspace-storage';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

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
      <button onClick={() => workspace.returnToDraft()}>Return to draft</button>
      <button onClick={() => workspace.updateDraftName('Push A')}>Rename draft</button>
      <button onClick={() => workspace.reorderDraftExercise('shoulder-press', 'up')}>Move Shoulder Press up</button>
      <button onClick={() => workspace.replaceDraftFromTemplate({
        templateKey: 'repeat:22222222-2222-4222-8222-222222222222',
        templateId: null,
        name: 'Repeated pull',
        exercises: [{ exerciseId: 'row', targetSets: 3, targetReps: '10' }],
      })}>Replace with repeated draft</button>
      <button onClick={() => void workspace.startLive()}>Start live workout</button>
      <button onClick={() => {
        if (!workspace.state.draft) return;
        void workspace.saveRetrospective({
          draft: workspace.state.draft,
          durationMinutes: 30,
          painFlags: [],
          sets: [{ exercise_id: 'bench-press', set_number: 1, weight_kg: 60, reps: 8, rpe: 8, is_warmup: false, is_pr: false, superset_group: null }],
        });
      }}>Save retrospective workout</button>
      <button onClick={() => void workspace.retryRetrospective()}>Retry retrospective workout</button>
      <button onClick={() => workspace.pause(11_000)}>Pause workout</button>
      <button onClick={() => workspace.requestFinish()}>Request finish</button>
      <button onClick={() => workspace.cancelFinish(31_000)}>Keep training</button>
      <button onClick={() => workspace.completeFinish()}>Complete verified finish</button>
      <button onClick={() => workspace.acknowledgeCompleted()}>Acknowledge completed summary</button>
      <button onClick={() => void workspace.discardLive()}>Discard empty workout</button>
      {workspace.state.draft?.kind === 'strength' ? (
        <output>{workspace.state.draft.name}:{workspace.state.draft.exercises.map((exercise) => `${exercise.exerciseId}-${exercise.targetSets}x${exercise.targetReps}`).join(',')}</output>
      ) : null}
    </>
  );
}

afterEach(() => {
  cleanup();
  startLiveSession.mockReset();
  discardEmptyLiveSession.mockReset();
  savePreparedRetrospectiveWorkout.mockReset();
  dateHarness.today = '2026-08-24';
});

describe('WorkoutWorkspaceProvider', () => {
  it('returns Review to Build while preserving the draft', async () => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));

    expect(screen.getByText('review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));

    expect(screen.getByText('Draft · Not started')).toBeTruthy();
    expect(screen.getByText(/bench-press-3x8-12/)).toBeTruthy();
  });

  it('does not call createWorkoutSession when creating or editing a draft', async () => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));

    expect(startLiveSession).not.toHaveBeenCalled();
    expect(screen.getByText('Draft · Not started')).toBeTruthy();
  });

  it('creates one session only after explicit live start', async () => {
    let resolveStart!: (result: { ok: true; sessionId: string }) => void;
    startLiveSession.mockReturnValue(new Promise((resolve) => { resolveStart = resolve; }));
    const storage = new MemoryStorage();
    render(<ProviderHarness userId="nik" storage={storage} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Start live workout' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    expect(startLiveSession).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push', templateId: null }));
    expect(screen.queryByText('Live')).toBeNull();
    resolveStart({ ok: true, sessionId: 'session-1' });
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    await waitFor(() => expect(JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}')).toMatchObject({
      stage: 'live', sessionId: 'session-1', startRequest: null, clientRequestId: null,
    }));
  });

  it('creates and edits a populated template draft without persistence writes', async () => {
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create coach draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create coach draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rename draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move Shoulder Press up' }));

    expect(screen.getByText('Push A:shoulder-press-3x8-10,bench-press-4x6-8')).toBeTruthy();
    expect(startLiveSession).not.toHaveBeenCalled();
  });

  it('persists a built-in split without sending its local template key as a database UUID', async () => {
    startLiveSession.mockResolvedValue({ ok: true, sessionId: 'session-push' });
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create built-in Push draft' })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Create built-in Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    expect(startLiveSession).toHaveBeenCalledWith(expect.objectContaining({ name: 'Push', templateId: null }));
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
    expect(startLiveSession).not.toHaveBeenCalled();
  });

  it('returns a finishing workout to its paused origin when the user keeps training', async () => {
    startLiveSession.mockResolvedValue({ ok: true, sessionId: 'session-1' });
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Pause workout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep training' }));
    expect(screen.getByText('paused')).toBeTruthy();
  });

  it('keeps recovery when empty-session deletion is unverified and clears it after verified deletion', async () => {
    const storage = new MemoryStorage();
    startLiveSession.mockResolvedValue({ ok: true, sessionId: 'session-1' });
    discardEmptyLiveSession.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<ProviderHarness userId="nik" storage={storage} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Request finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    await waitFor(() => expect(discardEmptyLiveSession).toHaveBeenCalledTimes(1));
    expect(storage.getItem('trophe:workout-workspace:nik')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Discard empty workout' }));
    await waitFor(() => expect(storage.getItem('trophe:workout-workspace:nik')).toBeNull());
  });

  it('keeps the verified completed state visible until the summary is acknowledged', async () => {
    const storage = new MemoryStorage();
    startLiveSession.mockResolvedValue({ ok: true, sessionId: 'session-1' });
    const mounted = render(<ProviderHarness userId="nik" storage={storage} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByText('Live')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Request finish' }));
    fireEvent.click(screen.getByRole('button', { name: 'Complete verified finish' }));

    expect(screen.getByText('completed')).toBeTruthy();
    await waitFor(() => expect(JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}').stage).toBe('completed'));

    mounted.unmount();
    render(<ProviderHarness userId="nik" storage={storage} />);
    expect(await screen.findByText('completed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge completed summary' }));
    expect(screen.getByText('home')).toBeTruthy();
    await waitFor(() => expect(storage.getItem('trophe:workout-workspace:nik')).toBeNull());
  });

  it('persists the complete start envelope before send and replays its original date', async () => {
    const storage = new MemoryStorage();
    const seen: Array<{ idempotencyKey: string; sessionDate: string; draftFingerprint: string }> = [];
    startLiveSession.mockImplementation(async (request: { idempotencyKey: string; sessionDate: string; draftFingerprint: string }) => {
      const recovered = JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}');
      expect(recovered.startRequest).toEqual(request);
      seen.push(request);
      return { ok: false };
    });
    render(<ProviderHarness userId="nik" storage={storage} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Rename draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    expect(screen.getByText(/Push:bench-press-3x8-12/)).toBeTruthy();
    expect(screen.queryByText(/Push A:/)).toBeNull();
    dateHarness.today = '2026-08-25';
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(2));
    expect(seen[0].idempotencyKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(seen[0].sessionDate).toBe('2026-08-24');
    expect(seen[1]).toEqual(seen[0]);
  });

  it('persists and replays the exact retrospective envelope after a lost response', async () => {
    const storage = new MemoryStorage();
    const seen: unknown[] = [];
    savePreparedRetrospectiveWorkout
      .mockImplementationOnce(async (request) => {
        const recovered = JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}');
        expect(recovered.retrospectiveRequest).toEqual(request);
        seen.push(request);
        return { ok: false };
      })
      .mockImplementationOnce(async (request) => {
        seen.push(request);
        return { ok: true, sessionId: 'canonical-history-session' };
      });
    const mounted = render(<ProviderHarness userId="nik" storage={storage} />);
    await screen.findByRole('button', { name: 'Create Push draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save retrospective workout' }));
    await waitFor(() => expect(savePreparedRetrospectiveWorkout).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Rename draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    expect(screen.getByText('Push:bench-press-3x8-12')).toBeTruthy();
    expect(JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}').retrospectiveRequest).toEqual(seen[0]);

    mounted.unmount();
    render(<ProviderHarness userId="nik" storage={storage} />);
    expect(await screen.findByText('review')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry retrospective workout' }));
    await waitFor(() => expect(savePreparedRetrospectiveWorkout).toHaveBeenCalledTimes(2));
    expect(seen[1]).toEqual(seen[0]);
    expect(await screen.findByText('completed')).toBeTruthy();
    expect(JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}')).toMatchObject({
      stage: 'completed',
      sessionId: 'canonical-history-session',
      retrospectiveRequest: null,
      completedRetrospective: seen[0],
    });
    cleanup();
    render(<ProviderHarness userId="nik" storage={storage} />);
    expect(await screen.findByText('completed')).toBeTruthy();
    expect(JSON.parse(storage.getItem('trophe:workout-workspace:nik') ?? '{}').completedRetrospective).toEqual(seen[0]);
  });

  it('never reuses a retrospective key for a later live start', async () => {
    savePreparedRetrospectiveWorkout.mockResolvedValue({ ok: true, sessionId: 'history-session' });
    startLiveSession.mockResolvedValue({ ok: true, sessionId: 'live-session' });
    render(<ProviderHarness userId="nik" />);
    await screen.findByRole('button', { name: 'Create Push draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save retrospective workout' }));
    await screen.findByText('completed');
    const retrospectiveKey = savePreparedRetrospectiveWorkout.mock.calls[0][0].idempotencyKey;
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge completed summary' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    expect(startLiveSession.mock.calls[0][0].idempotencyKey).not.toBe(retrospectiveKey);
  });

  it('atomically replaces an acknowledged-by-intent completed summary with a repeated draft', async () => {
    savePreparedRetrospectiveWorkout.mockResolvedValue({ ok: true, sessionId: 'history-session' });
    render(<ProviderHarness userId="nik" />);
    await screen.findByRole('button', { name: 'Create Push draft' });
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save retrospective workout' }));
    await screen.findByText('completed');

    fireEvent.click(screen.getByRole('button', { name: 'Create coach draft' }));

    expect(screen.getByText('Draft · Not started')).toBeTruthy();
    expect(screen.getByText('Coach Push:bench-press-4x6-8,shoulder-press-3x8-10')).toBeTruthy();
  });

  it('coordinates the same recovered draft across two stale providers', async () => {
    const storage = new MemoryStorage();
    let draft = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength', updatedAt: 10 },
    });
    draft = workoutWorkspaceReducer(draft, { type: 'draft.updated', payload: { draft: {
      ...draft.draft!, exercises: [{ exerciseId: '11111111-1111-4111-8111-111111111111', targetSets: 3, targetReps: '8' }],
    } as never } });
    saveWorkspaceState(storage, 'nik', draft);
    startLiveSession.mockResolvedValue({ ok: false });

    render(<>
      <ProviderHarness userId="nik" storage={storage} />
      <ProviderHarness userId="nik" storage={storage} />
    </>);
    const starts = await screen.findAllByRole('button', { name: 'Start live workout' });
    fireEvent.click(starts[0]);
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    fireEvent.click(starts[1]);
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(2));

    expect(startLiveSession.mock.calls[1][0]).toEqual(startLiveSession.mock.calls[0][0]);
  });

  it('does not revive a completed session when a stale tab start is rejected', async () => {
    startLiveSession.mockResolvedValue({ ok: false });
    render(<ProviderHarness userId="nik" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Draft · Not started')).toBeTruthy();
    expect(screen.queryByText('Live')).toBeNull();
  });
});
