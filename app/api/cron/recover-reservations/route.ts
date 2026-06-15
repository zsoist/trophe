import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildRecoveryDb, buildAuthReconciler } from '@/lib/auth/auth-admin';
import { recoverOrphanReservations } from '@/lib/recovery/reservation-recovery';

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
 */
const BATCH_LIMIT = 20;
const LEASE_SECONDS = 300;
const CONCURRENCY = 5;

function authorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  // Vercel Cron sends `Authorization: Bearer <CRON_SECRET>` automatically.
  return !!expected && req.headers.get('authorization') === `Bearer ${expected}`;
}

async function run() {
  const service = createSupabaseServiceClient();
  return recoverOrphanReservations(
    buildRecoveryDb(service),
    buildAuthReconciler(service),
    { limit: BATCH_LIMIT, leaseSeconds: LEASE_SECONDS, concurrency: CONCURRENCY, log: (m) => console.error(m) },
  );
}

// Vercel Cron invokes the configured path with GET — this is the scheduled entry point.
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
