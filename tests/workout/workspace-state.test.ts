import { describe, expect, it } from 'vitest';
import {
  createInitialWorkspaceState,
  elapsedActiveMs,
  workoutWorkspaceReducer,
} from '@/lib/workout/workspace-state';

describe('workout workspace state', () => {
  it('builds a draft without starting a session', () => {
    const state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created',
      payload: { name: 'Push', kind: 'strength', templateKey: 'push' },
    });
    expect(state.stage).toBe('draft');
    expect(state.sessionId).toBeNull();
    expect(state.clock).toBeNull();
    expect(state.clientRequestId).toBeNull();
  });

  it('returns Review to the editable draft without losing its work', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, { type: 'draft.updated', payload: { draft: {
      ...state.draft!,
      exercises: [{ exerciseId: 'bench', targetSets: 4, targetReps: '6-8' }],
    } as never } });
    state = workoutWorkspaceReducer(state, { type: 'draft.reviewed' });

    const reopened = workoutWorkspaceReducer(state, { type: 'draft.reopened' });

    expect(reopened.stage).toBe('draft');
    expect(reopened.draft).toEqual(state.draft);
  });

  it('persists an idempotency key before the live request and carries it into recovery', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, { type: 'request.keyed', payload: { clientRequestId: '11111111-1111-4111-8111-111111111111' } });
    state = workoutWorkspaceReducer(state, { type: 'live.started', payload: { sessionId: 'session-1', now: 1 } });
    expect(state.clientRequestId).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('freezes the complete canonical start request before the network call', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength', updatedAt: 10 },
    });
    const startRequest = {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      draftFingerprint: 'draft:push:10',
      sessionDate: '2026-08-24',
      name: 'Push', templateId: null, kind: 'strength' as const,
      liveStructure: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8', supersetGroup: null }],
    };
    state = workoutWorkspaceReducer(state, { type: 'request.prepared', payload: { startRequest } });
    expect(state.startRequest).toEqual(startRequest);
    expect(state.clientRequestId).toBe(startRequest.idempotencyKey);
    expect(() => workoutWorkspaceReducer(state, { type: 'draft.updated', payload: { draft: { ...state.draft!, name: 'Edited' } as never } })).toThrow(/pending/i);
    expect(() => workoutWorkspaceReducer(state, { type: 'draft.reviewed' })).toThrow(/pending/i);
  });

  it('updates recoverable live cardio metrics and strength structure', () => {
    let cardio = workoutWorkspaceReducer(createInitialWorkspaceState(), { type: 'draft.created', payload: { name: 'Run', kind: 'cardio' } });
    cardio = workoutWorkspaceReducer(cardio, { type: 'live.started', payload: { sessionId: 'session-1', now: 1 } });
    cardio = workoutWorkspaceReducer(cardio, { type: 'live.draftUpdated', payload: { draft: { ...cardio.draft!, distanceKm: 5, effort: 7 } as never } });
    expect(cardio.draft).toMatchObject({ distanceKm: 5, effort: 7 });

    let strength = workoutWorkspaceReducer(createInitialWorkspaceState(), { type: 'draft.created', payload: { name: 'Upper', kind: 'strength' } });
    strength = workoutWorkspaceReducer(strength, { type: 'draft.updated', payload: { draft: { ...strength.draft!, exercises: [
      { exerciseId: 'bench', targetSets: 1, targetReps: '8', linkedBelow: true },
      { exerciseId: 'row', targetSets: 1, targetReps: '8' },
    ] } as never } });
    strength = workoutWorkspaceReducer(strength, { type: 'live.started', payload: { sessionId: 'session-2', now: 1 } });
    expect((strength.draft as { exercises: Array<{ linkedBelow?: boolean }> }).exercises[0].linkedBelow).toBe(true);
  });

  it('starts, pauses, and resumes active time without counting paused time', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, {
      type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 },
    });
    state = workoutWorkspaceReducer(state, { type: 'live.paused', payload: { now: 11_000 } });
    expect(elapsedActiveMs(state.clock, 31_000)).toBe(10_000);
    state = workoutWorkspaceReducer(state, { type: 'live.resumed', payload: { now: 41_000 } });
    expect(elapsedActiveMs(state.clock, 46_000)).toBe(15_000);
  });

  it('requires a session id before entering live state', () => {
    const initial = createInitialWorkspaceState();
    expect(() => workoutWorkspaceReducer(initial, {
      type: 'live.started', payload: { sessionId: '', now: 1_000 },
    })).toThrow(/session id/i);
  });

  it('preserves recovery through completion and freezes active time until acknowledgement', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, {
      type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 },
    });
    state = workoutWorkspaceReducer(state, { type: 'live.paused', payload: { now: 11_000 } });
    state = workoutWorkspaceReducer(state, { type: 'live.resumed', payload: { now: 41_000 } });
    state = workoutWorkspaceReducer(state, { type: 'live.finishing', payload: { now: 46_000 } });
    expect(state.stage).toBe('finishing');
    expect(state.draft).not.toBeNull();
    expect(state.sessionId).toBe('session-1');
    expect(elapsedActiveMs(state.clock, 100_000)).toBe(15_000);

    state = workoutWorkspaceReducer(state, { type: 'live.completed' });
    expect(state.stage).toBe('completed');
    expect(state.draft).not.toBeNull();
    expect(state.sessionId).toBe('session-1');
    expect(elapsedActiveMs(state.clock, 200_000)).toBe(15_000);

    state = workoutWorkspaceReducer(state, { type: 'completed.acknowledged' });
    expect(state.draft).toBeNull();
    expect(state.sessionId).toBeNull();
    expect(state.clock).toBeNull();
  });

  it.each(['live', 'paused'] as const)('cancels finishing back to the originating %s clock mode', (origin) => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, { type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 } });
    if (origin === 'paused') state = workoutWorkspaceReducer(state, { type: 'live.paused', payload: { now: 11_000 } });
    state = workoutWorkspaceReducer(state, { type: 'live.finishing', payload: { now: 21_000 } });
    expect(state.finishingFrom).toBe(origin);
    state = workoutWorkspaceReducer(state, { type: 'live.finishCancelled', payload: { now: 31_000 } });
    expect(state.stage).toBe(origin);
    expect(state.clock?.runningSince === null).toBe(origin === 'paused');
    expect(state.finishingFrom).toBeNull();
  });
});
