import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  from: vi.fn(), deleteRows: vi.fn(), updateRows: vi.fn(), eq: vi.fn(), select: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: db.from } }));

import { deleteEmptyWorkoutSession, deleteWorkoutSession, loadWorkoutSessionPainFlags, loadWorkoutSessionSets, updateWorkoutSessionPainFlags } from '@/components/workout/workout-persistence';

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
    await expect(loadWorkoutSessionPainFlags('session-1')).resolves.toEqual(flags);

    db.eq.mockReturnValueOnce({ select: db.select });
    db.select.mockResolvedValueOnce({ data: [{ id: 'session-1' }], error: null });
    await expect(updateWorkoutSessionPainFlags('session-1', flags)).resolves.toBe(true);
    expect(db.updateRows).toHaveBeenCalledWith({ pain_flags: flags });
  });

  it('deletes a session only when exactly one owned row is returned', async () => {
    db.select.mockResolvedValueOnce({ data: [{ id: 'session-1' }], error: null });
    await expect(deleteWorkoutSession('session-1')).resolves.toBe(true);
    db.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(deleteWorkoutSession('missing')).resolves.toBe(false);
  });

  it('refuses empty-session discard when even one persisted set exists', async () => {
    const limit = vi.fn().mockResolvedValueOnce({ data: [{ id: 'set-1' }], error: null });
    const setEq = vi.fn(() => ({ limit }));
    db.from.mockImplementation((table: string) => table === 'workout_sets'
      ? { select: () => ({ eq: setEq }) }
      : { delete: db.deleteRows });

    await expect(deleteEmptyWorkoutSession('session-1')).resolves.toBe(false);
    expect(setEq).toHaveBeenCalledWith('session_id', 'session-1');
    expect(db.deleteRows).not.toHaveBeenCalled();
  });

  it('loads persisted sets in exercise and set order', async () => {
    const rows = [{ id: 'set-1', exercise_id: 'bench', set_number: 1 }];
    db.order.mockResolvedValue({ data: rows, error: null });
    await expect(loadWorkoutSessionSets('session-1')).resolves.toEqual(rows);
    expect(db.from).toHaveBeenCalledWith('workout_sets');
    expect(db.eq).toHaveBeenCalledWith('session_id', 'session-1');
  });
});
