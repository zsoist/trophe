import { describe, expect, it } from 'vitest';
import { clearWorkspaceState, loadWorkspaceState, saveWorkspaceState, workspaceStorageKey } from '@/lib/workout/workspace-storage';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

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
});
