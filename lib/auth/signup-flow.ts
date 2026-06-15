/**
 * WP1 part 2 — the reserved-signup orchestration, pure + dependency-injected.
 *
 * Shared by the beta/ordinary signup route and the client-activation route. The route
 * does the flow-specific claim + supplies the matching finalize; this runs the universal
 * lifecycle the approved part-1 state machine requires:
 *
 *   claim → createUser(app_metadata reservation tag, EMAIL-UNCONFIRMED) → attach (CAS)
 *         → finalize_* (atomically writes profile/consent, flips reserved→completed)
 *         → sendConfirmation (email-ownership proof)  → 202 "check your email"
 *         → compensation (cancel-first, delete-only-if-orphaned) on failure
 *
 * Email verification is the pre-finalization-login control: the user is created UNCONFIRMED
 * (Supabase blocks password login until confirmed) and the confirmation email is sent only
 * AFTER finalize commits. There is NO provisioning ban — `ban_duration` is reserved
 * exclusively for ADMINISTRATIVE suspension, which this flow never touches. A crashed
 * (pre-finalize) account is unconfirmed + never sent a link ⇒ unusable + reaped by recovery.
 * Replays converge on one reservation + one Auth user and merely re-send the confirmation.
 */

export interface ClaimResult {
  reservationId: string | null;
  outcome: 'claimed' | 'replayed_reserved' | 'replayed_completed' | 'invalid' | 'exhausted' | 'conflict';
  resUserId: string | null;
}

export interface SignupAuth {
  /** Create an EMAIL-UNCONFIRMED user tagged with app_metadata.reservation_id. No ban. */
  createUser(input: {
    email: string; password: string;
    appMetadata: Record<string, unknown>; userMetadata: Record<string, unknown>;
  }): Promise<{ userId: string | null; emailExists: boolean; error?: string }>;
  /** Idempotent (missing user is success). */
  deleteUser(userId: string): Promise<void>;
  /** Send/resend the signup confirmation (email-ownership proof). Best-effort: a failure
   *  is non-fatal — the account exists and a replay re-sends. Returns false on failure. */
  sendConfirmation(email: string): Promise<boolean>;
}

export interface SignupDb {
  attachUser(reservationId: string, userId: string): Promise<'attached' | 'conflict' | 'gone'>;
  /** cancel_reservation_for_route: userId=null → unattached release; else user-matched.
   *  Returns true ONLY if it actually cancelled (the row was still 'reserved' and ours). */
  cancelForRoute(reservationId: string, userId: string | null): Promise<boolean>;
  /** Current reservation status + attached user — to disambiguate a finalize/attach
   *  failure (genuine failure vs a concurrent sibling that already completed our user). */
  reservationState(reservationId: string): Promise<{ status: string; userId: string | null }>;
}

export type SignupReason =
  | 'pending_confirmation'                       // success → 202, user must confirm their email
  | 'invalid' | 'exhausted' | 'conflict' | 'email_exists' | 'retry' | 'error';

export interface SignupOutcome {
  ok: boolean;
  status: number;
  reason: SignupReason;
  userId?: string;
}

export async function runReservedSignup(
  auth: SignupAuth,
  db: SignupDb,
  args: {
    claim: ClaimResult;
    finalize: (reservationId: string, userId: string) => Promise<boolean>;
    email: string;
    password: string;
    userMetadata: Record<string, unknown>;
    log?: (msg: string) => void;
  },
): Promise<SignupOutcome> {
  const { claim, finalize, email, password, userMetadata } = args;
  const log = args.log ?? (() => {});

  const pending = (userId?: string): SignupOutcome => ({ ok: true, status: 202, reason: 'pending_confirmation', userId });
  const resend = () => auth.sendConfirmation(email).catch((e) => { log(`sendConfirmation failed (non-fatal): ${e}`); return false; });

  // ── Map the claim outcome ────────────────────────────────────────────────
  switch (claim.outcome) {
    case 'invalid':   return { ok: false, status: 400, reason: 'invalid' };
    case 'exhausted': return { ok: false, status: 409, reason: 'exhausted' };
    case 'conflict':  return { ok: false, status: 409, reason: 'conflict' };
    case 'replayed_completed':
      // The account already exists for this exact signup — re-send confirmation (idempotent;
      // harmless if already confirmed) so a user who lost the first email can still verify.
      await resend();
      return pending(claim.resUserId ?? undefined);
    case 'replayed_reserved':
      // A concurrent/retried request reserved first. Resume its user if attached; otherwise
      // fail closed — never create a competing user (§3a).
      if (!claim.resUserId) return { ok: false, status: 409, reason: 'retry' };
      break;
    case 'claimed':
      break;
  }
  const reservationId = claim.reservationId;
  if (!reservationId) return { ok: false, status: 500, reason: 'error' };

  // ── Obtain the Auth user (unconfirmed, no ban) ───────────────────────────
  let userId: string;
  const createdHere = claim.outcome === 'claimed';
  if (createdHere) {
    const created = await auth.createUser({ email, password, appMetadata: { reservation_id: reservationId }, userMetadata });
    if (created.emailExists) {
      await db.cancelForRoute(reservationId, null).catch((e) => log(`release after email_exists failed: ${e}`));
      return { ok: false, status: 409, reason: 'email_exists' };
    }
    if (!created.userId) {
      await db.cancelForRoute(reservationId, null).catch((e) => log(`release after create error failed: ${e}`));
      return { ok: false, status: 400, reason: 'error' };
    }
    userId = created.userId;
  } else {
    userId = claim.resUserId!;
  }

  // Resolve an ambiguous post-create failure WITHOUT destroying a winning account. attach
  // 'gone' / finalize false are BOTH ambiguous under concurrency: a sibling that resumed
  // THIS user may have already completed the reservation. Re-check before any destruction.
  const resolveFailure = async (didAttach: boolean, reason: SignupReason): Promise<SignupOutcome> => {
    const state = await db.reservationState(reservationId);
    if (state.status === 'completed' && state.userId === userId) {
      await resend(); // idempotent success — the account is good; never delete it
      return pending(userId);
    }
    if (createdHere) {
      // Delete ONLY a user we can PROVE is orphaned: cancel succeeds ⇒ the row was still
      // ours; or it completed under a DIFFERENT user ⇒ ours is a stray. Else (recovering /
      // ambiguous) leave the tagged user to the recovery worker.
      const cancelled = await db.cancelForRoute(reservationId, didAttach ? userId : null).catch(() => false);
      if (cancelled || (state.status === 'completed' && state.userId !== userId)) {
        await auth.deleteUser(userId).catch((e) => log(`compensating delete failed: ${e}`));
      }
    }
    return { ok: false, status: 409, reason };
  };

  // ── Attach (compare-and-set) ─────────────────────────────────────────────
  const attached = await db.attachUser(reservationId, userId);
  if (attached !== 'attached') return resolveFailure(false, attached === 'conflict' ? 'conflict' : 'retry');

  // ── Finalize (atomic profile/consent + reserved→completed) ────────────────
  if (!(await finalize(reservationId, userId))) return resolveFailure(true, 'retry');

  // ── Provision complete → send the confirmation email (ownership proof). Non-fatal if it
  //    fails (a replay re-sends); the account is unconfirmed so it still cannot log in. ──
  await resend();
  return pending(userId);
}
