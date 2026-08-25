import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const persistence = vi.hoisted(() => ({
  createWorkoutSession: vi.fn(),
  startWorkoutSessionAtomic: vi.fn(),
  saveRetrospectiveWorkoutAtomic: vi.fn(),
  saveLiveWorkoutSetAtomic: vi.fn(),
  finishLiveWorkoutSessionAtomic: vi.fn(),
  updateLiveWorkoutStructureAtomic: vi.fn(),
  insertWorkoutSet: vi.fn(),
  insertWorkoutSets: vi.fn(),
  deleteWorkoutSet: vi.fn(),
  deleteLiveWorkoutSetAtomic: vi.fn(),
  deleteWorkoutSession: vi.fn(),
  deleteEmptyWorkoutSession: vi.fn(),
  finishWorkoutSession: vi.fn(),
  loadWorkoutSessionSets: vi.fn(),
  loadWorkoutSessionStructure: vi.fn(),
  resumeLegacyLiveWorkoutStructureAtomic: vi.fn(),
  loadPrMap: vi.fn(),
  loadWorkoutSessionPainFlags: vi.fn(),
  appendWorkoutSessionPainFlag: vi.fn(),
  updateWorkoutSupersetGroups: vi.fn(),
  deleteWorkoutSets: vi.fn(),
}));

vi.mock('@/components/workout/workout-persistence', () => persistence);

import {
  completeLiveSet,
  discardEmptyLiveSession,
  finishLiveSession,
  loadLiveSessionSets,
  loadLiveStructure,
  loadLivePrMap,
  loadLivePainFlags,
  appendLivePainFlag,
  updateLiveSupersets,
  removeLiveExerciseSets,
  recoverLiveExtraRows,
  recoverLiveSupersetLinks,
  removeAndNormalizeLiveExercises,
  saveRetrospectiveWorkout,
  startLiveSession,
  uncompleteLiveSet,
  updateLiveStructure,
  validateRetrospectiveWorkoutInput,
  validateLiveCardioMetrics,
  loadPendingLiveSets,
  persistPendingLiveSet,
  replayPendingLiveSets,
} from '@/lib/workout/live-session';

const idempotencyKey = '11111111-1111-4111-8111-111111111111';

const strengthDraft: WorkoutDraft = {
  version: 2,
  kind: 'strength',
  name: 'Push',
  templateId: null,
  updatedAt: 1,
  exercises: [{ exerciseId: 'bench', targetSets: 2, targetReps: '8' }],
};

const cardioDraft: WorkoutDraft = {
  version: 2,
  kind: 'cardio',
  name: 'Morning run',
  updatedAt: 1,
  activity: 'run',
  durationMinutes: 30,
  distanceKm: 5,
  effort: 7,
};

