/**
 * WP1 recovery worker (pure / dependency-injected).
 *
 * Reconciles expired invite reservations against Supabase Auth:
 *   claim_orphan_for_recovery (lease + token)  →  reconcile+delete the orphan Auth
 *   user (ONLY if it is tagged with this reservation_id)  →  cancel_recovering_reservation
 *   (token + live-lease gated, frees the slot).
 *
 * Pure by design — DB and Auth side-effects are injected, so it is fully unit-testable
 * with a real throwaway Postgres + a mock Auth client. Real adapters: lib/auth/auth-admin.ts.
 *
 * Safety invariants:
 *  - The worker NEVER deletes an Auth user it cannot prove belongs to the reservation
 *    (reconcileAndDelete returns 'mismatch' → left 'recovering', never cancelled).
 *  - The slot is freed only AFTER the orphan is provably gone ('deleted' or 'absent').
 *  - Any failure (mismatch / throw / cancel-returned-false) leaves the reservation
 *    'recovering'; its lease expires and a later run re-claims it with a fresh token.
 */

export interface OrphanRow {
  reservation_id: string;
  invite_type: string;
  user_id: string | null;
  recovery_token: string;
}

export interface RecoveryDb {
  claimOrphans(limit: number, leaseSeconds: number): Promise<OrphanRow[]>;
  /** Cancel a leased reservation (token + live-lease gated). Returns true if cancelled. */
  cancelRecovering(reservationId: string, recoveryToken: string): Promise<boolean>;
}

/**
 * Reconcile the orphan Auth user for a reservation and delete it iff it is tagged
 * with this reservation_id.
 *  - 'deleted'  — a matching Auth user existed and was deleted (idempotent if re-run)
 *  - 'absent'   — conclusively no Auth user for this reservation (safe to free the slot)
 *  - 'mismatch' — an Auth user was found whose tag does NOT match → do NOT delete, do
 *                 NOT free the slot (a bug; needs investigation)
 * Implementations MUST throw rather than return 'absent' if they cannot conclusively
 * determine absence (e.g. an incomplete scan).
 */
export interface AuthReconciler {
  reconcileAndDelete(reservationId: string, expectedUserId: string | null): Promise<'deleted' | 'absent' | 'mismatch'>;
}

export interface RecoveryResult {
  claimed: number;
  authDeleted: number;
  cancelled: number;
  errors: number;
}

export async function recoverOrphanReservations(
  db: RecoveryDb,
  auth: AuthReconciler,
  opts: { limit?: number; leaseSeconds?: number; concurrency?: number; log?: (msg: string) => void } = {},
): Promise<RecoveryResult> {
  const limit = opts.limit ?? 20;
  const leaseSeconds = opts.leaseSeconds ?? 300;
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const log = opts.log ?? (() => {});

  const orphans = await db.claimOrphans(limit, leaseSeconds);
  const result: RecoveryResult = { claimed: orphans.length, authDeleted: 0, cancelled: 0, errors: 0 };

  // Bounded concurrency so a batch finishes well within the function's runtime budget.
  let cursor = 0;
  async function runOne(o: OrphanRow): Promise<void> {
    try {
      const outcome = await auth.reconcileAndDelete(o.reservation_id, o.user_id);
      if (outcome === 'mismatch') {
        result.errors++;
        log(`[recovery] ${o.reservation_id}: Auth user tag mismatch — left recovering, NOT deleted`);
        return;
      }
      if (outcome === 'deleted') result.authDeleted++;
      // Orphan provably gone — free the slot. cancel=false (lease lost) is a retryable error.
      if (await db.cancelRecovering(o.reservation_id, o.recovery_token)) result.cancelled++;
      else { result.errors++; log(`[recovery] ${o.reservation_id}: cancel returned false (lease lost) — retry`); }
    } catch (err) {
      result.errors++;
      log(`[recovery] ${o.reservation_id}: left for retry: ${String(err)}`);
    }
  }
  async function worker(): Promise<void> {
    while (cursor < orphans.length) { const i = cursor++; await runOne(orphans[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, orphans.length) }, worker));
  return result;
}
