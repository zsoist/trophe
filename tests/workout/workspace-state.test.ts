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
});
