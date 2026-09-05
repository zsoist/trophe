// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { startLiveSession } = vi.hoisted(() => ({ startLiveSession: vi.fn() }));

vi.mock('@/lib/workout/live-session', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/live-session')>();
  return { ...actual, startLiveSession };
});
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('@/lib/utils/dates', () => ({ localToday: () => '2026-09-03' }));

import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { loadWorkspaceState, saveWorkspaceState, type WorkspaceStorage } from '@/lib/workout/workspace-storage';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

class MemoryStorage implements WorkspaceStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function Controls() {
  const workspace = useWorkoutWorkspace();
  return (
    <>
      <p data-testid="stage">{workspace.state.stage}</p>
      <p data-testid="pinned">{workspace.state.startRequest ? workspace.state.startRequest.idempotencyKey : 'none'}</p>
      <p data-testid="rejection">{workspace.startRejection ? workspace.startRejection.code : 'none'}</p>
      <p data-testid="blocked">{workspace.startBlocked ? workspace.startBlocked.code : 'none'}</p>
      <p data-testid="reconciliation">{workspace.liveReconciliation?.outcome ?? 'none'}</p>
      <button onClick={() => workspace.createDraft({ name: 'Push', kind: 'strength' })}>Create Push draft</button>
      <button onClick={() => workspace.addDraftExercise('bench-press')}>Add Bench Press</button>
      <button onClick={() => void workspace.startLive()}>Start live workout</button>
      <button onClick={() => workspace.returnToDraft()}>Return to draft</button>
      <button onClick={() => workspace.goToReview()}>Review draft</button>
      <button onClick={() => workspace.reconcileLive({ outcome: 'completed', durationMinutes: 40 })}>Reconcile completed</button>
      <button onClick={() => workspace.reconcileLive({ outcome: 'missing' })}>Reconcile missing</button>
      <button onClick={() => workspace.acknowledgeCompleted()}>Acknowledge</button>
    </>
  );
}

function liveStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  let state = workoutWorkspaceReducer(createInitialWorkspaceState(), { type: 'draft.created', payload: { name: 'Push', kind: 'strength', updatedAt: 10 } });
  state = workoutWorkspaceReducer(state, { type: 'draft.updated', payload: { draft: { ...state.draft!, exercises: [{ exerciseId: '11111111-1111-4111-8111-111111111111', targetSets: 3, targetReps: '8' }] } as never } });
  state = workoutWorkspaceReducer(state, { type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 } });
  saveWorkspaceState(storage, 'nik', state);
  return storage;
}

afterEach(() => { cleanup(); startLiveSession.mockReset(); });

describe('WorkoutWorkspaceProvider definitive start rejection', () => {
  it('releases the pinned envelope and exposes the refusal, then clears it on return to draft', async () => {
    const storage = new MemoryStorage();
    startLiveSession.mockResolvedValue({ ok: false, kind: 'rejected', code: '22023' });
    render(<WorkoutWorkspaceProvider userId="nik" storage={storage}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(screen.getByTestId('rejection').textContent).toBe('22023'));
    expect(screen.getByTestId('stage').textContent).toBe('review');
    expect(screen.getByTestId('pinned').textContent).toBe('none');
    expect(loadWorkspaceState(storage, 'nik')?.startRequest ?? null).toBeNull();
    expect(loadWorkspaceState(storage, 'nik')?.clientRequestId ?? null).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to draft' }));
    expect(screen.getByTestId('stage').textContent).toBe('draft');
    expect(screen.getByTestId('rejection').textContent).toBe('none');
  });

  it('never reuses a rejected idempotency key for the next start', async () => {
    startLiveSession.mockResolvedValueOnce({ ok: false, kind: 'rejected', code: '22023' }).mockResolvedValueOnce({ ok: true, sessionId: 'session-2' });
    render(<WorkoutWorkspaceProvider userId="nik" storage={new MemoryStorage()}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByTestId('rejection').textContent).toBe('22023'));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(screen.getByTestId('stage').textContent).toBe('live'));
    expect(startLiveSession).toHaveBeenCalledTimes(2);
    expect(startLiveSession.mock.calls[1][0].idempotencyKey).not.toBe(startLiveSession.mock.calls[0][0].idempotencyKey);
    expect(screen.getByTestId('rejection').textContent).toBe('none');
  });

  it('keeps the exact envelope pinned after a transient failure', async () => {
    const storage = new MemoryStorage();
    startLiveSession.mockResolvedValue({ ok: false, kind: 'transient' });
    render(<WorkoutWorkspaceProvider userId="nik" storage={storage}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
    await waitFor(() => expect(startLiveSession).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('pinned').textContent).not.toBe('none'));
    expect(screen.getByTestId('rejection').textContent).toBe('none');
    expect(loadWorkspaceState(storage, 'nik')?.startRequest?.idempotencyKey).toBe(screen.getByTestId('pinned').textContent);
  });

  it('keeps a deterministic configuration failure pinned and exposes it for repair', async () => {
    const storage = new MemoryStorage();
    startLiveSession.mockResolvedValue({ ok: false, kind: 'blocked', code: 'PGRST202' });
    render(<WorkoutWorkspaceProvider userId="nik" storage={storage}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create Push draft' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(screen.getByTestId('blocked').textContent).toBe('PGRST202'));
    expect(screen.getByTestId('pinned').textContent).not.toBe('none');
    expect(screen.getByTestId('rejection').textContent).toBe('none');
    expect(loadWorkspaceState(storage, 'nik')?.startRequest?.idempotencyKey).toBe(screen.getByTestId('pinned').textContent);
  });
});

describe('WorkoutWorkspaceProvider live reconciliation', () => {
  it('moves a recovered live session to completed and marks its server origin until acknowledged', async () => {
    const storage = liveStorage();
    render(<WorkoutWorkspaceProvider userId="nik" storage={storage}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByTestId('stage').textContent).toBe('live'));
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile completed' }));
    expect(screen.getByTestId('stage').textContent).toBe('completed');
    expect(screen.getByTestId('reconciliation').textContent).toBe('completed');
    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({ stage: 'completed', clock: { runningSince: null, accumulatedMs: 40 * 60_000 } });
    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(screen.getByTestId('stage').textContent).toBe('home');
    expect(screen.getByTestId('reconciliation').textContent).toBe('none');
  });

  it('clears the missing session locally and keeps a home notice until the next draft', async () => {
    const storage = liveStorage();
    render(<WorkoutWorkspaceProvider userId="nik" storage={storage}><Controls /></WorkoutWorkspaceProvider>);
    await waitFor(() => expect(screen.getByTestId('stage').textContent).toBe('live'));
    fireEvent.click(screen.getByRole('button', { name: 'Reconcile missing' }));
    expect(screen.getByTestId('stage').textContent).toBe('home');
    expect(screen.getByTestId('reconciliation').textContent).toBe('missing');
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
    expect(screen.getByTestId('reconciliation').textContent).toBe('none');
  });
});
