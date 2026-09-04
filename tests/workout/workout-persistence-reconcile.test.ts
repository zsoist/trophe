import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  from: vi.fn(), rpc: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(), getUser: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from, rpc: db.rpc, auth: { getUser: db.getUser } } }));

import {
  classifyPersistenceError,
  loadWorkoutSessionStructure,
  startWorkoutSessionAtomic,
} from '@/components/workout/workout-persistence';

const startInput = {
  idempotencyKey: '11111111-1111-4111-8111-111111111111', sessionDate: '2026-09-03',
  draftFingerprint: 'draft:push:1', name: 'Push', templateId: null, kind: 'strength' as const,
  liveStructure: [{ exercise_id: '33333333-3333-4333-8333-333333333333', target_sets: 3, target_reps: '8', superset_group: null }],
};

describe('live structure recovery distinguishes server truth', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.from.mockReturnValue({ select: db.select });
    db.select.mockReturnValue({ eq: db.eq });
    db.eq.mockReturnValue({ maybeSingle: db.maybeSingle });
  });

  it('selects the terminal marker and reports an active row as non-terminal', async () => {
    const structure = [{ exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: null }];
    db.maybeSingle.mockResolvedValueOnce({ data: { live_structure: structure, live_structure_version: 4, duration_minutes: null, completed_at: null, client_request: { mode: 'live' } }, error: null });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: true, terminal: false, structure, version: 4 });
    expect(db.select).toHaveBeenCalledWith(expect.stringContaining('completed_at'));
  });

  it('reports a row finished elsewhere as terminal instead of resumable live state', async () => {
    const structure = [{ exercise_id: 'bench', target_sets: 3, target_reps: '8', superset_group: null }];
    db.maybeSingle.mockResolvedValueOnce({ data: {
      live_structure: structure, live_structure_version: 4, duration_minutes: 42,
      completed_at: '2026-09-03T10:00:00.000Z', client_request: { mode: 'live' },
    }, error: null });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({
      ok: true, terminal: true, completedAt: '2026-09-03T10:00:00.000Z', durationMinutes: 42,
    });
  });

  it('treats a duration-only legacy completion as terminal too', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: {
      live_structure: null, live_structure_version: 0, duration_minutes: 20, completed_at: null, client_request: { mode: 'live' },
    }, error: null });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: true, terminal: true, completedAt: null, durationMinutes: 20 });
  });

  it('separates a missing row from a transport failure', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.getUser.mockResolvedValueOnce({ data: { user: { id: 'user-1' } }, error: null });
    await expect(loadWorkoutSessionStructure('session-1', 'user-1')).resolves.toEqual({ ok: false, reason: 'missing' });

    db.maybeSingle.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: false, reason: 'transport' });
  });

  it('does not call an RLS-hidden row missing when the current owner cannot be authenticated', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
    db.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'expired token' } });

    await expect(loadWorkoutSessionStructure('session-1', 'user-1')).resolves.toEqual({ ok: false, reason: 'auth' });
  });

  it('keeps the legacy active branch', async () => {
    db.maybeSingle.mockResolvedValueOnce({ data: {
      live_structure: null, live_structure_version: 0, duration_minutes: null, completed_at: null, client_request: { mode: 'live' },
    }, error: null });
    await expect(loadWorkoutSessionStructure('session-1')).resolves.toEqual({ ok: false, reason: 'legacy', legacy: true });
  });
});

describe('definitive rejections are separated from transient failures', () => {
  beforeEach(() => { vi.resetAllMocks(); });

  it.each([
    ['22023', 'rejected'], ['23505', 'rejected'], ['23503', 'rejected'], ['42501', 'rejected'], ['P0001', 'rejected'],
    ['42P01', 'blocked'], ['42883', 'blocked'], ['PGRST202', 'blocked'], ['PGRST301', 'blocked'],
    ['08006', 'transient'], ['57014', 'transient'], ['40001', 'transient'], [undefined, 'transient'],
  ] as const)('classifies Postgres code %s as %s', (code, kind) => {
    const result = classifyPersistenceError(code === undefined ? { message: 'fetch failed' } : { code, message: 'x' });
    expect(result.kind).toBe(kind);
    if (result.kind === 'rejected' || result.kind === 'blocked') expect(result.code).toBe(code);
  });

  it('classifies non-object and network errors as transient', () => {
    expect(classifyPersistenceError(new TypeError('Failed to fetch'))).toEqual({ ok: false, kind: 'transient' });
    expect(classifyPersistenceError(null)).toEqual({ ok: false, kind: 'transient' });
  });

  it('returns the accepted session id from the idempotent start RPC', async () => {
    db.rpc.mockResolvedValueOnce({ data: 'session-live', error: null });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: true, sessionId: 'session-live' });
  });

  it('surfaces RLS and constraint refusals as rejected with their code', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: false, kind: 'rejected', code: '42501' });
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'The request key is already bound to a different workout' } });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: false, kind: 'rejected', code: '22023' });
  });

  it('keeps timeouts, network failures, and malformed replies transient', async () => {
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: 'FetchError: network', code: undefined } });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: false, kind: 'transient' });
    db.rpc.mockResolvedValueOnce({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: false, kind: 'transient' });
    db.rpc.mockResolvedValueOnce({ data: 42, error: null });
    await expect(startWorkoutSessionAtomic(startInput)).resolves.toEqual({ ok: false, kind: 'transient' });
  });
});
