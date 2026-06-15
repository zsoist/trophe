import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildRecoveryDb, buildAuthReconciler } from '@/lib/auth/auth-admin';
import { recoverOrphanReservations } from '@/lib/recovery/reservation-recovery';

/**
 * WP1 recovery worker — protected cron endpoint.
 * Leases expired invite reservations, deletes the orphan Auth user, then frees the
 * slot (token + live-lease gated). Idempotent + retry-safe: anything it can't finish
 * is left 'recovering' and re-leased on the next run. Auth-side effects only; no
 * customer-facing route. Schedule e.g. every few minutes via Vercel cron.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const service = createSupabaseServiceClient();
    const result = await recoverOrphanReservations(
      buildRecoveryDb(service),
      buildAuthReconciler(service),
      { limit: 100, leaseSeconds: 120, log: (m) => console.error(m) },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[recover-reservations] run failed:', err);
    return NextResponse.json({ error: 'recovery run failed' }, { status: 500 });
  }
}
