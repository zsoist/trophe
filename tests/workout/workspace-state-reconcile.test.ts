import { describe, expect, it } from 'vitest';
import {
  createInitialWorkspaceState,
  workoutWorkspaceReducer,
  type WorkoutWorkspaceState,
} from '@/lib/workout/workspace-state';

const startRequest = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111',
  draftFingerprint: 'draft:push:10', sessionDate: '2026-09-03', name: 'Push',
  templateId: null, kind: 'strength' as const,
  liveStructure: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8', supersetGroup: null }],
};

function liveState(): WorkoutWorkspaceState {
  let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
    type: 'draft.created', payload: { name: 'Push', kind: 'strength', updatedAt: 10 },
  });
  state = workoutWorkspaceReducer(state, { type: 'request.prepared', payload: { startRequest } });
  return workoutWorkspaceReducer(state, { type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 } });
}

describe('workout workspace reconciliation with server truth', () => {
  it('moves a recovered live session to completed when the server row is terminal', () => {
    const reconciled = workoutWorkspaceReducer(liveState(), {
      type: 'live.reconciled', payload: { outcome: 'completed', now: 61_000, durationMinutes: 42 },
    });
    expect(reconciled).toMatchObject({ stage: 'completed', sessionId: 'session-1', finishingFrom: null });
    // The server duration is the authoritative summary value when it exists.
    expect(reconciled.clock).toEqual({ runningSince: null, accumulatedMs: 42 * 60_000 });
    expect(reconciled.draft).toEqual(liveState().draft);
  });

  it('freezes the local clock when the terminal row has no duration', () => {
    const reconciled = workoutWorkspaceReducer(liveState(), {
      type: 'live.reconciled', payload: { outcome: 'completed', now: 61_000, durationMinutes: null },
    });
    expect(reconciled.stage).toBe('completed');
    expect(reconciled.clock).toEqual({ runningSince: null, accumulatedMs: 60_000 });
  });

  it.each(['paused', 'finishing'] as const)('reconciles a %s session to completed', (stage) => {
    let state = liveState();
    state = workoutWorkspaceReducer(state, { type: 'live.paused', payload: { now: 31_000 } });
    if (stage === 'finishing') state = workoutWorkspaceReducer(state, { type: 'live.finishing', payload: { now: 32_000 } });
    const reconciled = workoutWorkspaceReducer(state, {
      type: 'live.reconciled', payload: { outcome: 'completed', now: 90_000, durationMinutes: null },
    });
    expect(reconciled.stage).toBe('completed');
    expect(reconciled.finishingFrom).toBeNull();
    expect(reconciled.clock).toEqual({ runningSince: null, accumulatedMs: 30_000 });
  });

  it('returns to an empty home when the server row is missing', () => {
    const reconciled = workoutWorkspaceReducer(liveState(), { type: 'live.reconciled', payload: { outcome: 'missing' } });
    expect(reconciled).toEqual(createInitialWorkspaceState());
  });

  it.each(['home', 'draft', 'review', 'completed'] as const)('refuses to reconcile from %s', (stage) => {
    let state: WorkoutWorkspaceState = createInitialWorkspaceState();
    if (stage !== 'home') state = workoutWorkspaceReducer(state, { type: 'draft.created', payload: { name: 'Push', kind: 'strength' } });
    if (stage === 'review') state = workoutWorkspaceReducer(state, { type: 'draft.reviewed' });
    if (stage === 'completed') {
      state = workoutWorkspaceReducer(liveState(), { type: 'live.finishing', payload: { now: 2_000 } });
      state = workoutWorkspaceReducer(state, { type: 'live.completed' });
    }
    expect(() => workoutWorkspaceReducer(state, { type: 'live.reconciled', payload: { outcome: 'missing' } }))
      .toThrow(/Cannot reconcile/);
  });
});

describe('workout workspace definitive start rejection', () => {
  it('releases the pinned start envelope after a definitive server rejection', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength', updatedAt: 10 },
    });
    state = workoutWorkspaceReducer(state, { type: 'draft.reviewed' });
    state = workoutWorkspaceReducer(state, { type: 'request.prepared', payload: { startRequest } });

    const released = workoutWorkspaceReducer(state, { type: 'request.rejected' });

    expect(released).toMatchObject({ stage: 'review', startRequest: null, clientRequestId: null });
    expect(released.draft).toEqual(state.draft);
    // A later attempt must not silently reuse the rejected key for a new payload.
    const reprepared = workoutWorkspaceReducer(released, {
      type: 'request.prepared',
      payload: { startRequest: { ...startRequest, idempotencyKey: '22222222-2222-4222-8222-222222222222', draftFingerprint: 'draft:push:11' } },
    });
    expect(reprepared.startRequest?.idempotencyKey).toBe('22222222-2222-4222-8222-222222222222');
  });

  it('refuses to release a start envelope that was never prepared or already accepted', () => {
    const draft = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    expect(() => workoutWorkspaceReducer(draft, { type: 'request.rejected' })).toThrow(/No pending start request/);
    expect(() => workoutWorkspaceReducer(liveState(), { type: 'request.rejected' })).toThrow(/Cannot reject a start request from live/);
  });
});
