-- 0045_route_cancel_tombstoned.sql — WP1: the route's OWN cancellation path must also
-- arm a tombstone.
--
-- 0044 closed the recovery-worker cancel bypass, but the synchronous ROUTE-compensation
-- RPCs (release_invite_reservation, cancel_attached_reservation) still cancelled without
-- arming reconcile_until. Under retries/concurrency, two requests can converge on one
-- reservation: request A releases/compensates while request B's createUser (tagged to the
-- same reservation_id) is still in flight → that late Auth user is stranded forever, the
-- exact bug WP1 exists to fix.
--
-- Fix: ONE tombstone-arming route cancellation RPC, and the legacy two are revoked from
-- service_role so the DB — not caller discipline — guarantees "every cancellation arms a
-- tombstone". (The claim_*-internal 'exhausted' cancel is exempt: it cancels a row whose
-- id is never returned to the caller, so no createUser can ever target it.)

CREATE OR REPLACE FUNCTION public.cancel_reservation_for_route(
  p_reservation_id uuid, p_user_id uuid DEFAULT NULL, p_retention_seconds int DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  IF p_retention_seconds <= 0 THEN RAISE EXCEPTION 'p_retention_seconds must be positive'; END IF;
  -- The route owns the row only while it is still 'reserved' (a 'recovering' row belongs
  -- to the worker, token-gated; 'completed'/'cancelled' are done). Lock + verify.
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  IF p_user_id IS NULL THEN
    -- Unattached release: refuse if a user is attached (that needs the user-matched path).
    IF v_res.user_id IS NOT NULL THEN RETURN false; END IF;
  ELSE
    -- Attached compensation: the attached user MUST equal the caller's user (no confused
    -- deputy — a wrong/absent attachment cannot cancel).
    IF v_res.user_id IS DISTINCT FROM p_user_id THEN RETURN false; END IF;
  END IF;

  -- Cancel AND arm a tombstone atomically: a concurrent/in-flight createUser tagged to
  -- this reservation may land after this cancel; the tombstone sweep (0044) reaps it.
  UPDATE public.invite_reservations
     SET status = 'cancelled',
         reconcile_until = now() + make_interval(secs => p_retention_seconds),
         recovering_lease_until = NULL,
         recovery_token = NULL
   WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id; END IF;
  RETURN true;
END; $$;

-- The new RPC is the ONLY service_role route-cancellation path.
REVOKE ALL ON FUNCTION public.cancel_reservation_for_route(uuid, uuid, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_reservation_for_route(uuid, uuid, int) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_reservation_for_route(uuid, uuid, int) TO service_role;

-- Close the legacy non-tombstoning route cancels: revoke service_role so they are
-- unreachable by the app (kept defined for superuser/migration use only).
REVOKE EXECUTE ON FUNCTION public.release_invite_reservation(uuid) FROM service_role;
REVOKE EXECUTE ON FUNCTION public.cancel_attached_reservation(uuid, uuid) FROM service_role;