describe('live workout persistence boundary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('completes sets against the provider-owned session without creating another session', async () => {
    persistence.saveLiveWorkoutSetAtomic.mockResolvedValueOnce('set-1').mockResolvedValueOnce('set-2');

    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: true, setId: 'set-1' });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 2, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: true, setId: 'set-2' });

    expect(persistence.createWorkoutSession).not.toHaveBeenCalled();
    expect(persistence.saveLiveWorkoutSetAtomic).toHaveBeenNthCalledWith(1, {
      sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, rpe: null,
      isWarmup: false, isPr: false, supersetGroup: null,
    });
    expect(persistence.saveLiveWorkoutSetAtomic).toHaveBeenCalledTimes(2);
  });

  it('fails invalid live values closed before touching persistence', async () => {
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 0, weightKg: -1, reps: 8 })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, rpe: 11 })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: null })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: Number.POSITIVE_INFINITY, reps: 8 })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, isWarmup: 'false' as never })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, isPr: 1 as never })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, supersetGroup: 0 })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, supersetGroup: 1.5 })).resolves.toEqual({ ok: false });
    expect(persistence.saveLiveWorkoutSetAtomic).not.toHaveBeenCalled();
  });

  it('fails a thrown live insert closed instead of escaping the saving boundary', async () => {
    persistence.saveLiveWorkoutSetAtomic.mockRejectedValue(new Error('offline'));
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: false });
  });

  it('uncompletes an active set through the session-locking RPC and reloads sets', async () => {
    persistence.deleteLiveWorkoutSetAtomic.mockResolvedValue(true);
    persistence.loadWorkoutSessionSets.mockResolvedValue({ ok: true, sets: [{ id: 'set-1', exercise_id: 'bench' }] });
    await expect(uncompleteLiveSet('session-1', 'set-1')).resolves.toBe(true);
    await expect(loadLiveSessionSets('session-1')).resolves.toEqual({ ok: true, sets: [{ id: 'set-1', exercise_id: 'bench' }] });
    expect(persistence.deleteLiveWorkoutSetAtomic).toHaveBeenCalledWith('session-1', 'set-1');
  });

  it('loads PR baselines and durable pain flags through the live boundary', async () => {
    persistence.loadPrMap.mockResolvedValue({ bench: 100 });
    persistence.loadWorkoutSessionPainFlags.mockResolvedValue({ ok: true, flags: [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }] });
    await expect(loadLivePrMap('nik', ['bench'])).resolves.toEqual({ bench: 100 });
    await expect(loadLivePainFlags('session-1')).resolves.toEqual({ ok: true, flags: [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }] });
  });

  it('atomically appends pain by mutation id before the UI changes', async () => {
    const flags = [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }];
    persistence.appendWorkoutSessionPainFlag.mockResolvedValue({ ok: true, flags });
    persistence.updateWorkoutSupersetGroups.mockResolvedValue(true);
    persistence.deleteWorkoutSets.mockResolvedValue(true);
    await expect(appendLivePainFlag('session-1', idempotencyKey, flags[0])).resolves.toEqual({ ok: true, flags });
    await expect(updateLiveSupersets([{ id: 'set-1', superset_group: 1 }])).resolves.toBe(true);
    await expect(removeLiveExerciseSets(['set-1'])).resolves.toBe(true);
    expect(persistence.appendWorkoutSessionPainFlag).toHaveBeenCalledWith('session-1', idempotencyKey, flags[0]);
  });

  it('fails secondary live writes closed when the transport throws', async () => {
    persistence.deleteLiveWorkoutSetAtomic.mockRejectedValue(new Error('offline'));
    persistence.appendWorkoutSessionPainFlag.mockRejectedValue(new Error('offline'));
    persistence.updateWorkoutSupersetGroups.mockRejectedValue(new Error('offline'));
    persistence.deleteWorkoutSets.mockRejectedValue(new Error('offline'));
    persistence.deleteEmptyWorkoutSession.mockRejectedValue(new Error('offline'));

    await expect(uncompleteLiveSet('session-1', 'set-1')).resolves.toBe(false);
    await expect(appendLivePainFlag('session-1', idempotencyKey, { exercise_id: 'bench', body_part: 'shoulder', severity: 2 })).resolves.toEqual({ ok: false });
    await expect(updateLiveSupersets([{ id: 'set-1', superset_group: 1 }])).resolves.toBe(false);
    await expect(removeLiveExerciseSets(['set-1'])).resolves.toBe(false);
    await expect(discardEmptyLiveSession('session-1')).resolves.toBe(false);
  });

  it('retains the exact failed set envelope across refresh and replays it once', async () => {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (key) => values.get(key) ?? null,
      key: (index) => [...values.keys()][index] ?? null,
      removeItem: (key) => { values.delete(key); },
      setItem: (key, value) => { values.set(key, value); },
    };
    const pending = {
      sessionId: 'session-1', exerciseId: 'bench', setNumber: 2,
      weightKg: 62.5, reps: 7, rpe: 8.5, isWarmup: false, isPr: true,
      supersetGroup: 1,
    };

    expect(persistPendingLiveSet(pending, storage)).toBe(true);
    expect(loadPendingLiveSets('session-1', storage)).toEqual([pending]);

    const persist = vi.fn().mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, setId: 'set-2' });
    await expect(replayPendingLiveSets('session-1', persist, storage)).resolves.toEqual({
      saved: [], failed: [pending],
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(pending);
    expect(loadPendingLiveSets('session-1', storage)).toEqual([pending]);

    await expect(replayPendingLiveSets('session-1', persist, storage)).resolves.toEqual({
      saved: [{ input: pending, setId: 'set-2' }], failed: [],
    });
    expect(persist).toHaveBeenCalledTimes(2);
    expect(loadPendingLiveSets('session-1', storage)).toEqual([]);
  });

  it('returns safe recovery defaults when live reads throw', async () => {
    persistence.loadWorkoutSessionSets.mockRejectedValue(new Error('offline'));
    persistence.loadWorkoutSessionPainFlags.mockRejectedValue(new Error('offline'));
    persistence.loadPrMap.mockRejectedValue(new Error('offline'));
    await expect(loadLiveSessionSets('session-1')).resolves.toEqual({ ok: false });
    await expect(loadLivePainFlags('session-1')).resolves.toEqual({ ok: false });
    await expect(loadLivePrMap('nik', ['bench'])).resolves.toEqual({});
  });

  it('recovers adjacent superset links from persisted group ids after refresh', () => {
    expect(recoverLiveSupersetLinks(['bench', 'row', 'curl'], [
      { id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: 1, notes: null },
      { id: 'set-2', session_id: 'session-1', exercise_id: 'row', set_number: 1, weight_kg: 50, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: 1, notes: null },
      { id: 'set-3', session_id: 'session-1', exercise_id: 'curl', set_number: 1, weight_kg: 10, reps: 10, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null },
    ])).toEqual(['bench']);
  });

  it('recovers completed sets added beyond the draft target after refresh', () => {
    expect(recoverLiveExtraRows(
      [{ exerciseId: 'bench', targetSets: 1, targetReps: '8' }],
      [
        { id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null },
        { id: 'set-2', session_id: 'session-1', exercise_id: 'bench', set_number: 2, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: null, notes: null },
      ],
    )).toEqual([{ exerciseId: 'bench', setNumber: 2 }]);
  });

  it('does not invent extras when a persisted warm-up prefix shifts the working range', () => {
    const set = (id: string, setNumber: number, isWarmup: boolean) => ({ id, session_id: 'session-1', exercise_id: 'bench', set_number: setNumber, weight_kg: 60, reps: 8, rpe: null, is_warmup: isWarmup, is_pr: false, superset_group: null, notes: null });
    expect(recoverLiveExtraRows(
      [{ exerciseId: 'bench', targetSets: 1, targetReps: '8' }],
      [set('warmup-1', 1, true), set('warmup-2', 2, true), set('warmup-3', 3, true), set('work-4', 4, false), set('extra-5', 5, false)],
    )).toEqual([{ exerciseId: 'bench', setNumber: 5 }]);
  });

  it('does not clear recovery when finish verification fails', async () => {
    const onVerified = vi.fn();
    persistence.finishLiveWorkoutSessionAtomic.mockResolvedValue(false);

    const result = await finishLiveSession({
      sessionId: 'session-1', name: 'Push', durationMinutes: 42,
      painFlags: [], templateId: null,
    }, onVerified);

    expect(result).toEqual({ ok: false });
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('does not clear recovery when finish verification throws', async () => {
    const onVerified = vi.fn();
    persistence.finishLiveWorkoutSessionAtomic.mockRejectedValue(new Error('offline'));
    await expect(finishLiveSession({ sessionId: 'session-1', name: 'Push', durationMinutes: 42, painFlags: [] }, onVerified)).resolves.toEqual({ ok: false });
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('clears recovery only after the final session write is verified', async () => {
    const onVerified = vi.fn();
    persistence.finishLiveWorkoutSessionAtomic.mockResolvedValue(true);
    await expect(finishLiveSession({
      sessionId: 'session-1', name: 'Push', durationMinutes: 42,
      painFlags: [], templateId: null,
    }, onVerified)).resolves.toEqual({ ok: true });
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('discards an empty live row only after a verified delete', async () => {
    persistence.deleteEmptyWorkoutSession.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await expect(discardEmptyLiveSession('session-1')).resolves.toBe(false);
    await expect(discardEmptyLiveSession('session-1')).resolves.toBe(true);
  });

  it('replays the complete canonical live start envelope', async () => {
    persistence.startWorkoutSessionAtomic.mockResolvedValue('session-live');
    const input = {
      idempotencyKey,
      draftFingerprint: 'draft:push:1',
      sessionDate: '2026-08-24',
      name: 'Push', templateId: null, kind: 'strength' as const,
      liveStructure: [{ exerciseId: 'bench', targetSets: 2, targetReps: '8', supersetGroup: null }],
    };
    await expect(startLiveSession(input)).resolves.toEqual({ ok: true, sessionId: 'session-live' });
    await expect(startLiveSession(input)).resolves.toEqual({ ok: true, sessionId: 'session-live' });
    expect(persistence.startWorkoutSessionAtomic).toHaveBeenCalledTimes(2);
    expect(persistence.startWorkoutSessionAtomic).toHaveBeenCalledWith({
      ...input,
      liveStructure: [{ exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null }],
    });
  });

  it('creates retrospective cardio through one idempotent transactional RPC', async () => {
    persistence.saveRetrospectiveWorkoutAtomic.mockResolvedValue('session-cardio');

    await expect(saveRetrospectiveWorkout({ idempotencyKey, draft: cardioDraft, sets: [] })).resolves.toEqual({ ok: true, sessionId: 'session-cardio' });

    expect(persistence.saveRetrospectiveWorkoutAtomic).toHaveBeenCalledTimes(1);
    expect(persistence.createWorkoutSession).not.toHaveBeenCalled();
    expect(persistence.insertWorkoutSets).not.toHaveBeenCalled();
    expect(persistence.finishWorkoutSession).not.toHaveBeenCalled();
  });

  it('fails an atomic retrospective strength RPC without client-side partial cleanup', async () => {
    persistence.saveRetrospectiveWorkoutAtomic.mockResolvedValue(null);

    const result = await saveRetrospectiveWorkout({
      idempotencyKey, draft: strengthDraft, durationMinutes: 30,
      sets: [{ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false }],
    });

    expect(result).toEqual({ ok: false });
    expect(persistence.saveRetrospectiveWorkoutAtomic).toHaveBeenCalledTimes(1);
    expect(persistence.deleteWorkoutSession).not.toHaveBeenCalled();
  });

  it('returns false when the atomic retrospective transport throws', async () => {
    persistence.saveRetrospectiveWorkoutAtomic.mockRejectedValue(new Error('offline'));
    await expect(saveRetrospectiveWorkout({
      idempotencyKey, draft: strengthDraft, durationMinutes: 30,
      sets: [{ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false }],
    })).resolves.toEqual({ ok: false });
  });

  it('refuses empty retrospective strength before creating a history row', async () => {
    await expect(saveRetrospectiveWorkout({ idempotencyKey, draft: strengthDraft, sets: [], durationMinutes: 30 })).resolves.toEqual({ ok: false });
    expect(persistence.saveRetrospectiveWorkoutAtomic).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...strengthDraft, name: '   ' }, [{ exercise_id: 'bench', set_number: 1, weight_kg: 1, reps: 1, rpe: null, is_warmup: false, is_pr: false }], 30],
    [strengthDraft, [{ exercise_id: 'bench', set_number: 1, weight_kg: Number.NaN, reps: 8, rpe: null, is_warmup: false, is_pr: false }], 30],
    [strengthDraft, [{ exercise_id: 'bench', set_number: 1, weight_kg: -1, reps: 8, rpe: null, is_warmup: false, is_pr: false }], 30],
    [strengthDraft, [{ exercise_id: 'bench', set_number: 0, weight_kg: 1, reps: 8, rpe: null, is_warmup: false, is_pr: false }], 30],
    [strengthDraft, [{ exercise_id: 'bench', set_number: 1, weight_kg: 1, reps: 0, rpe: null, is_warmup: false, is_pr: false }], 30],
    [strengthDraft, [{ exercise_id: 'bench', set_number: 1, weight_kg: 1, reps: 8, rpe: 11, is_warmup: false, is_pr: false }], 30],
    [cardioDraft, [], 0],
    [{ ...cardioDraft, distanceKm: -1 }, [], 30],
    [{ ...cardioDraft, effort: Number.POSITIVE_INFINITY }, [], 30],
  ] as const)('rejects invalid retrospective numbers before the RPC', (draft, sets, durationMinutes) => {
    expect(validateRetrospectiveWorkoutInput({ idempotencyKey, draft: draft as WorkoutDraft, sets: sets as never, durationMinutes })).toBe(false);
  });

  it('persists live structure changes in one atomic boundary', async () => {
    persistence.updateLiveWorkoutStructureAtomic.mockResolvedValue({ ok: true, version: 2, structure: [
      { exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: 1 },
      { exercise_id: 'row', target_sets: 3, target_reps: '8', superset_group: 1 },
    ] });
    await expect(updateLiveStructure('session-1', [
      { exerciseId: 'bench', targetSets: 3, targetReps: '8', supersetGroup: 1 },
      { exerciseId: 'row', targetSets: 3, targetReps: '8', supersetGroup: 1 },
    ], 1, 'curl')).resolves.toMatchObject({ ok: true, version: 2 });
    expect(persistence.updateLiveWorkoutStructureAtomic).toHaveBeenCalledWith('session-1', 1, [
      { exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: 1 },
      { exercise_id: 'row', target_sets: 3, target_reps: '8', superset_group: 1 },
    ], 'curl');
  });

  it('loads canonical server structure fail closed', async () => {
    persistence.loadWorkoutSessionStructure.mockResolvedValueOnce({ ok: true, version: 3, structure: [
      { exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null },
    ] }).mockRejectedValueOnce(new Error('offline'));
    await expect(loadLiveStructure('session-1')).resolves.toMatchObject({ ok: true, version: 3 });
    await expect(loadLiveStructure('session-1')).resolves.toEqual({ ok: false });
  });

  it('bootstraps a verified legacy active session from its recovered draft', async () => {
    persistence.loadWorkoutSessionStructure.mockResolvedValue({ ok: false, legacy: true });
    persistence.resumeLegacyLiveWorkoutStructureAtomic.mockResolvedValue({ ok: true, version: 0, structure: [
      { exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null },
    ] });
    const loadWithLegacyDraft = loadLiveStructure as unknown as (
      sessionId: string,
      kind: 'strength',
      exercises: Array<{ exerciseId: string; targetSets: number; targetReps: string; supersetGroup: number | null }>,
    ) => Promise<unknown>;
    await expect(loadWithLegacyDraft('session-1', 'strength', [
      { exerciseId: 'bench', targetSets: 2, targetReps: '8', supersetGroup: null },
    ])).resolves.toMatchObject({ ok: true, version: 0 });
    expect(persistence.resumeLegacyLiveWorkoutStructureAtomic).toHaveBeenCalledWith('session-1', 'strength', [
      { exercise_id: 'bench', target_sets: 2, target_reps: '8', superset_group: null },
    ]);
  });

  it.each([
    [{ distanceKm: -1, effort: null }, false],
    [{ distanceKm: Number.NaN, effort: 5 }, false],
    [{ distanceKm: 5, effort: 0 }, false],
    [{ distanceKm: 5, effort: 11 }, false],
    [{ distanceKm: 0, effort: 7 }, true],
  ])('validates live cardio metrics at the domain boundary', (metrics, expected) => {
    expect(validateLiveCardioMetrics(metrics)).toBe(expected);
  });

  it('removes a live exercise while preserving and normalizing surviving superset chains', () => {
    expect(removeAndNormalizeLiveExercises([
      { exerciseId: 'bench', targetSets: 1, targetReps: '8', linkedBelow: true },
      { exerciseId: 'row', targetSets: 1, targetReps: '8', linkedBelow: true },
      { exerciseId: 'curl', targetSets: 1, targetReps: '8' },
      { exerciseId: 'press', targetSets: 1, targetReps: '8' },
    ], 'row')).toEqual([
      { exerciseId: 'bench', targetSets: 1, targetReps: '8', linkedBelow: true },
      { exerciseId: 'curl', targetSets: 1, targetReps: '8', linkedBelow: false },
      { exerciseId: 'press', targetSets: 1, targetReps: '8', linkedBelow: false },
    ]);
  });
});
