// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
import { exerciseNamed, resetReview, reviewData, reviewTemplate, REVIEW_USER, reviewWorkspaceStorage } from '../../tools/anatomy/workout-review/store';
import { startWorkoutSessionAtomic, saveLiveWorkoutSetAtomicResult, finishLiveWorkoutSessionAtomic, loadWorkoutSessionStructure, deleteEmptyWorkoutSession, updateLiveWorkoutStructureAtomic } from '../../tools/anatomy/workout-review/persistence';
import { loadWorkoutAnalyticsData } from '../../tools/anatomy/workout-review/analytics';
import { supabase } from '../../tools/anatomy/workout-review/supabase';
import { localToday } from '../../lib/utils/dates';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '../../lib/workout/workspace-state';
import { loadWorkspaceState, saveWorkspaceState } from '../../lib/workout/workspace-storage';

describe('isolated full Workout design preview', () => {
  beforeEach(() => { sessionStorage.clear(); resetReview('empty'); });
  const start = () => startWorkoutSessionAtomic({ name: 'Review workout', idempotencyKey: '00000000-0000-4000-8000-000000000010', draftFingerprint: 'review-draft', kind: 'strength', sessionDate: localToday(), liveStructure: [{ exercise_id: exerciseNamed('Bench Press').id, target_sets: 3, target_reps: '8-12', superset_group: null }] });
  it('uses separate UUIDs and preserves source catalogue translations', () => {
    const template = reviewTemplate('Strength', ['Bench Press', 'Squat']);
    expect(template.exercises).toHaveLength(2);
    expect(template.exercises[0].exerciseId).toMatch(/^00000000-/);
    expect(exerciseNamed('Bench Press').name_el).toBeTruthy();
    expect(reviewData().sessions).toHaveLength(0);
  });
  it('runs start, set, finish and history against the same private records; a second start is idempotent', async () => {
    const created = await start(); expect(created.ok).toBe(true); if (!created.ok) return;
    expect(await start()).toEqual(created);
    expect(await finishLiveWorkoutSessionAtomic(created.sessionId, { name: 'Empty', durationMinutes: 1 })).toBe(false);
    const input = { sessionId: created.sessionId, exerciseId: exerciseNamed('Bench Press').id, setNumber: 1, weightKg: 40, reps: 10, rpe: 7, isWarmup: false, isPr: false, supersetGroup: null };
    const saved = await saveLiveWorkoutSetAtomicResult(input); expect(saved.ok).toBe(true);
    expect(await saveLiveWorkoutSetAtomicResult(input)).toEqual(saved);
    expect(reviewData().sets).toHaveLength(1);
    expect(await deleteEmptyWorkoutSession(created.sessionId)).toBe(false);
    expect(await finishLiveWorkoutSessionAtomic(created.sessionId, { name: 'Strength', durationMinutes: 20 })).toBe(true);
    expect(await loadWorkoutSessionStructure(created.sessionId)).toMatchObject({ ok: true, terminal: true });
    expect(await saveLiveWorkoutSetAtomicResult(input)).toMatchObject({ ok: false });
    const analytics = await loadWorkoutAnalyticsData();
    expect(analytics.sessions).toHaveLength(1); expect(analytics.sets[0].exercise.name).toBe('Bench Press');
    const history = await supabase.from('workout_sets').select('*, exercise:exercises(*)').in('session_id', [created.sessionId]);
    expect(history.data).toHaveLength(1);
  });
  it('retains plan prescriptions across recovery without touching production storage', () => {
    const state = workoutWorkspaceReducer(createInitialWorkspaceState(), { type: 'draft.created', payload: { name: 'Private draft', kind: 'strength', updatedAt: Date.now() } });
    saveWorkspaceState(reviewWorkspaceStorage, REVIEW_USER, state);
    expect(loadWorkspaceState(reviewWorkspaceStorage, REVIEW_USER)?.draft?.name).toBe('Private draft');
    expect(localStorage.getItem(`trophe:workout-workspace:${REVIEW_USER}`)).toBeNull();
  });
  it('rejects stale structure revisions and excludes unfinished sessions from history', async () => {
    const created = await start(); if (!created.ok) throw Error('start failed');
    expect(await updateLiveWorkoutStructureAtomic(created.sessionId, 1, [])).toEqual({ ok: false });
    expect((await loadWorkoutAnalyticsData()).sessions).toHaveLength(0);
    expect(await deleteEmptyWorkoutSession(created.sessionId)).toBe(true);
  });
});
