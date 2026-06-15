/**
 * WP1 part 2 — the reserved-signup orchestration, pure + dependency-injected.
 *
 * Shared by the beta/ordinary signup route and the client-activation route. The route
 * does the flow-specific claim (claim_beta_invite / claim_ordinary_signup /
 * claim_client_invite) and supplies the matching finalize; this function runs the
 * universal lifecycle that the approved part-1 state machine requires:
 *
 *   claim → createUser(app_metadata reservation tag, BANNED) → attach (compare-and-set)
 *         → finalize_* (atomically writes profile/consent, flips reserved→completed)
 *         → enable (unban + confirm)        [success]
 *         → deleteUser + cancel_reservation_for_route (tombstoned)   [compensation]
 *
 * Banned-until-finalize closes the pre-finalization-login window (deletion ≠ JWT
 * revocation). Replay branches never create a second Auth user. All side-effects are
 * injected, so this is unit-testable with a mock Auth + a real throwaway DB.
 */

export interface ClaimResult {
  reservationId: string | null;
  outcome: 'claimed' | 'replayed_reserved' | 'replayed_completed' | 'invalid' | 'exhausted' | 'conflict';
  resUserId: string | null;
}

export interface SignupAuth {
  /** Create a BANNED, unconfirmed user tagged with app_metadata.reservation_id. */
  createUser(input: {
    email: string; password: string;
    appMetadata: Record<string, unknown>; userMetadata: Record<string, unknown>;
  }): Promise<{ userId: string | null; emailExists: boolean; error?: string }>;
  /** Idempotent (missing user is success). */
  deleteUser(userId: string): Promise<void>;
  /** Lift the ban + confirm the email after finalize. Returns false on failure. */
  enableUser(userId: string): Promise<boolean>;
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
  | 'created' | 'resumed' | 'already_exists'   // success-ish
  | 'invalid' | 'exhausted' | 'conflict' | 'email_exists' | 'retry' | 'enable_failed' | 'error';

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

  // ── Map the claim outcome ────────────────────────────────────────────────
  switch (claim.outcome) {
    case 'invalid':   return { ok: false, status: 400, reason: 'invalid' };
    case 'exhausted': return { ok: false, status: 409, reason: 'exhausted' };
    case 'conflict':  return { ok: false, status: 409, reason: 'conflict' };
    case 'replayed_completed':
      // The account already exists for this exact signup — idempotent success. Re-assert
      // enabled state (idempotent unban+confirm): if a prior attempt's post-finalize enable
      // failed (limbo), the user's natural retry HEALS it here instead of returning a
      // deceptive 200 over a still-banned account. Fail closed if it still can't be enabled.
      if (claim.resUserId && !(await auth.enableUser(claim.resUserId))) {
        log(`replayed_completed but enable failed for ${claim.resUserId} — surfacing instead of false success`);
        return { ok: false, status: 500, reason: 'enable_failed', userId: claim.resUserId };
      }
      return { ok: true, status: 200, reason: 'already_exists', userId: claim.resUserId ?? undefined };
    case 'replayed_reserved':
      // A concurrent/retried request reserved first. If it already attached a user, resume
      // with it. If not (resUserId null), fail closed — do NOT create a competing user (§3a).
      if (!claim.resUserId) return { ok: false, status: 409, reason: 'retry' };
      break;
    case 'claimed':
      break;
  }
  const reservationId = claim.reservationId;
  if (!reservationId) return { ok: false, status: 500, reason: 'error' }; // claimed/resumed always carry one

  // ── Obtain the Auth user ─────────────────────────────────────────────────
  let userId: string;
  const createdHere = claim.outcome === 'claimed';
  if (createdHere) {
    const created = await auth.createUser({
      email, password,
      appMetadata: { reservation_id: reservationId }, // TRUSTED tag — service-role only
      userMetadata,
    });
    if (created.emailExists) {
      // Unrelated existing account → release our (unattached) reservation, report 409.
      await db.cancelForRoute(reservationId, null).catch((e) => log(`release after email_exists failed: ${e}`));
      return { ok: false, status: 409, reason: 'email_exists' };
    }
    if (!created.userId) {
      await db.cancelForRoute(reservationId, null).catch((e) => log(`release after create error failed: ${e}`));
      return { ok: false, status: 400, reason: 'error' };
    }
    userId = created.userId;
  } else {
    userId = claim.resUserId!; // resume: reuse the prior attempt's attached user
  }

  // Resolve an ambiguous post-create failure WITHOUT destroying a winning account. attach
  // 'gone' / finalize false are BOTH ambiguous under concurrency: a sibling request that
  // resumed THIS SAME user may have already completed the reservation. Re-check before any
  // destructive compensation, and delete ONLY a user we can prove is orphaned.
  const resolveFailure = async (didAttach: boolean, reason: SignupReason): Promise<SignupOutcome> => {
    const state = await db.reservationState(reservationId);
    if (state.status === 'completed' && state.userId === userId) {
      // A concurrent finalizer already completed with OUR user — idempotent success, never
      // delete it (the bug: the losing finalizer must not delete the winning account).
      if (!(await auth.enableUser(userId))) return { ok: false, status: 500, reason: 'enable_failed', userId };
      return { ok: true, status: 200, reason: createdHere ? 'created' : 'resumed', userId };
    }
    if (createdHere) {
      // Delete ONLY a user we can PROVE is orphaned: cancel succeeds ⇒ the row was still
      // ours ('reserved' + our user, or unattached) ⇒ genuine orphan. If the row completed
      // under a DIFFERENT user, our user is a stray ⇒ also safe to delete. Otherwise
      // (recovering / ambiguous) leave the tagged user to the recovery worker.
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

  // ── Enable: lift the ban + confirm. finalize already committed, so a failure here is
  //    NOT a success — surface it so the caller can retry/alert (the account is in limbo). ─
  if (!(await auth.enableUser(userId))) {
    log(`finalize OK but enableUser failed for ${userId} (reservation ${reservationId}) — account banned/limbo`);
    return { ok: false, status: 500, reason: 'enable_failed', userId };
  }

  return { ok: true, status: 200, reason: createdHere ? 'created' : 'resumed', userId };
}
