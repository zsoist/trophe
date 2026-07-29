import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  update: vi.fn(),
  inIds: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: mocks.from },
}));

import { updateWorkoutSupersetGroups } from '@/components/workout/workout-persistence';

describe('persisted workout superset groups', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ in: mocks.inIds });
    mocks.inIds.mockReturnValue({ select: mocks.select });
  });

  it('batches equal groups and verifies every updated row', async () => {
    mocks.select
      .mockResolvedValueOnce({ data: [{ id: 'set-1' }, { id: 'set-2' }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 'set-3' }], error: null });

    await expect(updateWorkoutSupersetGroups([
      { id: 'set-1', superset_group: 1 },
      { id: 'set-2', superset_group: 1 },
      { id: 'set-3', superset_group: null },
    ])).resolves.toBe(true);

    expect(mocks.update).toHaveBeenCalledWith({ superset_group: 1 });
    expect(mocks.update).toHaveBeenCalledWith({ superset_group: null });
    expect(mocks.inIds).toHaveBeenCalledWith('id', ['set-1', 'set-2']);
  });

  it('fails closed when the database returns fewer rows than requested', async () => {
    mocks.select.mockResolvedValueOnce({ data: [{ id: 'set-1' }], error: null });

    await expect(updateWorkoutSupersetGroups([
      { id: 'set-1', superset_group: 1 },
      { id: 'set-2', superset_group: 1 },
    ])).resolves.toBe(false);
  });
});
