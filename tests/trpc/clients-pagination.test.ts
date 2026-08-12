import { describe, expect, it, vi } from 'vitest';
import { createCallerFactory } from '@/lib/trpc/init';
import { appRouter } from '@/lib/trpc/router';
import type { Context } from '@/lib/trpc/context';

const COACH_ID = '00000000-0000-4000-8000-000000000001';

function chain(result: unknown) {
  const query = Promise.resolve(result) as Promise<unknown> & Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['from', 'innerJoin', 'where', 'orderBy', 'limit', 'offset']) {
    query[method] = vi.fn(() => query);
  }
  return query;
}

describe('clients.list pagination', () => {
  it('returns the complete accessible-client count, not the current page length', async () => {
    const page = [{ id: 'client-51' }, { id: 'client-52' }];
    const pageQuery = chain(page);
    const countQuery = chain([{ total: 137 }]);
    const select = vi
      .fn()
      .mockReturnValueOnce(pageQuery)
      .mockReturnValueOnce(countQuery);
    const ctx = {
      user: { id: COACH_ID },
      profile: { id: COACH_ID, role: 'coach' },
      db: { select },
      headers: new Headers(),
    } as unknown as Context;

    const caller = createCallerFactory(appRouter)(ctx);
    const result = await caller.clients.list({ limit: 2, offset: 50 });

    expect(result).toEqual({ clients: page, total: 137 });
    expect(select).toHaveBeenCalledTimes(2);
  });
});
