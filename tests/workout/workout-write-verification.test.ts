import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  deleteRows: vi.fn(),
  updateRows: vi.fn(),
  insertRows: vi.fn(),
  eq: vi.fn(),
  inRows: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import {
  deleteWorkoutSet,
  deleteWorkoutSets,
  finishWorkoutSession,
  insertWorkoutSets,
} from '@/components/workout/workout-persistence';

const SET = {
  exercise_id: 'exercise-1',
  set_number: 1,
  weight_kg: 80,
  reps: 5,
  rpe: 8,
  is_warmup: false,
  is_pr: false,
};

describe('workout mutation verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({
      delete: mocks.deleteRows,
      update: mocks.updateRows,
      insert: mocks.insertRows,
    });
    mocks.deleteRows.mockReturnValue({ eq: mocks.eq });
    mocks.updateRows.mockReturnValue({ eq: mocks.eq });
    mocks.insertRows.mockReturnValue({ select: mocks.select });
    mocks.eq.mockReturnValue({ select: mocks.select });
    mocks.inRows.mockReturnValue({ select: mocks.select });
    mocks.deleteRows.mockReturnValue({ eq: mocks.eq, in: mocks.inRows });
  });

  it('confirms a delete only when exactly one set row is returned', async () => {
    mocks.select.mockResolvedValueOnce({ data: [{ id: 'set-1' }], error: null });
    await expect(deleteWorkoutSet('set-1')).resolves.toBe(true);

    mocks.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(deleteWorkoutSet('missing')).resolves.toBe(false);
  });

  it('confirms bulk inserts only when every requested set is returned', async () => {
    mocks.select.mockResolvedValueOnce({
      data: [{ id: 'set-1' }, { id: 'set-2' }],
      error: null,
    });
    await expect(insertWorkoutSets('session-1', [SET, SET])).resolves.toBe(true);

    mocks.select.mockResolvedValueOnce({ data: [{ id: 'set-1' }], error: null });
    await expect(insertWorkoutSets('session-1', [SET, SET])).resolves.toBe(false);
  });

  it('confirms grouped deletes only when every requested set is returned', async () => {
    mocks.select.mockResolvedValueOnce({
      data: [{ id: 'set-1' }, { id: 'set-2' }],
      error: null,
    });
    await expect(deleteWorkoutSets(['set-1', 'set-2'])).resolves.toBe(true);

    mocks.select.mockResolvedValueOnce({ data: [{ id: 'set-1' }], error: null });
    await expect(deleteWorkoutSets(['set-1', 'set-2'])).resolves.toBe(false);
  });

  it('confirms the final session update changed exactly one row', async () => {
    mocks.select.mockResolvedValueOnce({ data: [{ id: 'session-1' }], error: null });
    await expect(finishWorkoutSession('session-1', {
      name: 'Strength',
      duration_minutes: 45,
      pain_flags: [],
    })).resolves.toBe(true);

    mocks.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(finishWorkoutSession('missing', {
      name: 'Strength',
      duration_minutes: 45,
      pain_flags: [],
    })).resolves.toBe(false);
  });

  it('blocks completion UI when verified persistence fails', () => {
    const guided = readFileSync(
      join(process.cwd(), 'components/workout/GuidedSession.tsx'),
      'utf8',
    );
    const freestyle = readFileSync(
      join(process.cwd(), 'app/dashboard/workout/page.tsx'),
      'utf8',
    );

    expect(guided).toContain('if (!deleted)');
    expect(guided).toContain('if (!finished)');
    expect(freestyle).toContain('if (!inserted || !finished)');
    expect(freestyle).toContain("window.alert(t('workout.save_failed'))");
  });
});
