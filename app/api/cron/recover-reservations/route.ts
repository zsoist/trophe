import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildRecoveryDb, buildAuthReconciler } from '@/lib/auth/auth-admin';
import { runRecoveryPasses } from '@/lib/recovery/reservation-recovery';
import { cronBearerValid } from '@/lib/auth/cron-auth';

/**
 * WP1 recovery worker — protected cron endpoint.
 *
 * Leases a small batch of expired invite reservations, reconciles each against
 * Supabase Auth (deleting the orphan user ONLY when its reservation tag matches),
 * then frees the slot (token + live-lease gated). Idempotent + retry-safe: anything
 * it can't finish is left 'recovering' and re-leased on a later run. Auth-side effects
 * only; no customer-facing surface.
 *
 * Runtime budget: the Vercel function caps at 60s (vercel.json). All THREE passes SHARE
 * one bounded item budget — at most ORPHAN_LIMIT + TOMBSTONE_LIMIT + COMPLETED_LIMIT
 * reservations are touched per invocation — and the lease (300s) stays comfortably above
 * the worst-case run, so a function killed mid-run never causes a premature re-claim of a
 * row it already deleted.
 *
 * Scheduling: NOT a Vercel cron — the project is on the Hobby plan, which permits cron
 * only once/day (too slow for ~15-min reservations). Driven instead by Supabase
 * pg_cron + pg_net POSTing here every few minutes. See
 * docs/ops/recovery-worker-scheduling.md for the install SQL + alternatives.
 */
const ORPHAN_LIMIT = 8;      // shared budget: ORPHAN + TOMBSTONE + COMPLETED = 20 max/run
const TOMBSTONE_LIMIT = 6;
const COMPLETED_LIMIT = 6;
const LEASE_SECONDS = 300;
const CONCURRENCY = 5;

function authorized(req: NextRequest): boolean {
  // Per-worker secret (RECOVERY_CRON_SECRET) with a backward-compat window on the legacy shared
  // CRON_SECRET (P2: isolate rotation). Scheduler sends `Authorization: Bearer <secret>`.
  return cronBearerValid(req.headers.get('authorization'), process.env.RECOVERY_CRON_SECRET, process.env.CRON_SECRET);
}

function run() {
  const service = createSupabaseServiceClient();
  // Pass 1 reconciles expired reservations; pass 2 re-reconciles cancelled tombstones;
  // pass 3 reaps stray carriers on recently-completed rows. One shared item budget.
  return runRecoveryPasses(buildRecoveryDb(service), buildAuthReconciler(service), {
    orphanLimit: ORPHAN_LIMIT, tombstoneLimit: TOMBSTONE_LIMIT, completedLimit: COMPLETED_LIMIT,
    leaseSeconds: LEASE_SECONDS, concurrency: CONCURRENCY, log: (m: string) => console.error(m),
  });
}

// Scheduled entry point (Supabase pg_cron via pg_net POST). GET also serves manual curl.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    const result = await run();
    // Logical failures (Auth errors, tag mismatches, lost leases) count into result.errors
    // but don't throw. Surface them as 5xx so the scheduler's non-2xx alert fires — a
    // silently-degraded worker that returns 200 would evade monitoring.
    const status = result.errors > 0 ? 500 : 200;
    return NextResponse.json({ ok: result.errors === 0, ...result }, { status });
  } catch (err) {
    console.error('[recover-reservations] run failed:', err);
    return NextResponse.json({ error: 'recovery run failed' }, { status: 500 });
  }
}

// POST kept for manual/operator invocation with the same protection.
export async function POST(req: NextRequest) {
  return GET(req);
}
