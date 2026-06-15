/**
 * WP1 recovery worker (pure / dependency-injected).
 *
 * Reconciles expired invite reservations against Supabase Auth:
 *   claim_orphan_for_recovery (lease + token)  →  reconcile+delete the orphan Auth
 *   user (ONLY if it is tagged with this reservation_id)  →  cancel_recovering_reservation_tombstoned
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

/**
 * Durable late-arrival reconciliation (tombstone sweep).
 *
 * Cancelling a reservation arms a retention window (reconcile_until). This sweep
 * re-reconciles cancelled+unsealed rows so an Auth user that was created AFTER the
 * cancel (an in-flight createUser that landed late) is still deleted instead of
 * stranded — claim_orphan_for_recovery never revisits 'cancelled' rows. Each row is
 * re-checked until its window elapses, then SEALED (terminal).
 */
export interface TombstoneDb {
  claimTombstones(limit: number, leaseSeconds: number): Promise<OrphanRow[]>;
  /** Seal if the retention window elapsed (terminal), else release the lease for re-check. */
  settleTombstone(reservationId: string, recoveryToken: string): Promise<'sealed' | 'rechecked' | 'lost'>;
}

export interface TombstoneResult {
  claimed: number;
  authDeleted: number;
  sealed: number;
  rechecked: number;
  errors: number;
}

