/**
 * WP1 recovery worker (pure / dependency-injected).
 *
 * Reconciles expired invite reservations against Supabase Auth:
 *   claim_orphan_for_recovery (lease + token)  →  delete the orphan Auth user  →
 *   cancel_recovering_reservation (token-gated, frees the slot).
 *
 * Pure by design — the DB and Auth side-effects are injected, so this is fully
 * unit-testable with a real throwaway Postgres + a mock Auth client (no Supabase
 * import here). The real adapters live in lib/auth/auth-admin.ts.
 *
 * Failure handling: if Auth deletion or the cancel throws, the reservation is LEFT
 * in `recovering`; its lease expires and a later run re-claims it (with a fresh
 * token), so partial failures are retried safely and never strand a slot or an
 * Auth user.
 */

export interface OrphanRow {
  reservation_id: string;
  invite_type: string;
  user_id: string | null;
  recovery_token: string;
}

export interface RecoveryDb {
  /** Atomically lease expired reservations → 'recovering', returning fresh tokens. */
  claimOrphans(limit: number, leaseSeconds: number): Promise<OrphanRow[]>;
  /** Cancel a leased reservation (token + live-lease gated). Returns true if cancelled. */
  cancelRecovering(reservationId: string, recoveryToken: string): Promise<boolean>;
}

export interface AuthReconciler {
  /** Delete an Auth user. MUST resolve (not throw) if the user is already missing. */
  deleteUser(userId: string): Promise<void>;
  /** Find the Auth user tagged with this reservation_id (pre-attach orphans). */
  findUserIdByReservation(reservationId: string): Promise<string | null>;
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
  opts: { limit?: number; leaseSeconds?: number; log?: (msg: string) => void } = {},
): Promise<RecoveryResult> {
  const limit = opts.limit ?? 50;
  const leaseSeconds = opts.leaseSeconds ?? 120;
  const log = opts.log ?? (() => {});

  const orphans = await db.claimOrphans(limit, leaseSeconds);
  let authDeleted = 0, cancelled = 0, errors = 0;

  for (const o of orphans) {
    try {
      // Resolve the orphan Auth user: attached → user_id; pre-attach crash → by tag.
      const userId = o.user_id ?? (await auth.findUserIdByReservation(o.reservation_id));
      if (userId) {
        await auth.deleteUser(userId); // idempotent — safe if already gone
        authDeleted++;
      }
      // Only after the external Auth user is gone do we free the slot.
      if (await db.cancelRecovering(o.reservation_id, o.recovery_token)) cancelled++;
    } catch (err) {
      // Leave it 'recovering'; the lease will expire and a later run retries it.
      errors++;
      log(`[recovery] reservation ${o.reservation_id} left for retry: ${String(err)}`);
    }
  }

  return { claimed: orphans.length, authDeleted, cancelled, errors };
}
