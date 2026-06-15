/**
 * P2 per-worker cron-secret ISOLATION (route level).
 *
 * Proves the auth boundary each scheduled worker enforces:
 *  - RECOVERY_CRON_SECRET authorizes only the recovery endpoint, not memory.
 *  - MEMORY_CRON_SECRET authorizes only the memory endpoint, not recovery.
 *  - one worker's secret cannot authorize the other.
 *  - the legacy shared CRON_SECRET works for both ONLY while it is set (cutover window),
 *    and fails closed the instant it is unset.
 *  - all-unset env and wrong/missing bearers fail closed (401).
 *
 * Downstream work is stubbed so the AUTHORIZED path returns a clean 200 without a DB:
 * the assertions are about the auth decision, not the worker bodies.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Memory worker: stub the queue so an authorized request is a 200 no-op.
vi.mock('@/agents/memory/queue', () => ({
  processMemoryQueue: vi.fn(async () => ({ processed: 0 })),
}));

// Recovery worker: stub the supabase client + recovery passes so an authorized
// request returns 200 (errors === 0) without touching a database.
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({}),
}));
vi.mock('@/lib/auth/auth-admin', () => ({
  buildRecoveryDb: () => ({}),
  buildAuthReconciler: () => ({}),
}));
vi.mock('@/lib/recovery/reservation-recovery', () => ({
  runRecoveryPasses: vi.fn(async () => ({ errors: 0, orphans: 0, tombstones: 0, completed: 0 })),
}));

import { GET as recoveryGET } from '@/app/api/cron/recover-reservations/route';
import { GET as memoryGET } from '@/app/api/internal/memory-worker/route';

function req(bearer?: string) {
  return new NextRequest('http://localhost/x', {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
}

const ENV_KEYS = ['RECOVERY_CRON_SECRET', 'MEMORY_CRON_SECRET', 'CRON_SECRET'] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('P2 cron-secret isolation (route level)', () => {
  it('RECOVERY_CRON_SECRET authorizes recovery but NOT memory', async () => {
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    expect((await recoveryGET(req('recov'))).status).toBe(200);
    expect((await memoryGET(req('recov'))).status).toBe(401);
  });

  it('MEMORY_CRON_SECRET authorizes memory but NOT recovery', async () => {
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    expect((await memoryGET(req('mem'))).status).toBe(200);
    expect((await recoveryGET(req('mem'))).status).toBe(401);
  });

  it('the legacy shared CRON_SECRET authorizes BOTH only while it is set (cutover window)', async () => {
    process.env.CRON_SECRET = 'shared';
    expect((await recoveryGET(req('shared'))).status).toBe(200);
    expect((await memoryGET(req('shared'))).status).toBe(200);
  });

  it('once the shared CRON_SECRET is unset, the old shared bearer fails closed (post-cutover)', async () => {
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    // CRON_SECRET intentionally unset
    expect((await recoveryGET(req('shared'))).status).toBe(401);
    expect((await memoryGET(req('shared'))).status).toBe(401);
  });

  it('wrong secret, missing header, and all-unset env all fail closed (401)', async () => {
    // all three secrets unset
    expect((await recoveryGET(req('anything'))).status).toBe(401);
    expect((await memoryGET(req('anything'))).status).toBe(401);
    // envs set, but a wrong bearer
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    expect((await recoveryGET(req('nope'))).status).toBe(401);
    expect((await memoryGET(req('nope'))).status).toBe(401);
    // no Authorization header at all
    expect((await recoveryGET(req())).status).toBe(401);
    expect((await memoryGET(req())).status).toBe(401);
  });
});