export async function sweepTombstones(
  db: TombstoneDb,
  auth: AuthReconciler,
  opts: { limit?: number; leaseSeconds?: number; concurrency?: number; log?: (msg: string) => void } = {},
): Promise<TombstoneResult> {
  const limit = opts.limit ?? 20;
  const leaseSeconds = opts.leaseSeconds ?? 120;
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const log = opts.log ?? (() => {});

  const rows = await db.claimTombstones(limit, leaseSeconds);
  const result: TombstoneResult = { claimed: rows.length, authDeleted: 0, sealed: 0, rechecked: 0, errors: 0 };

  let cursor = 0;
  async function runOne(o: OrphanRow): Promise<void> {
    try {
      const outcome = await auth.reconcileAndDelete(o.reservation_id, o.user_id);
      if (outcome === 'mismatch') {
        result.errors++;
        log(`[tombstone] ${o.reservation_id}: tag mismatch — left for re-check, NOT sealed`);
        return; // lease expires → re-claimed; never sealed while a foreign carrier exists
      }
      if (outcome === 'deleted') result.authDeleted++;
      // Carriers gone this pass → seal if the window elapsed, else release for re-check.
      const settled = await db.settleTombstone(o.reservation_id, o.recovery_token);
      if (settled === 'sealed') result.sealed++;
      else if (settled === 'rechecked') result.rechecked++;
      else { result.errors++; log(`[tombstone] ${o.reservation_id}: settle lost lease — retry`); }
    } catch (err) {
      result.errors++;
      log(`[tombstone] ${o.reservation_id}: left for retry: ${String(err)}`);
    }
  }
  async function worker(): Promise<void> {
    while (cursor < rows.length) { const i = cursor++; await runOne(rows[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return result;
}

/**
 * Stray-carrier reconciliation for COMPLETED reservations. A completed row has exactly
 * one legitimate Auth user (the finalized user_id); ANY other user tagged with the
 * reservation is a stray (a crashed concurrent same-key request that created a second
 * Auth user) and must be deleted while the legitimate user is preserved. 'completed' is
 * otherwise invisible to both recovery passes — this closes that terminal.
 */
export interface StrayReconciler {
  /** Delete every Auth user tagged with reservationId EXCEPT keepUserId — but ONLY after
   *  verifying keepUserId itself carries the trusted reservation tag. 'mismatch' (keep
   *  user missing or wrong tag) ⇒ delete NOTHING (fail closed: never nuke the real
   *  account on a stale/corrupt pointer). 'reaped' = ≥1 stray deleted; 'clean' = none.
   *  Throws if it cannot prove the strays are gone. */
  reconcileStrayCarriers(reservationId: string, keepUserId: string): Promise<'reaped' | 'clean' | 'mismatch'>;
}

export interface CompletedDb {
  claimCompleted(limit: number, leaseSeconds: number, retentionSeconds: number): Promise<OrphanRow[]>;
  /** Seal if the recheck window elapsed (terminal), else release the lease for re-check. */
  settleCompleted(reservationId: string, recoveryToken: string): Promise<'sealed' | 'rechecked' | 'lost'>;
}

export interface CompletedSweepResult {
  claimed: number;
  strayReaped: number;
  sealed: number;
  rechecked: number;
  errors: number;
}

export async function sweepCompletedStrays(
  db: CompletedDb,
  auth: StrayReconciler,
  opts: { limit?: number; leaseSeconds?: number; retentionSeconds?: number; concurrency?: number; log?: (msg: string) => void } = {},
): Promise<CompletedSweepResult> {
  const limit = opts.limit ?? 20;
  const leaseSeconds = opts.leaseSeconds ?? 120;
  const retentionSeconds = opts.retentionSeconds ?? 600;
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const log = opts.log ?? (() => {});

  const rows = await db.claimCompleted(limit, leaseSeconds, retentionSeconds);
  const result: CompletedSweepResult = { claimed: rows.length, strayReaped: 0, sealed: 0, rechecked: 0, errors: 0 };

  let cursor = 0;
  async function runOne(o: OrphanRow): Promise<void> {
    // A completed row must carry its legitimate user; without it we cannot tell stray
    // from legit, so we refuse to delete ANYTHING (never nuke the real account).
    if (!o.user_id) { result.errors++; log(`[completed] ${o.reservation_id}: no user_id — skipped (cannot distinguish stray)`); return; }
    try {
      const outcome = await auth.reconcileStrayCarriers(o.reservation_id, o.user_id);
      if (outcome === 'mismatch') {
        // keep-user missing or wrong tag — fail closed (NOT sealed, surfaces as an error)
        result.errors++;
        log(`[completed] ${o.reservation_id}: keep-user tag mismatch — deleted NOTHING, left for investigation`);
        return;
      }
      if (outcome === 'reaped') result.strayReaped++;
      // Strays gone this pass → seal if the window elapsed (final boundary check just ran),
      // else back off so other completed rows are checked before this one again.
      const settled = await db.settleCompleted(o.reservation_id, o.recovery_token);
      if (settled === 'sealed') result.sealed++;
      else if (settled === 'rechecked') result.rechecked++;
      else { result.errors++; log(`[completed] ${o.reservation_id}: settle lost lease — retry`); }
    } catch (err) {
      result.errors++;
      log(`[completed] ${o.reservation_id}: left for retry: ${String(err)}`);
    }
  }
  async function worker(): Promise<void> {
    while (cursor < rows.length) { const i = cursor++; await runOne(rows[i]); }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) }, worker));
  return result;
}

export interface RecoveryRunResult {
  orphans: RecoveryResult;
  tombstones: TombstoneResult;
  completed: CompletedSweepResult;
  /** Total logical failures across all passes. Non-zero ⇒ the run needs attention. */
  errors: number;
}

/**
 * One scheduled run = orphan pass + cancelled-tombstone pass + completed-stray pass,
 * sharing a single bounded item budget (orphanLimit + tombstoneLimit + completedLimit)
 * so all three together stay within the serverless function's runtime ceiling — the
 * total reservations touched per invocation can never exceed their sum. Callers must
 * treat `errors > 0` as a failed run (surface it as non-2xx so monitoring sees it).
 */
export async function runRecoveryPasses(
  db: RecoveryDb & TombstoneDb & CompletedDb,
  auth: AuthReconciler & StrayReconciler,
  opts: { orphanLimit: number; tombstoneLimit: number; completedLimit: number; leaseSeconds: number; concurrency?: number; log?: (msg: string) => void },
): Promise<RecoveryRunResult> {
  const base = { leaseSeconds: opts.leaseSeconds, concurrency: opts.concurrency, log: opts.log };
  const orphans = await recoverOrphanReservations(db, auth, { ...base, limit: opts.orphanLimit });
  const tombstones = await sweepTombstones(db, auth, { ...base, limit: opts.tombstoneLimit });
  const completed = await sweepCompletedStrays(db, auth, { ...base, limit: opts.completedLimit });
  return { orphans, tombstones, completed, errors: orphans.errors + tombstones.errors + completed.errors };
}
