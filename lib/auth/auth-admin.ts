import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecoveryDb, AuthReconciler, OrphanRow } from '@/lib/recovery/reservation-recovery';

/**
 * Supabase-backed adapters for the WP1 reservation lifecycle. Kept thin so the
 * recovery worker (lib/recovery/reservation-recovery.ts) stays pure + unit-tested.
 */

/** RecoveryDb backed by the service-role client (calls the 0042 SECURITY DEFINER RPCs). */
export function buildRecoveryDb(service: SupabaseClient): RecoveryDb {
  return {
    async claimOrphans(limit, leaseSeconds) {
      const { data, error } = await service.rpc('claim_orphan_for_recovery', { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(`claim_orphan_for_recovery: ${error.message}`);
      return (data ?? []) as OrphanRow[];
    },
    async cancelRecovering(reservationId, recoveryToken) {
      const { data, error } = await service.rpc('cancel_recovering_reservation', { p_reservation_id: reservationId, p_recovery_token: recoveryToken });
      if (error) throw new Error(`cancel_recovering_reservation: ${error.message}`);
      return data === true;
    },
  };
}

const isMissingUser = (e: { status?: number; message?: string } | null) =>
  !!e && (e.status === 404 || /not\s*found/i.test(e.message ?? ''));

const tagOf = (u: { user_metadata?: unknown } | null | undefined): string | undefined =>
  (u?.user_metadata as { reservation_id?: string } | null | undefined)?.reservation_id;

/**
 * AuthReconciler backed by the Supabase Auth Admin API.
 *
 * The worker NEVER passes a bare user id to delete — it asks this adapter to reconcile
 * the orphan against its reservation tag first. Deletion happens only when the Auth
 * user's user_metadata.reservation_id matches the reservation being recovered. A
 * mismatch returns 'mismatch' (the worker leaves the reservation 'recovering', never
 * frees the slot, never deletes). Absence is only ever concluded server-side (the
 * find RPC), never from a bounded client scan.
 */
export function buildAuthReconciler(service: SupabaseClient): AuthReconciler {
  async function deleteIdempotent(userId: string): Promise<void> {
    const { error } = await service.auth.admin.deleteUser(userId);
    if (error && !isMissingUser(error)) throw new Error(`deleteUser: ${error.message}`); // idempotent on missing
  }

  return {
    async reconcileAndDelete(reservationId, expectedUserId) {
      if (!expectedUserId) {
        // Pre-attach orphan (user_id NULL): resolve the tagged user SERVER-SIDE.
        // find_auth_user_id_by_reservation (0043) matches on
        // auth.users.raw_user_meta_data->>'reservation_id' — one query, no scan, so
        // a NULL is a conclusive "no such user" (never a truncated-scan false negative).
        const { data, error } = await service.rpc('find_auth_user_id_by_reservation', { p_reservation_id: reservationId });
        if (error) throw new Error(`find_auth_user_id_by_reservation: ${error.message}`);
        const id = (data as string | null) ?? null;
        if (!id) return 'absent';
        await deleteIdempotent(id); // RPC already proved the tag matches
        return 'deleted';
      }
      // Attached orphan: fetch and VERIFY the tag before deleting (the P0 guard —
      // never delete an Auth user we cannot prove belongs to this reservation).
      const { data, error } = await service.auth.admin.getUserById(expectedUserId);
      if (error) {
        if (isMissingUser(error)) return 'absent';
        throw new Error(`getUserById: ${error.message}`);
      }
      const user = data?.user;
      if (!user) return 'absent';
      if (tagOf(user) !== reservationId) return 'mismatch';
      await deleteIdempotent(expectedUserId);
      return 'deleted';
    },
  };
}
