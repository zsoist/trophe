/**
 * P2 per-worker cron-secret ISOLATION (route level).
 *
 * Proves the auth boundary each scheduled worker enforces:
 *  - RECOVERY_CRON_SECRET authorizes only the recovery endpoint, not memory.
 *  - MEMORY_CRON_SECRET authorizes only the memory endpoint, not recovery.
 *  - one worker's secret cannot authorize the other.
 *  - the retired shared CRON_SECRET can NEVER authorize either endpoint, set or unset
 *    (P2 phase 2: the fallback was removed, so a re-added CRON_SECRET cannot reauthorize a worker).
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

  it('the retired shared CRON_SECRET can NEVER authorize either endpoint — even if set in env', async () => {
    // Phase 2: routes no longer pass process.env.CRON_SECRET to cronBearerValid, so an
    // accidentally-restored shared secret cannot reauthorize a worker.
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    process.env.CRON_SECRET = 'shared';
    expect((await recoveryGET(req('shared'))).status).toBe(401);
    expect((await memoryGET(req('shared'))).status).toBe(401);
    // …and likewise when the shared var is absent
    delete process.env.CRON_SECRET;
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

  it('with the shared secret still present in env, each endpoint takes ONLY its own secret', async () => {
    process.env.RECOVERY_CRON_SECRET = 'recov';
    process.env.MEMORY_CRON_SECRET = 'mem';
    process.env.CRON_SECRET = 'shared';
    // each accepts its OWN per-worker secret
    expect((await recoveryGET(req('recov'))).status).toBe(200);
    expect((await memoryGET(req('mem'))).status).toBe(200);
    // the shared secret is ignored entirely
    expect((await recoveryGET(req('shared'))).status).toBe(401);
    expect((await memoryGET(req('shared'))).status).toBe(401);
    // and the other worker's per-worker secret is still rejected
    expect((await recoveryGET(req('mem'))).status).toBe(401);
    expect((await memoryGET(req('recov'))).status).toBe(401);
  });
});
