-- 0046_completed_stray_recheck.sql — WP1: 'completed' is also a tombstone-blind terminal.
--
-- 0044/0045 reap late carriers on CANCELLED rows, but 'completed' can carry a STRAY
-- tagged Auth user too: under the concurrent same-key replay race, request B can
-- createUser (tagged reservation R) and crash before compensating; request A then
-- finalizes R -> completed. B's user is invisible to claim_orphan_for_recovery
-- (reserved/recovering) and claim_tombstones_for_recheck (cancelled) forever — a
-- permanent strand on the one terminal the tombstone net didn't cover.
--
-- Fix: re-check recently-completed rows for a retention window and delete any tagged
-- carrier OTHER THAN the legitimate finalized user_id (which must be preserved). Reuses
-- completed_at (set by the finalizers) + the idle recovering_lease_until/recovery_token
-- columns (a completed row never holds a recovery lease), so no schema change beyond an
-- index. A row ageing past its window simply drops out of claim eligibility (no seal).

CREATE INDEX IF NOT EXISTS idx_invite_reservations_completed_recheck
  ON public.invite_reservations (completed_at)
  WHERE status = 'completed';

-- Lease recently-completed rows whose recheck lease is free. Mirrors the other claim_*
-- RPCs (fresh token + lease, SKIP LOCKED). Window-bounded by completed_at.
CREATE OR REPLACE FUNCTION public.claim_completed_for_recheck(
  p_limit int DEFAULT 20, p_lease_seconds int DEFAULT 120, p_retention_seconds int DEFAULT 600)
RETURNS TABLE (reservation_id uuid, invite_type text, user_id uuid, recovery_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_lease_seconds <= 0 OR p_retention_seconds <= 0 THEN RAISE EXCEPTION 'lease/retention must be positive'; END IF;
  p_limit := LEAST(GREATEST(p_limit, 1), 1000);
  RETURN QUERY
  UPDATE public.invite_reservations r
     SET recovering_lease_until = now() + make_interval(secs => p_lease_seconds),
         recovery_token = gen_random_uuid()
   WHERE r.id IN (
     SELECT s.id FROM public.invite_reservations s
      WHERE s.status = 'completed'
        AND s.completed_at IS NOT NULL
        AND s.completed_at > now() - make_interval(secs => p_retention_seconds)
        AND (s.recovering_lease_until IS NULL OR s.recovering_lease_until < now())
      ORDER BY s.completed_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit)
  RETURNING r.id, r.invite_type, r.user_id, r.recovery_token;
END; $$;

-- Release the recheck lease (token + live-lease gated) after the worker has reconciled
-- stray carriers. The row stays re-checkable until completed_at ages past the window.
CREATE OR REPLACE FUNCTION public.settle_completed_recheck(p_reservation_id uuid, p_recovery_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.invite_reservations
     SET recovering_lease_until = NULL, recovery_token = NULL
   WHERE id = p_reservation_id AND status = 'completed'
     AND recovery_token = p_recovery_token AND recovering_lease_until > now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END; $$;

-- service_role only (all SECURITY DEFINER).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_completed_for_recheck(int,int,int)',
    'public.settle_completed_recheck(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
