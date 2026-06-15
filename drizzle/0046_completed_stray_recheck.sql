-- 0046_completed_stray_recheck.sql — WP1: 'completed' is also a tombstone-blind terminal.
--
-- 0044/0045 reap late carriers on CANCELLED rows, but 'completed' can carry a STRAY
-- tagged Auth user too: under the concurrent same-key replay race, request B can
-- createUser (tagged reservation R) and crash before compensating; request A then
-- finalizes R -> completed. B's user is invisible to claim_orphan_for_recovery
-- (reserved/recovering) and claim_tombstones_for_recheck (cancelled) forever — a
-- permanent strand on the one terminal the tombstone net didn't cover.
--
-- Fix: re-check completed rows for a retention window and delete any tagged carrier
-- OTHER THAN the legitimate finalized user_id (preserved). This MIRRORS the cancelled
-- tombstone lifecycle exactly — fair backoff between checks (so a busy completion stream
-- can't starve newer rows), and SEAL only after a final boundary reconciliation, so a
-- carrier arriving just before window-end is still caught. Reuses completed_at +
-- reconcile_until + sealed_at + the idle recovering_lease_until/recovery_token columns
-- (a completed row never holds a recovery lease), so no schema change beyond an index.

CREATE INDEX IF NOT EXISTS idx_invite_reservations_completed_recheck
  ON public.invite_reservations (completed_at)
  WHERE status = 'completed' AND sealed_at IS NULL;

-- Lease unsealed completed rows whose recheck lease is free; ARM reconcile_until (the
-- recheck window boundary = completed_at + retention) so settle can seal at the boundary.
-- Backoff (in settle) prevents the oldest rows from monopolising every run.
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
         recovery_token = gen_random_uuid(),
         reconcile_until = r.completed_at + make_interval(secs => p_retention_seconds)
   WHERE r.id IN (
     SELECT s.id FROM public.invite_reservations s
      WHERE s.status = 'completed'
        AND s.sealed_at IS NULL
        AND s.completed_at IS NOT NULL
        AND (s.recovering_lease_until IS NULL OR s.recovering_lease_until < now())
      ORDER BY s.completed_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit)
  RETURNING r.id, r.invite_type, r.user_id, r.recovery_token;
END; $$;

-- After the worker reconciles stray carriers: SEAL if the recheck window has elapsed
-- (the reconciliation that just ran IS the final boundary check — terminal, never
-- re-checked), else release the lease with BACKOFF so the row is revisited fairly.
CREATE OR REPLACE FUNCTION public.settle_completed_recheck(
  p_reservation_id uuid, p_recovery_token uuid, p_recheck_backoff_seconds int DEFAULT 120)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  IF p_recheck_backoff_seconds <= 0 THEN RAISE EXCEPTION 'p_recheck_backoff_seconds must be positive'; END IF;
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND status = 'completed' AND sealed_at IS NULL
     AND recovery_token = p_recovery_token AND recovering_lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN 'lost'; END IF;
  IF v_res.reconcile_until IS NOT NULL AND now() >= v_res.reconcile_until THEN
    UPDATE public.invite_reservations
       SET sealed_at = now(), recovering_lease_until = NULL, recovery_token = NULL
     WHERE id = p_reservation_id;
    RETURN 'sealed';
  END IF;
  -- still in window: back off (keep token NULL so claim re-leases after the backoff,
  -- letting OTHER unsealed completed rows be checked in the meantime).
  UPDATE public.invite_reservations
     SET recovering_lease_until = LEAST(now() + make_interval(secs => p_recheck_backoff_seconds), v_res.reconcile_until),
         recovery_token = NULL
   WHERE id = p_reservation_id;
  RETURN 'rechecked';
END; $$;

-- service_role only (all SECURITY DEFINER).
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_completed_for_recheck(int,int,int)',
    'public.settle_completed_recheck(uuid,uuid,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
