import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), deleteRows: vi.fn(), updateRows: vi.fn(), eq: vi.fn(), select: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from, rpc: db.rpc } }));

import {
  deleteEmptyWorkoutSession,
  deleteWorkoutSession,
  appendWorkoutSessionPainFlag,
  finishLiveWorkoutSessionAtomic,
  loadWorkoutSessionPainFlags,
  loadWorkoutSessionSets,
  loadWorkoutSessionStructure,
  resumeLegacyLiveWorkoutStructureAtomic,
  saveRetrospectiveWorkoutAtomic,
  saveLiveWorkoutSetAtomic,
  startWorkoutSessionAtomic,
  updateLiveWorkoutStructureAtomic,
} from '@/components/workout/workout-persistence';

describe('workout persistence live-session helpers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.from.mockReturnValue({ delete: db.deleteRows, select: db.select, update: db.updateRows });
    db.deleteRows.mockReturnValue({ eq: db.eq });
    db.eq.mockReturnValue({ select: db.select, order: db.order });
    db.select.mockReturnValue({ eq: db.eq });
    db.updateRows.mockReturnValue({ eq: db.eq });
  });

  it('loads and verifies live pain flags on the provider-owned session', async () => {
    const flags = [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }];
    db.eq.mockReturnValueOnce({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValueOnce({ data: { pain_flags: flags }, error: null });
    await expect(loadWorkoutSessionPainFlags('session-1')).resolves.toEqual({ ok: true, flags });

    db.rpc.mockResolvedValueOnce({ data: flags, error: null });
    await expect(appendWorkoutSessionPainFlag('session-1', '11111111-1111-4111-8111-111111111111', flags[0])).resolves.toEqual({ ok: true, flags });
  });

  it('distinguishes a failed pain read from a verified empty flag list', async () => {
    db.eq.mockReturnValueOnce({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(loadWorkoutSessionPainFlags('session-1')).resolves.toEqual({ ok: false });
  });

  it('deletes a session only when exactly one owned row is returned', async () => {
    db.select.mockResolvedValueOnce({ data: [{ id: 'session-1' }], error: null });
    await expect(deleteWorkoutSession('session-1')).resolves.toBe(true);
    db.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(deleteWorkoutSession('missing')).resolves.toBe(false);
  });

  it('uses one database RPC for race-free empty-session discard', async () => {
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(deleteEmptyWorkoutSession('session-1')).resolves.toBe(false);
    expect(db.rpc).toHaveBeenCalledWith('discard_empty_workout_session', { p_session_id: 'session-1' });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('uses idempotent RPC boundaries for live start and retrospective save', async () => {
    db.rpc.mockResolvedValueOnce({ data: 'session-live', error: null });
    await expect(startWorkoutSessionAtomic({
      idempotencyKey: '11111111-1111-4111-8111-111111111111', sessionDate: '2026-08-24',
      draftFingerprint: 'draft:push:1', name: 'Push', templateId: null, kind: 'strength',
      liveStructure: [{ exercise_id: '33333333-3333-4333-8333-333333333333', target_sets: 3, target_reps: '8', superset_group: null }],
    })).resolves.toBe('session-live');
    expect(db.rpc).toHaveBeenNthCalledWith(1, 'start_workout_session', {
      p_idempotency_key: '11111111-1111-4111-8111-111111111111', p_draft_fingerprint: 'draft:push:1',
      p_session_date: '2026-08-24', p_name: 'Push', p_template_id: null, p_kind: 'strength',
      p_live_structure: [{ exercise_id: '33333333-3333-4333-8333-333333333333', target_sets: 3, target_reps: '8', superset_group: null }],
    });

    db.rpc.mockResolvedValueOnce({ data: 'session-history', error: null });
    const input = {
      idempotencyKey: '22222222-2222-4222-8222-222222222222', sessionDate: '2026-08-24',
      kind: 'strength' as const, name: 'Push', templateId: null, durationMinutes: 30,
      painFlags: [], activity: null, distanceKm: null, effort: null,
      sets: [{ exercise_id: '33333333-3333-4333-8333-333333333333', set_number: 1, weight_kg: 60, reps: 8, rpe: null, is_warmup: false, is_pr: false }],
    };
    await expect(saveRetrospectiveWorkoutAtomic(input)).resolves.toBe('session-history');
    expect(db.rpc).toHaveBeenNthCalledWith(2, 'save_retrospective_workout', expect.objectContaining({
      p_idempotency_key: input.idempotencyKey,
      p_sets: [expect.objectContaining({ superset_group: null })],
    }));
  });

  it('distinguishes a failed set read from a verified ordered result', async () => {
    const rows = [{ id: 'set-1', exercise_id: 'bench', set_number: 1 }];
    db.order.mockResolvedValueOnce({ data: rows, error: null }).mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(loadWorkoutSessionSets('session-1')).resolves.toEqual({ ok: true, sets: rows });
    await expect(loadWorkoutSessionSets('session-1')).resolves.toEqual({ ok: false });
    expect(db.from).toHaveBeenCalledWith('workout_sets');
    expect(db.eq).toHaveBeenCalledWith('session_id', 'session-1');
  });

  it('uses atomic RPCs for idempotent sets, versioned structure, pain append, and finish', async () => {
    db.rpc
      .mockResolvedValueOnce({ data: 'set-1', error: null })
      .mockResolvedValueOnce({ data: { version: 2, structure: [] }, error: null })
      .mockResolvedValueOnce({ data: [{ exercise_id: 'bench', body_part: 'shoulder', severity: 2 }], error: null })
      .mockResolvedValueOnce({ data: true, error: null });

    await expect(saveLiveWorkoutSetAtomic({
      sessionId: 'session-1', exerciseId: 'bench', setNumber: 1,
      weightKg: 60, reps: 8, rpe: 8, isWarmup: false, isPr: false, supersetGroup: null,
    })).resolves.toBe('set-1');
    await expect(updateLiveWorkoutStructureAtomic('session-1', 1, [], 'bench')).resolves.toEqual({ ok: true, version: 2, structure: [] });
    await expect(appendWorkoutSessionPainFlag('session-1', '11111111-1111-4111-8111-111111111111', {
      exercise_id: 'bench', body_part: 'shoulder', severity: 2,
    })).resolves.toMatchObject({ ok: true, flags: [{ body_part: 'shoulder' }] });
    await expect(finishLiveWorkoutSessionAtomic('session-1', {
      name: 'Push', durationMinutes: 20, templateId: null, notes: null,
    })).resolves.toBe(true);
  });

  it('loads canonical structure and version without trusting local storage', async () => {
    const structure = [{ exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: null }];
    db.eq.mockReturnValueOnce({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValueOnce({ data: { live_structure: structure, live_structure_version: 4 }, error: null });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: true, structure, version: 4 });
  });

  it('classifies only active live rows as legacy and bootstraps through the guarded RPC', async () => {
    db.eq.mockReturnValueOnce({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValueOnce({
      data: {
        live_structure: null,
        live_structure_version: 0,
        duration_minutes: null,
        client_request: { mode: 'live' },
      },
      error: null,
    });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: false, legacy: true });

    const structure = [{ exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: null }];
    db.rpc.mockResolvedValueOnce({ data: { version: 0, structure }, error: null });
    await expect(resumeLegacyLiveWorkoutStructureAtomic('session-1', 'strength', structure)).resolves.toEqual({
      ok: true,
      version: 0,
      structure,
    });
    expect(db.rpc).toHaveBeenCalledWith('resume_legacy_live_workout_session', {
      p_session_id: 'session-1',
      p_kind: 'strength',
      p_live_structure: structure,
    });
  });

  it('never classifies a completed null-structure row as resumable legacy state', async () => {
    db.eq.mockReturnValueOnce({ maybeSingle: db.maybeSingle });
    db.maybeSingle.mockResolvedValueOnce({
      data: {
        live_structure: null,
        live_structure_version: 0,
        duration_minutes: 20,
        client_request: { mode: 'live' },
      },
      error: null,
    });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: false });
  });
});
