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
  /** cancel_reservation_for_route: userId=null → unattached release; else user-matched. */
  cancelForRoute(reservationId: string, userId: string | null): Promise<boolean>;
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
      // The account already exists for this exact signup — idempotent success.
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

  // ── Attach (compare-and-set) ─────────────────────────────────────────────
  const attached = await db.attachUser(reservationId, userId);
  if (attached !== 'attached') {
    // 'conflict' = a different user already owns this reservation; 'gone' = expired/cancelled.
    // Only clean up a user WE created here; a resumed user belongs to the reservation and is
    // left to the recovery worker (which owns an expired/recovering row).
    if (createdHere) {
      await auth.deleteUser(userId).catch((e) => log(`delete after attach=${attached} failed: ${e}`));
      await db.cancelForRoute(reservationId, null).catch(() => {}); // best-effort release; no-op if not 'reserved'
    }
    return { ok: false, status: 409, reason: attached === 'conflict' ? 'conflict' : 'retry' };
  }

  // ── Finalize (atomic profile/consent + reserved→completed) ────────────────
  const finalized = await finalize(reservationId, userId);
  if (!finalized) {
    if (createdHere) {
      await auth.deleteUser(userId).catch((e) => log(`delete after finalize=false failed: ${e}`));
      await db.cancelForRoute(reservationId, userId).catch(() => {}); // attached compensation (tombstoned)
    }
    return { ok: false, status: 409, reason: 'retry' };
  }

  // ── Enable: lift the ban + confirm. finalize already committed, so a failure here is
  //    NOT a success — surface it so the caller can retry/alert (the account is in limbo). ─
  if (!(await auth.enableUser(userId))) {
    log(`finalize OK but enableUser failed for ${userId} (reservation ${reservationId}) — account banned/limbo`);
    return { ok: false, status: 500, reason: 'enable_failed', userId };
  }

  return { ok: true, status: 200, reason: createdHere ? 'created' : 'resumed', userId };
}
