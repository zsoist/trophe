import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  startWorkoutSessionAtomic: vi.fn(),
  loadWorkoutSessionStructure: vi.fn(),
  resumeLegacyLiveWorkoutStructureAtomic: vi.fn(),
  deleteEmptyWorkoutSession: vi.fn(), deleteLiveWorkoutSetAtomic: vi.fn(), appendWorkoutSessionPainFlag: vi.fn(),
  finishLiveWorkoutSessionAtomic: vi.fn(), loadWorkoutSessionSets: vi.fn(), loadPrMap: vi.fn(),
  loadWorkoutSessionPainFlags: vi.fn(), saveRetrospectiveWorkoutAtomic: vi.fn(), saveLiveWorkoutSetAtomic: vi.fn(),
  updateLiveWorkoutStructureAtomic: vi.fn(), updateWorkoutSupersetGroups: vi.fn(), deleteWorkoutSets: vi.fn(),
}));

vi.mock('@/components/workout/workout-persistence', () => persistence);

import {
  clearPendingLiveSets,
  loadLiveStructure,
  loadPendingLiveSets,
  persistPendingLiveSet,
  startLiveSession,
} from '@/lib/workout/live-session';

const request = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111', draftFingerprint: 'draft:push:1', sessionDate: '2026-09-03',
  name: 'Push', templateId: null, kind: 'strength' as const,
  liveStructure: [{ exerciseId: 'bench', targetSets: 2, targetReps: '8', supersetGroup: null }],
};

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

beforeEach(() => { vi.resetAllMocks(); });

describe('live start propagates the definitive/transient distinction', () => {
  it('returns the accepted session', async () => {
    persistence.startWorkoutSessionAtomic.mockResolvedValue({ ok: true, sessionId: 'session-live' });
    await expect(startLiveSession(request)).resolves.toEqual({ ok: true, sessionId: 'session-live' });
  });

  it('passes a server rejection through with its code', async () => {
    persistence.startWorkoutSessionAtomic.mockResolvedValue({ ok: false, kind: 'rejected', code: '42501' });
    await expect(startLiveSession(request)).resolves.toEqual({ ok: false, kind: 'rejected', code: '42501' });
  });

  it('keeps transport failures and thrown errors transient so the envelope is retried', async () => {
    persistence.startWorkoutSessionAtomic.mockResolvedValueOnce({ ok: false, kind: 'transient' }).mockRejectedValueOnce(new Error('offline'));
    await expect(startLiveSession(request)).resolves.toEqual({ ok: false, kind: 'transient' });
    await expect(startLiveSession(request)).resolves.toEqual({ ok: false, kind: 'transient' });
  });

  it('rejects an envelope the RPC could never accept before any transport', async () => {
    await expect(startLiveSession({ ...request, liveStructure: [] })).resolves.toMatchObject({ ok: false, kind: 'rejected' });
    expect(persistence.startWorkoutSessionAtomic).not.toHaveBeenCalled();
  });
});

describe('live structure recovery passes server truth through', () => {
  it('returns terminal and missing outcomes unchanged', async () => {
    persistence.loadWorkoutSessionStructure
      .mockResolvedValueOnce({ ok: true, terminal: true, completedAt: '2026-09-03T10:00:00.000Z', durationMinutes: 40 })
      .mockResolvedValueOnce({ ok: false, reason: 'missing' });
    await expect(loadLiveStructure('session-1')).resolves.toEqual({ ok: true, terminal: true, completedAt: '2026-09-03T10:00:00.000Z', durationMinutes: 40 });
    await expect(loadLiveStructure('session-1')).resolves.toEqual({ ok: false, reason: 'missing' });
  });

  it('reports a thrown read as transport so recovery fails closed', async () => {
    persistence.loadWorkoutSessionStructure.mockRejectedValueOnce(new Error('offline'));
    await expect(loadLiveStructure('session-1')).resolves.toEqual({ ok: false, reason: 'transport' });
  });

  it('marks a bootstrapped legacy session as non-terminal live structure', async () => {
    persistence.loadWorkoutSessionStructure.mockResolvedValue({ ok: false, reason: 'legacy', legacy: true });
    const structure = [{ exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null }];
    persistence.resumeLegacyLiveWorkoutStructureAtomic.mockResolvedValue({ ok: true, version: 0, structure });
    await expect(loadLiveStructure('session-1', 'strength', request.liveStructure)).resolves.toEqual({ ok: true, terminal: false, version: 0, structure });
  });
});

describe('pending live set cleanup', () => {
  it('clears every queued set for a session the server no longer accepts', () => {
    const storage = new MemoryStorage();
    persistPendingLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 }, storage);
    persistPendingLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 2, weightKg: 60, reps: 8 }, storage);
    persistPendingLiveSet({ sessionId: 'session-2', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 }, storage);
    expect(loadPendingLiveSets('session-1', storage)).toHaveLength(2);

    expect(clearPendingLiveSets('session-1', storage)).toBe(true);

    expect(loadPendingLiveSets('session-1', storage)).toEqual([]);
    expect(loadPendingLiveSets('session-2', storage)).toHaveLength(1);
  });
});
