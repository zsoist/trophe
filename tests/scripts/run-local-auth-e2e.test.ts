import { describe, expect, it, vi } from 'vitest';
import { cleanupUserOwnedRows } from '@/scripts/test/run-local-auth-e2e.mjs';

describe('authenticated E2E fixture cleanup', () => {
  it('removes non-cascading user-owned workout templates before deleting Auth users', async () => {
    const eq = vi.fn().mockResolvedValue({ error: null });
    const deleteRows = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ delete: deleteRows }));

    await cleanupUserOwnedRows({ from } as never, 'client-1');

    expect(from).toHaveBeenCalledWith('workout_templates');
    expect(eq).toHaveBeenCalledWith('created_by', 'client-1');
  });

  it('fails closed when owned-row cleanup is rejected', async () => {
    const service = {
      from: () => ({ delete: () => ({ eq: vi.fn().mockResolvedValue({ error: new Error('denied') }) }) }),
    };

    await expect(cleanupUserOwnedRows(service as never, 'client-1')).rejects.toThrow(/owned rows cleanup/i);
  });
});
