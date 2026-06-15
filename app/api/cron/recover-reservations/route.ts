import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildRecoveryDb, buildAuthReconciler } from '@/lib/auth/auth-admin';
import { recoverOrphanReservations, sweepTombstones } from '@/lib/recovery/reservation-recovery';

/**
 * WP1 recovery worker — protected cron endpoint.
 *
 * Leases a small batch of expired invite reservations, reconciles each against
 * Supabase Auth (deleting the orphan user ONLY when its reservation tag matches),
 * then frees the slot (token + live-lease gated). Idempotent + retry-safe: anything
 * it can't finish is left 'recovering' and re-leased on a later run. Auth-side effects
 * only; no customer-facing surface.
 *
 * Runtime budget: the Vercel function caps at 60s (vercel.json). We lease a BOUNDED
 * batch with a lease (300s) comfortably longer than that ceiling, so a function that
 * is killed mid-run never causes a premature re-claim of a row it already deleted.
 *
 * Scheduling: NOT a Vercel cron — the project is on the Hobby plan, which permits cron
 * only once/day (too slow for ~15-min reservations). Driven instead by Supabase
 * pg_cron + pg_net POSTing here every few minutes. See
 * docs/ops/recovery-worker-scheduling.md for the install SQL + alternatives.
 */
const BATCH_LIMIT = 20;
const LEASE_SECONDS = 300;
const CONCURRENCY = 5;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Scheduler (Supabase pg_cron → pg_net) sends `Authorization: Bearer <CRON_SECRET>`.
  return !!expected && req.headers.get('authorization') === `Bearer ${expected}`;
}

async function run() {
  const service = createSupabaseServiceClient();
  const db = buildRecoveryDb(service);
  const auth = buildAuthReconciler(service);
  const opts = { limit: BATCH_LIMIT, leaseSeconds: LEASE_SECONDS, concurrency: CONCURRENCY, log: (m: string) => console.error(m) };
  // Pass 1: lease + reconcile expired reservations. Pass 2: re-reconcile cancelled
  // tombstones so a late-arriving Auth user is reaped instead of stranded.
  const orphans = await recoverOrphanReservations(db, auth, opts);
  const tombstones = await sweepTombstones(db, auth, opts);
  return { orphans, tombstones };
}

// Scheduled entry point (Supabase pg_cron via pg_net POST). GET also serves manual curl.
export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ ok: true, ...(await run()) });
  } catch (err) {
    console.error('[recover-reservations] run failed:', err);
    return NextResponse.json({ error: 'recovery run failed' }, { status: 500 });
  }
}

// POST kept for manual/operator invocation with the same protection.
export async function POST(req: NextRequest) {
  return GET(req);
}
