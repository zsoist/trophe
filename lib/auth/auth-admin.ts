import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecoveryDb, TombstoneDb, CompletedDb, AuthReconciler, StrayReconciler, OrphanRow } from '@/lib/recovery/reservation-recovery';
import type { SignupAuth, SignupDb } from '@/lib/auth/signup-flow';

/**
 * Supabase-backed adapters for the WP1 reservation lifecycle. Kept thin so the
 * recovery worker (lib/recovery/reservation-recovery.ts) stays pure + unit-tested.
 */

/** Tombstone retention: how long a recovery-cancelled reservation stays re-reconcilable
 *  to catch a late createUser. Must exceed the worst-case create completion (bounded by
 *  the 60s serverless function cap); 10m is a wide margin. */
const TOMBSTONE_RETENTION_SECONDS = 600;

/** RecoveryDb + TombstoneDb + CompletedDb backed by the service-role client (0042/0044/0046 RPCs). */
export function buildRecoveryDb(service: SupabaseClient): RecoveryDb & TombstoneDb & CompletedDb {
  return {
    async claimOrphans(limit, leaseSeconds) {
      const { data, error } = await service.rpc('claim_orphan_for_recovery', { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(`claim_orphan_for_recovery: ${error.message}`);
      return (data ?? []) as OrphanRow[];
    },
    async claimCompleted(limit, leaseSeconds, retentionSeconds) {
      const { data, error } = await service.rpc('claim_completed_for_recheck', { p_limit: limit, p_lease_seconds: leaseSeconds, p_retention_seconds: retentionSeconds });
      if (error) throw new Error(`claim_completed_for_recheck: ${error.message}`);
      return (data ?? []) as OrphanRow[];
    },
    async settleCompleted(reservationId, recoveryToken) {
      const { data, error } = await service.rpc('settle_completed_recheck', { p_reservation_id: reservationId, p_recovery_token: recoveryToken });
      if (error) throw new Error(`settle_completed_recheck: ${error.message}`);
      return (data as 'sealed' | 'rechecked' | 'lost');
    },
    async cancelRecovering(reservationId, recoveryToken) {
      // Tombstoned cancel: atomically frees the slot AND arms the late-arrival window.
      const { data, error } = await service.rpc('cancel_recovering_reservation_tombstoned', {
        p_reservation_id: reservationId, p_recovery_token: recoveryToken, p_retention_seconds: TOMBSTONE_RETENTION_SECONDS,
      });
      if (error) throw new Error(`cancel_recovering_reservation_tombstoned: ${error.message}`);
      return data === true;
    },
    async claimTombstones(limit, leaseSeconds) {
      const { data, error } = await service.rpc('claim_tombstones_for_recheck', { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(`claim_tombstones_for_recheck: ${error.message}`);
      return (data ?? []) as OrphanRow[];
    },
    async settleTombstone(reservationId, recoveryToken) {
      const { data, error } = await service.rpc('settle_tombstone', { p_reservation_id: reservationId, p_recovery_token: recoveryToken });
      if (error) throw new Error(`settle_tombstone: ${error.message}`);
      return (data as 'sealed' | 'rechecked' | 'lost');
    },
  };
}

const isMissingUser = (e: { status?: number; message?: string } | null) =>
  !!e && (e.status === 404 || /not\s*found/i.test(e.message ?? ''));

/**
 * The TRUSTED reservation tag lives in app_metadata (raw_app_meta_data), which only the
 * service role can write — an authenticated user's auth.updateUser() cannot touch it.
 * The signup/activation routes (WP1 part 2) MUST create the Auth user with
 * `app_metadata: { reservation_id }` for recovery to find and safely delete it.
 */
const tagOf = (u: { app_metadata?: unknown } | null | undefined): string | undefined =>
  (u?.app_metadata as { reservation_id?: string } | null | undefined)?.reservation_id;

/**
 * AuthReconciler backed by the Supabase Auth Admin API.
 *
 * Safety model:
 *  - Deletion authority is the TRUSTED app_metadata tag, never the DB's user pointer
 *    and never user-editable user_metadata.
 *  - EVERY Auth user carrying the tag is deleted (no LIMIT) so duplicate tags can't
 *    strand an account.
 *  - 'deleted'/'absent' (→ worker frees the slot) is returned ONLY after a final query
 *    proves zero carriers remain. Any incomplete reconciliation throws → the worker
 *    leaves the reservation 'recovering' for a later run.
 *  - If the reservation names a user that exists but carries a DIFFERENT trusted tag,
 *    return 'mismatch' and touch nothing (a governance inconsistency to investigate).
 */
export function buildAuthReconciler(service: SupabaseClient): AuthReconciler & StrayReconciler {
  async function deleteIdempotent(userId: string): Promise<void> {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error && !isMissingUser(error)) throw new Error(`deleteUser: ${error.message}`); // idempotent on missing
  }
  async function findIdsByTag(reservationId: string): Promise<string[]> {
    const { data, error } = await service.rpc('find_auth_user_ids_by_reservation', { p_reservation_id: reservationId });
    if (error) throw new Error(`find_auth_user_ids_by_reservation: ${error.message}`);
    return (data ?? []) as string[];
  }

  return {
    // Delete every carrier of reservationId EXCEPT the legitimate finalized user, then
    // prove no stray remains. Used for the COMPLETED terminal (the kept user lives on).
    async reconcileStrayCarriers(reservationId, keepUserId) {
      // Verify the KEEP user actually carries the trusted tag before deleting anything —
      // a stale/corrupt invite_reservations.user_id must NOT cause us to delete the real
      // tagged account. Missing or mismatched keep user → fail closed (delete nothing).
      const { data, error } = await service.auth.admin.getUserById(keepUserId);
      if (error && !isMissingUser(error)) throw new Error(`getUserById: ${error.message}`);
      const keep = error ? null : data?.user ?? null;
      if (!keep || tagOf(keep) !== reservationId) return 'mismatch';
      const stray = (await findIdsByTag(reservationId)).filter((id) => id !== keepUserId);
      if (stray.length === 0) return 'clean';
      for (const id of stray) await deleteIdempotent(id);
      const remaining = (await findIdsByTag(reservationId)).filter((id) => id !== keepUserId);
      if (remaining.length > 0) throw new Error(`stray reconcile incomplete: ${remaining.length} stray carrier(s) remain`);
      return 'reaped';
    },
    async reconcileAndDelete(reservationId, expectedUserId) {
      // Guard: a named user that exists but carries a DIFFERENT trusted tag → refuse.
      let verifiedExpected: string | null = null;
      if (expectedUserId) {
        const { data, error } = await service.auth.admin.getUserById(expectedUserId);
        if (error && !isMissingUser(error)) throw new Error(`getUserById: ${error.message}`);
        const user = error ? null : data?.user ?? null;
        if (user) {
          if (tagOf(user) !== reservationId) return 'mismatch';
          verifiedExpected = expectedUserId; // exists AND carries our tag
        }
        // user missing (already deleted) → fall through to the tag sweep
      }

      // Authority = the trusted tag. Delete every carrier (∪ the verified named user).
      const tagged = await findIdsByTag(reservationId);
      const ids = Array.from(new Set([...(verifiedExpected ? [verifiedExpected] : []), ...tagged]));
      if (ids.length === 0) return 'absent';
      for (const id of ids) await deleteIdempotent(id);

      // Free the slot ONLY after proving no carrier remains.
      const remaining = await findIdsByTag(reservationId);
      if (remaining.length > 0) throw new Error(`reconcile incomplete: ${remaining.length} tagged user(s) remain`);
      return 'deleted';
    },
  };
}

const isEmailExists = (e: { code?: string; status?: number; message?: string } | null) =>
  !!e && (e.code === 'email_exists' || /already.*regist|already.*exist|email.*exist/i.test(e.message ?? ''));

/** SignupAuth backed by the Supabase Auth Admin API (WP1 part 2). */
export function buildSignupAuth(service: SupabaseClient): SignupAuth {
  return {
    async createUser({ email, password, appMetadata, userMetadata }) {
      // EMAIL-UNCONFIRMED is the pre-finalization hold (Supabase blocks password login until
      // confirmed). NO ban_duration — that is reserved exclusively for ADMINISTRATIVE
      // suspension, which signup never touches (so an admin ban can't be raced/undone here).
      const { data, error } = await service.auth.admin.createUser({
        email, password,
        email_confirm: false,
        app_metadata: appMetadata, // TRUSTED, service-role-only reservation tag
        user_metadata: userMetadata,
      });
      if (error || !data?.user) return { userId: null, emailExists: isEmailExists(error), error: error?.message };
      return { userId: data.user.id, emailExists: false };
    },
    async deleteUser(userId) {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error && !isMissingUser(error)) throw new Error(`deleteUser: ${error.message}`); // idempotent on missing
    },
    async sendConfirmation(email) {
      // Send/resend the signup confirmation email (email-ownership proof). emailRedirectTo
      // lands the user back in the app after confirming (must be in Supabase's redirect
      // allowlist). NOTE: the exact mechanism for an Admin-created unconfirmed user must be
      // validated on local/preview Supabase (resend vs admin.generateLink) — preview gate.
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      const { error } = await service.auth.resend({
        type: 'signup', email,
        ...(siteUrl ? { options: { emailRedirectTo: `${siteUrl}/login?confirmed=1` } } : {}),
      });
      return !error;
    },
  };
}

/** SignupDb backed by the service-role client (0042 attach + 0045 route cancel). */
export function buildSignupDb(service: SupabaseClient): SignupDb {
  return {
    async attachUser(reservationId, userId) {
      const { data, error } = await service.rpc('attach_reservation_user', { p_reservation_id: reservationId, p_user_id: userId });
      if (error) throw new Error(`attach_reservation_user: ${error.message}`);
      return data as 'attached' | 'conflict' | 'gone';
    },
    async cancelForRoute(reservationId, userId) {
      const { data, error } = await service.rpc('cancel_reservation_for_route', { p_reservation_id: reservationId, p_user_id: userId });
      if (error) throw new Error(`cancel_reservation_for_route: ${error.message}`);
      return data === true;
    },
    async reservationState(reservationId) {
      // service_role read (RLS deny-all is bypassed) — used only to disambiguate a failure.
      const { data, error } = await service.from('invite_reservations').select('status, user_id').eq('id', reservationId).maybeSingle();
      if (error) throw new Error(`reservationState: ${error.message}`);
      return { status: (data?.status as string) ?? 'gone', userId: (data?.user_id as string | null) ?? null };
    },
  };
}
