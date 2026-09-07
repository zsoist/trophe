import { beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  failure: 'list' as 'list' | 'remove' | 'inventory',
  profileDelete: vi.fn(), authDelete: vi.fn(), remove: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServiceClient: () => ({
  from(table: string) {
    let mutation = false;
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'range', 'or', 'in', 'update', 'delete']) {
      query[method] = () => {
        if (method === 'delete' || method === 'update') mutation = true;
        if (table === 'profiles' && method === 'delete') state.profileDelete();
        return query;
      };
    }
    query.maybeSingle = async () => ({ data: { role: 'client', email: null } });
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve({
      data: table === 'messages' && !mutation ? [{ coach_id: 'coach' }] : [], count: 0,
      error: table === 'messages' && state.failure === 'inventory' ? { message: 'inventory unavailable' } : null,
    }).then(resolve);
    return query;
  },
  storage: { from: () => ({
    list: async () => state.failure === 'list' ? { data: null, error: { message: 'list unavailable' } } : { data: [{ name: 'object' }], error: null },
    remove: async () => { state.remove(); return { error: { message: 'remove unavailable' } }; },
  }) },
  auth: { admin: { deleteUser: state.authDelete } },
}) }));
import { eraseUser } from '../../lib/privacy/erasure';
beforeEach(() => vi.clearAllMocks());
for (const failure of ['list', 'remove', 'inventory'] as const) {
  it(`preserves profile and auth identity after ${failure} failure`, async () => {
    state.failure = failure;
    const result = await eraseUser('client', { dryRun: false });
    expect(result.errors.some(error => error.includes('unavailable'))).toBe(true);
    expect(result.authUserDeleted).toBe(false);
    expect(state.profileDelete).not.toHaveBeenCalled();
    expect(state.authDelete).not.toHaveBeenCalled();
    if (failure !== 'remove') expect(state.remove).not.toHaveBeenCalled();
  });
}
