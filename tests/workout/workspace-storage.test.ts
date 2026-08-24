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
});
