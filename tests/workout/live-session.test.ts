import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const persistence = vi.hoisted(() => ({
  createWorkoutSession: vi.fn(),
  insertWorkoutSet: vi.fn(),
  insertWorkoutSets: vi.fn(),
  deleteWorkoutSet: vi.fn(),
  deleteWorkoutSession: vi.fn(),
  deleteEmptyWorkoutSession: vi.fn(),
  finishWorkoutSession: vi.fn(),
  loadWorkoutSessionSets: vi.fn(),
  loadPrMap: vi.fn(),
  loadWorkoutSessionPainFlags: vi.fn(),
  updateWorkoutSessionPainFlags: vi.fn(),
  updateWorkoutSupersetGroups: vi.fn(),
  deleteWorkoutSets: vi.fn(),
}));

vi.mock('@/components/workout/workout-persistence', () => persistence);

import {
  completeLiveSet,
  discardEmptyLiveSession,
  finishLiveSession,
  loadLiveSessionSets,
  loadLivePrMap,
  loadLivePainFlags,
  saveLivePainFlags,
  updateLiveSupersets,
  removeLiveExerciseSets,
  recoverLiveExtraRows,
  recoverLiveSupersetLinks,
  saveRetrospectiveWorkout,
  uncompleteLiveSet,
} from '@/lib/workout/live-session';

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
    persistence.insertWorkoutSet.mockResolvedValueOnce('set-1').mockResolvedValueOnce('set-2');

    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: true, setId: 'set-1' });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 2, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: true, setId: 'set-2' });

    expect(persistence.createWorkoutSession).not.toHaveBeenCalled();
    expect(persistence.insertWorkoutSet).toHaveBeenNthCalledWith(1, 'session-1', {
      exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null,
      is_warmup: false, is_pr: false, superset_group: null,
    });
    expect(persistence.insertWorkoutSet).toHaveBeenCalledTimes(2);
  });

  it('fails invalid live values closed before touching persistence', async () => {
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 0, weightKg: -1, reps: 8 })).resolves.toEqual({ ok: false });
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8, rpe: 11 })).resolves.toEqual({ ok: false });
    expect(persistence.insertWorkoutSet).not.toHaveBeenCalled();
  });

  it('fails a thrown live insert closed instead of escaping the saving boundary', async () => {
    persistence.insertWorkoutSet.mockRejectedValue(new Error('offline'));
    await expect(completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 })).resolves.toEqual({ ok: false });
  });

  it('uncompletes and reloads sets through verified helpers', async () => {
    persistence.deleteWorkoutSet.mockResolvedValue(true);
    persistence.loadWorkoutSessionSets.mockResolvedValue([{ id: 'set-1', exercise_id: 'bench' }]);
    await expect(uncompleteLiveSet('set-1')).resolves.toBe(true);
    await expect(loadLiveSessionSets('session-1')).resolves.toEqual([{ id: 'set-1', exercise_id: 'bench' }]);
  });

  it('loads PR baselines and durable pain flags through the live boundary', async () => {
    persistence.loadPrMap.mockResolvedValue({ bench: 100 });
    persistence.loadWorkoutSessionPainFlags.mockResolvedValue([{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }]);
    await expect(loadLivePrMap('nik', ['bench'])).resolves.toEqual({ bench: 100 });
    await expect(loadLivePainFlags('session-1')).resolves.toEqual([{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }]);
  });

  it('verifies pain, superset, and removed-exercise writes before the UI changes', async () => {
    const flags = [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }];
    persistence.updateWorkoutSessionPainFlags.mockResolvedValue(true);
    persistence.updateWorkoutSupersetGroups.mockResolvedValue(true);
    persistence.deleteWorkoutSets.mockResolvedValue(true);
    await expect(saveLivePainFlags('session-1', flags)).resolves.toBe(true);
    await expect(updateLiveSupersets([{ id: 'set-1', superset_group: 1 }])).resolves.toBe(true);
    await expect(removeLiveExerciseSets(['set-1'])).resolves.toBe(true);
    expect(persistence.updateWorkoutSessionPainFlags).toHaveBeenCalledWith('session-1', flags);
  });

  it('fails secondary live writes closed when the transport throws', async () => {
    persistence.deleteWorkoutSet.mockRejectedValue(new Error('offline'));
    persistence.updateWorkoutSessionPainFlags.mockRejectedValue(new Error('offline'));
    persistence.updateWorkoutSupersetGroups.mockRejectedValue(new Error('offline'));
    persistence.deleteWorkoutSets.mockRejectedValue(new Error('offline'));
    persistence.deleteEmptyWorkoutSession.mockRejectedValue(new Error('offline'));

    await expect(uncompleteLiveSet('set-1')).resolves.toBe(false);
    await expect(saveLivePainFlags('session-1', [])).resolves.toBe(false);
    await expect(updateLiveSupersets([{ id: 'set-1', superset_group: 1 }])).resolves.toBe(false);
    await expect(removeLiveExerciseSets(['set-1'])).resolves.toBe(false);
    await expect(discardEmptyLiveSession('session-1')).resolves.toBe(false);
  });

  it('returns safe recovery defaults when live reads throw', async () => {
    persistence.loadWorkoutSessionSets.mockRejectedValue(new Error('offline'));
    persistence.loadWorkoutSessionPainFlags.mockRejectedValue(new Error('offline'));
    persistence.loadPrMap.mockRejectedValue(new Error('offline'));
    await expect(loadLiveSessionSets('session-1')).resolves.toEqual([]);
    await expect(loadLivePainFlags('session-1')).resolves.toEqual([]);
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

  it('does not clear recovery when finish verification fails', async () => {
    const onVerified = vi.fn();
    persistence.finishWorkoutSession.mockResolvedValue(false);

    const result = await finishLiveSession({
      sessionId: 'session-1', name: 'Push', durationMinutes: 42,
      painFlags: [], templateId: null,
    }, onVerified);

    expect(result).toEqual({ ok: false });
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('does not clear recovery when finish verification throws', async () => {
    const onVerified = vi.fn();
    persistence.finishWorkoutSession.mockRejectedValue(new Error('offline'));
    await expect(finishLiveSession({ sessionId: 'session-1', name: 'Push', durationMinutes: 42, painFlags: [] }, onVerified)).resolves.toEqual({ ok: false });
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('clears recovery only after the final session write is verified', async () => {
    const onVerified = vi.fn();
    persistence.finishWorkoutSession.mockResolvedValue(true);
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

  it('creates retrospective cardio only after save and persists its details', async () => {
    persistence.createWorkoutSession.mockResolvedValue('session-cardio');
    persistence.finishWorkoutSession.mockResolvedValue(true);

    await expect(saveRetrospectiveWorkout({ userId: 'nik', draft: cardioDraft, sets: [] })).resolves.toEqual({ ok: true, sessionId: 'session-cardio' });

    expect(persistence.createWorkoutSession).toHaveBeenCalledTimes(1);
    expect(persistence.createWorkoutSession).toHaveBeenCalledWith('nik', 'Morning run', null);
    expect(persistence.finishWorkoutSession).toHaveBeenCalledWith('session-cardio', {
      name: 'Morning run', duration_minutes: 30, pain_flags: [], template_id: null,
      notes: 'Activity: run · Distance: 5 km · Effort: 7/10',
    });
  });

  it('rolls back a failed retrospective strength save so it cannot leak an empty session', async () => {
    persistence.createWorkoutSession.mockResolvedValue('session-strength');
    persistence.insertWorkoutSets.mockResolvedValue(false);
    persistence.deleteWorkoutSession.mockResolvedValue(true);

    const result = await saveRetrospectiveWorkout({
      userId: 'nik', draft: strengthDraft,
      sets: [{ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false }],
    });

    expect(result).toEqual({ ok: false });
    expect(persistence.createWorkoutSession).toHaveBeenCalledTimes(1);
    expect(persistence.finishWorkoutSession).not.toHaveBeenCalled();
    expect(persistence.deleteWorkoutSession).toHaveBeenCalledWith('session-strength');
  });

  it('attempts rollback when a retrospective write throws', async () => {
    persistence.createWorkoutSession.mockResolvedValue('session-strength');
    persistence.insertWorkoutSets.mockRejectedValue(new Error('offline'));
    persistence.deleteWorkoutSession.mockResolvedValue(true);
    await expect(saveRetrospectiveWorkout({
      userId: 'nik', draft: strengthDraft,
      sets: [{ exercise_id: 'bench', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false }],
    })).resolves.toEqual({ ok: false });
    expect(persistence.deleteWorkoutSession).toHaveBeenCalledWith('session-strength');
  });

  it('refuses empty retrospective strength before creating a history row', async () => {
    await expect(saveRetrospectiveWorkout({ userId: 'nik', draft: strengthDraft, sets: [] })).resolves.toEqual({ ok: false });
    expect(persistence.createWorkoutSession).not.toHaveBeenCalled();
  });
});
