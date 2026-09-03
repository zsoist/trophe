import { describe, expect, it } from 'vitest';
import { clearWorkspaceState, loadWorkspaceState, saveWorkspaceState, workspaceStorageKey } from '@/lib/workout/workspace-storage';
import { createInitialWorkspaceState, retrospectivePayloadFingerprint, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

class MapStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('workout workspace recovery', () => {
  it('isolates recovery by user id', () => {
    const storage = new MapStorage();
    const draft = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Legs', kind: 'strength' },
    });
    saveWorkspaceState(storage, 'nik', draft);
    expect(loadWorkspaceState(storage, 'nik')?.draft?.name).toBe('Legs');
    expect(loadWorkspaceState(storage, 'daniel')).toBeNull();
    expect(workspaceStorageKey('nik')).not.toBe(workspaceStorageKey('daniel'));
  });

  it('rejects malformed and obsolete payloads', () => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({ version: 1, stage: 'live' }));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    expect(storage.getItem(workspaceStorageKey('nik'))).toBeNull();
  });

  it('clears a user recovery payload', () => {
    const storage = new MapStorage();
    saveWorkspaceState(storage, 'nik', createInitialWorkspaceState());
    clearWorkspaceState(storage, 'nik');
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });

  it('persists only the approved recovery fields', () => {
    const storage = new MapStorage();
    const state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Legs', kind: 'strength' },
    });
    (state.draft as typeof state.draft & { user?: unknown; exerciseRows?: unknown }).user = { id: 'secret' };
    (state.draft as typeof state.draft & { user?: unknown; exerciseRows?: unknown }).exerciseRows = [{ id: 'row' }];
    saveWorkspaceState(storage, 'nik', state);
    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    expect(stored.draft.user).toBeUndefined();
    expect(stored.draft.exerciseRows).toBeUndefined();
  });

  it('round-trips optional plan prescriptions while accepting recovered v2 drafts without them', () => {
    const storage = new MapStorage();
    const state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Upper', kind: 'strength' },
    });
    state.draft = {
      ...state.draft!,
      kind: 'strength',
      exercises: [{
        exerciseId: 'bench', targetSets: 3, targetReps: '8',
        restSeconds: 120, targetRpe: 8, notes: 'Pause on chest.',
      }],
    };
    saveWorkspaceState(storage, 'nik', state);
    expect(loadWorkspaceState(storage, 'nik')?.draft).toMatchObject({
      version: 2,
      exercises: [{ restSeconds: 120, targetRpe: 8, notes: 'Pause on chest.' }],
    });

    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    delete stored.draft.exercises[0].restSeconds;
    delete stored.draft.exercises[0].targetRpe;
    delete stored.draft.exercises[0].notes;
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(stored));
    expect(loadWorkspaceState(storage, 'nik')?.draft).toMatchObject({
      version: 2,
      exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8' }],
    });
  });

  it('persists only a valid client request UUID and recoverable superset links', () => {
    const storage = new MapStorage();
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Upper', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, { type: 'request.keyed', payload: { clientRequestId: '11111111-1111-4111-8111-111111111111' } });
    state = workoutWorkspaceReducer(state, { type: 'draft.updated', payload: { draft: {
      ...state.draft!, exercises: [{ exerciseId: 'bench', targetSets: 1, targetReps: '8', linkedBelow: true }],
    } as never } });
    saveWorkspaceState(storage, 'nik', state);
    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      draft: { exercises: [{ linkedBelow: true }] },
    });

    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    stored.clientRequestId = 'not-a-uuid';
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(stored));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });

  it('strictly persists a complete immutable live start envelope', () => {
    const storage = new MapStorage();
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Upper', kind: 'strength', updatedAt: 10 },
    });
    const startRequest = {
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      draftFingerprint: 'draft:upper:10',
      sessionDate: '2026-08-24',
      name: 'Upper', templateId: null, kind: 'strength' as const,
      liveStructure: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8', supersetGroup: null }],
    };
    state = workoutWorkspaceReducer(state, { type: 'request.prepared', payload: { startRequest } });
    saveWorkspaceState(storage, 'nik', state);
    expect(loadWorkspaceState(storage, 'nik')?.startRequest).toEqual(startRequest);

    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    stored.startRequest.sessionDate = 'tomorrow';
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(stored));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });

  it('strictly persists the exact retrospective request and rejects payload drift', () => {
    const storage = new MapStorage();
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Upper', kind: 'strength', updatedAt: 10 },
    });
    const payload = {
      sessionDate: '2026-08-24', kind: 'strength' as const, name: 'Upper', templateId: null,
      durationMinutes: 30, painFlags: [], activity: null, distanceKm: null, effort: null,
      sets: [{ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null }],
    };
    const retrospectiveRequest = {
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      payloadFingerprint: retrospectivePayloadFingerprint(payload),
      ...payload,
    };
    state = workoutWorkspaceReducer(state, { type: 'retrospective.prepared', payload: { retrospectiveRequest } });
    saveWorkspaceState(storage, 'nik', state);
    expect(loadWorkspaceState(storage, 'nik')?.retrospectiveRequest).toEqual(retrospectiveRequest);

    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    stored.retrospectiveRequest.sets[0].reps = 10;
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(stored));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });

  it('persists the immutable retrospective summary after canonical completion and remount', () => {
    const storage = new MapStorage();
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Run', kind: 'cardio', updatedAt: 10 },
    });
    const payload = {
      sessionDate: '2026-08-24', kind: 'cardio' as const, name: 'Run', templateId: null,
      durationMinutes: 30, painFlags: [], activity: 'run' as const, distanceKm: 5, effort: 7, sets: [],
    };
    const retrospectiveRequest = {
      idempotencyKey: '22222222-2222-4222-8222-222222222222',
      payloadFingerprint: retrospectivePayloadFingerprint(payload),
      ...payload,
    };
    state = workoutWorkspaceReducer(state, { type: 'retrospective.prepared', payload: { retrospectiveRequest } });
    state = workoutWorkspaceReducer(state, { type: 'retrospective.saved', payload: { sessionId: 'canonical-session' } });
    saveWorkspaceState(storage, 'nik', state);

    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({
      stage: 'completed',
      sessionId: 'canonical-session',
      completedRetrospective: retrospectiveRequest,
    });
  });

  it.each([
    ['live', null, 'session-1', { runningSince: 1, accumulatedMs: 0 }],
    ['paused', { version: 2, name: 'Legs', kind: 'strength', updatedAt: 0, exercises: [] }, null, null],
    ['completed', { version: 2, name: 'Legs', kind: 'strength', updatedAt: 0, exercises: [] }, 'session-1', null],
  ])('rejects impossible %s recovery combinations', (stage, draft, sessionId, clock) => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({ version: 2, stage, draft, sessionId, clock }));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    expect(storage.getItem(workspaceStorageKey('nik'))).toBeNull();
  });

  it.each([
    ['live', { runningSince: null, accumulatedMs: 0 }],
    ['paused', { runningSince: 1, accumulatedMs: 0 }],
    ['finishing', { runningSince: 1, accumulatedMs: 0 }],
    ['completed', { runningSince: 1, accumulatedMs: 0 }],
  ])('rejects %s recovery with the wrong clock mode', (stage, clock) => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2,
      stage,
      draft: { version: 2, name: 'Legs', kind: 'strength', updatedAt: 0, exercises: [] },
      sessionId: 'session-1',
      clock,
    }));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    expect(storage.getItem(workspaceStorageKey('nik'))).toBeNull();
  });

  it('accepts reducer-compatible running and paused clock modes', () => {
    const storage = new MapStorage();
    const draft = { version: 2, name: 'Legs', kind: 'strength', updatedAt: 0, exercises: [] };
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2, stage: 'live', draft, sessionId: 'session-1', clock: { runningSince: 1, accumulatedMs: 0 },
    }));
    expect(loadWorkspaceState(storage, 'nik')?.stage).toBe('live');
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2, stage: 'paused', draft, sessionId: 'session-1', clock: { runningSince: null, accumulatedMs: 1 },
    }));
    expect(loadWorkspaceState(storage, 'nik')?.stage).toBe('paused');
  });

  it('persists and validates the finishing origin discriminator', () => {
    const storage = new MapStorage();
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), { type: 'draft.created', payload: { name: 'Legs', kind: 'strength' } });
    state = workoutWorkspaceReducer(state, { type: 'live.started', payload: { sessionId: 'session-1', now: 1 } });
    state = workoutWorkspaceReducer(state, { type: 'live.finishing', payload: { now: 2 } });
    saveWorkspaceState(storage, 'nik', state);
    expect(loadWorkspaceState(storage, 'nik')?.finishingFrom).toBe('live');

    const stored = JSON.parse(storage.getItem(workspaceStorageKey('nik')) ?? '{}');
    stored.finishingFrom = 'draft';
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(stored));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });

  it.each([
    ['zero target sets', { draft: { exercises: [{ exerciseId: 'bench', targetSets: 0, targetReps: '8' }] } }],
    ['negative accumulated clock', { clock: { runningSince: null, accumulatedMs: -1 } }],
    ['untrimmed session id', { sessionId: ' session-1 ' }],
  ])('rejects invalid recovery values: %s', (_name, patch) => {
    const storage = new MapStorage();
    const base = {
      version: 2,
      stage: 'paused',
      draft: { version: 2, name: 'Run', kind: 'strength', updatedAt: 0, exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8' }] },
      sessionId: 'session-1',
      clock: { runningSince: null, accumulatedMs: 1000 },
    };
    const value = {
      ...base,
      ...patch,
      draft: 'draft' in patch ? { ...base.draft, ...patch.draft } : base.draft,
    };
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify(value));

    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    expect(storage.getItem(workspaceStorageKey('nik'))).toBeNull();
  });

  it.each([
    ['draft', null, null, null],
    ['review', null, null, null],
    ['live', 'session-1', { runningSince: 1, accumulatedMs: 0 }, null],
    ['paused', 'session-1', { runningSince: null, accumulatedMs: 1000 }, null],
    ['finishing', 'session-1', { runningSince: null, accumulatedMs: 1000 }, 'paused'],
    ['completed', 'session-1', { runningSince: null, accumulatedMs: 1000 }, null],
  ] as const)('normalizes a legacy fractional target in recoverable %s without losing the workspace', (stage, sessionId, clock, finishingFrom) => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2,
      stage,
      draft: { version: 2, name: 'Push', kind: 'strength', updatedAt: 0, exercises: [{ exerciseId: 'bench', targetSets: 2.5, targetReps: '8' }] },
      sessionId,
      clock,
      finishingFrom,
      clientRequestId: null,
      startRequest: null,
    }));

    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({
      stage,
      draft: { exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8' }] },
    });
    expect(storage.getItem(workspaceStorageKey('nik'))).not.toBeNull();
  });

  it('keeps a legacy fractional draft but invalidates only its impossible pending start envelope', () => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2,
      stage: 'review',
      draft: { version: 2, name: 'Push', kind: 'strength', updatedAt: 0, exercises: [{ exerciseId: 'bench', targetSets: 2.5, targetReps: '8' }] },
      sessionId: null,
      clock: null,
      finishingFrom: null,
      clientRequestId: '11111111-1111-4111-8111-111111111111',
      startRequest: {
        idempotencyKey: '11111111-1111-4111-8111-111111111111', draftFingerprint: 'legacy-fractional',
        sessionDate: '2026-08-24', name: 'Push', templateId: null, kind: 'strength',
        liveStructure: [{ exerciseId: 'bench', targetSets: 2.5, targetReps: '8', supersetGroup: null }],
      },
    }));

    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({
      stage: 'review',
      draft: { exercises: [{ targetSets: 3 }] },
      clientRequestId: null,
      startRequest: null,
    });
  });

  it('keeps a valid pending start envelope byte-exact while normalizing a mismatching legacy draft', () => {
    const storage = new MapStorage();
    const startRequest = {
      idempotencyKey: '11111111-1111-4111-8111-111111111111', draftFingerprint: 'immutable-valid-envelope',
      sessionDate: '2026-08-24', name: 'Push', templateId: null, kind: 'strength',
      liveStructure: [{ exerciseId: 'bench', targetSets: 2, targetReps: '8', supersetGroup: null }],
    };
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2, stage: 'review',
      draft: { version: 2, name: 'Push', kind: 'strength', updatedAt: 0, exercises: [{ exerciseId: 'bench', targetSets: 2.5, targetReps: '8' }] },
      sessionId: null, clock: null, finishingFrom: null,
      clientRequestId: startRequest.idempotencyKey, startRequest,
    }));

    expect(loadWorkspaceState(storage, 'nik')).toMatchObject({
      draft: { exercises: [{ targetSets: 3 }] },
      startRequest,
    });
  });

  it('normalizes the former blank-reps transient without discarding the recoverable workspace', () => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2,
      stage: 'paused',
      draft: { version: 2, name: 'Push', kind: 'strength', updatedAt: 0, exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '   ' }] },
      sessionId: 'session-1',
      clock: { runningSince: null, accumulatedMs: 1000 },
    }));
    expect(loadWorkspaceState(storage, 'nik')?.draft).toMatchObject({
      exercises: [{ exerciseId: 'bench', targetSets: 3, targetReps: '8-12' }],
    });
  });

  it.each([
    ['negative duration', -1, null],
    ['negative distance', 30, -0.1],
  ])('rejects cardio recovery with %s', (_name, durationMinutes, distanceKm) => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({
      version: 2,
      stage: 'paused',
      draft: { version: 2, name: 'Run', kind: 'cardio', updatedAt: 0, activity: 'run', durationMinutes, distanceKm, effort: null },
      sessionId: 'session-1',
      clock: { runningSince: null, accumulatedMs: 1000 },
    }));

    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
    expect(storage.getItem(workspaceStorageKey('nik'))).toBeNull();
  });
});
