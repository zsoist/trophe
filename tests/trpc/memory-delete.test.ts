import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCallerFactory } from '@/lib/trpc/init';
import { appRouter } from '@/lib/trpc/router';
import type { Context } from '@/lib/trpc/context';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const CHUNK_ID = '00000000-0000-4000-8000-000000000002';

function updateChain(rows: unknown[]) {
  const returning = vi.fn().mockResolvedValue(rows);
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  return { update: vi.fn(() => ({ set })), returning };
}

function clientContext(db: object): Context {
  return {
    user: { id: USER_ID },
    profile: { id: USER_ID, role: 'client' },
    db,
    headers: new Headers(),
  } as unknown as Context;
}

describe('memory.delete', () => {
  it('reuses the organization-aware client access boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'lib/trpc/routers/memory.ts'),
      'utf8',
    );
    expect(source).toContain('assertCanAccessClient');
    expect(source).not.toContain('eq(clientProfiles.coachId, requesterId)');
  });

  it('allows a client to soft-delete their own memory and verifies the changed row', async () => {
    const db = updateChain([{ id: CHUNK_ID }]);
    const caller = createCallerFactory(appRouter)(clientContext(db));

    await expect(
      caller.memory.delete({ chunkId: CHUNK_ID, userId: USER_ID }),
    ).resolves.toEqual({ ok: true });
    expect(db.returning).toHaveBeenCalledTimes(1);
  });

  it('does not report success when the owned chunk does not exist', async () => {
    const db = updateChain([]);
    const caller = createCallerFactory(appRouter)(clientContext(db));

    await expect(
      caller.memory.delete({ chunkId: CHUNK_ID, userId: USER_ID }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
