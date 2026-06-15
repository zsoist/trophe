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

/** AuthReconciler backed by the Supabase Auth Admin API. */
export function buildAuthReconciler(service: SupabaseClient): AuthReconciler {
  return {
    async deleteUser(userId) {
      const { error } = await service.auth.admin.deleteUser(userId);
      if (error && !isMissingUser(error)) throw new Error(`deleteUser: ${error.message}`); // idempotent on missing
    },
    async findUserIdByReservation(reservationId) {
      // Pre-attach orphans (user_id NULL) are rare — the route attaches immediately
      // after Auth creation. Scan a bounded number of pages for the tagged user.
      // OPTIMISATION (follow-up): a SECURITY DEFINER RPC over auth.users keyed on
      // raw_user_meta_data->>'reservation_id' avoids the scan entirely.
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
        if (error) throw new Error(`listUsers: ${error.message}`);
        const match = data.users.find((u) => (u.user_metadata as { reservation_id?: string } | null)?.reservation_id === reservationId);
        if (match) return match.id;
        if (data.users.length < 1000) break; // last page
      }
      return null;
    },
  };
}
