-- 0044_reservation_tombstones.sql — WP1 durable late-arrival reconciliation.
--
-- A zero-carrier reconcile result at cancel time is only a POINT-IN-TIME observation.
-- A createUser that was in flight can land AFTER the reservation is cancelled, tagging
-- an Auth user against a now-cancelled reservation. claim_orphan_for_recovery only
-- revisits 'reserved'/'recovering' rows, so that late carrier would be stranded forever.
--
-- Fix: when recovery cancels a reservation it ARMS a tombstone (reconcile_until). A
-- tombstone sweep re-reconciles cancelled+unsealed rows for a bounded retention window,
-- deleting any late carrier, and SEALS the row (terminal) only once the window has
-- elapsed. (Defense in depth: the reservation TTL — 15m — already exceeds the serverless
-- function cap (60s) that bounds any same-request createUser, so a carrier normally
-- cannot appear post-expiry; the tombstone removes the reliance on that timing invariant.)

ALTER TABLE public.invite_reservations
  ADD COLUMN IF NOT EXISTS reconcile_until timestamptz,
  ADD COLUMN IF NOT EXISTS sealed_at       timestamptz;

CREATE INDEX IF NOT EXISTS idx_invite_reservations_tombstone
  ON public.invite_reservations (reconcile_until)
  WHERE status = 'cancelled' AND sealed_at IS NULL AND reconcile_until IS NOT NULL;

-- ── cancel_recovering_reservation_tombstoned: the worker's cancel for the recovery
--    path. Same token+live-lease gating as cancel_recovering_reservation, but ATOMICALLY
--    arms the tombstone window and clears the lease so the tombstone sweep can re-lease.
--    (Atomic so a crash can't leave a cancelled row with no tombstone — the original P0.) ──
CREATE OR REPLACE FUNCTION public.cancel_recovering_reservation_tombstoned(
  p_reservation_id uuid, p_recovery_token uuid, p_retention_seconds int DEFAULT 600)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  IF p_retention_seconds <= 0 THEN RAISE EXCEPTION 'p_retention_seconds must be positive'; END IF;
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND status = 'recovering'
     AND recovery_token = p_recovery_token AND recovering_lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.invite_reservations
     SET status = 'cancelled',
         reconcile_until = now() + make_interval(secs => p_retention_seconds),
         recovering_lease_until = NULL,
         recovery_token = NULL
   WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id; END IF;
  RETURN true;
END; $$;

-- ── claim_tombstones_for_recheck: lease cancelled+unsealed tombstones whose recheck
--    lease is free. Mirrors claim_orphan_for_recovery (fresh token + lease, SKIP LOCKED). ──
CREATE OR REPLACE FUNCTION public.claim_tombstones_for_recheck(p_limit int DEFAULT 20, p_lease_seconds int DEFAULT 120)
RETURNS TABLE (reservation_id uuid, invite_type text, user_id uuid, recovery_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_lease_seconds <= 0 THEN RAISE EXCEPTION 'p_lease_seconds must be positive'; END IF;
  p_limit := LEAST(GREATEST(p_limit, 1), 1000);
  RETURN QUERY
  UPDATE public.invite_reservations r
     SET recovering_lease_until = now() + make_interval(secs => p_lease_seconds),
         recovery_token = gen_random_uuid()
   WHERE r.id IN (
     SELECT s.id FROM public.invite_reservations s
      WHERE s.status = 'cancelled' AND s.sealed_at IS NULL AND s.reconcile_until IS NOT NULL
        AND (s.recovering_lease_until IS NULL OR s.recovering_lease_until < now())
      -- Least-recently-serviced first (never-checked NULL lease jumps the queue, then by
      -- last-service time) so an oldest batch can't monopolize when prod cadence (300s)
      -- exceeds the recheck backoff. Same fairness as the completed sweep (0046).
      ORDER BY s.recovering_lease_until ASC NULLS FIRST, s.reconcile_until ASC
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit)
  RETURNING r.id, r.invite_type, r.user_id, r.recovery_token;
END; $$;

-- ── settle_tombstone: after the worker reconciles a tombstone's carriers, SEAL it if the
--    retention window has elapsed (terminal — never re-checked), else release the recheck
--    lease with backoff so it is revisited later. Token + live-lease gated. ──
CREATE OR REPLACE FUNCTION public.settle_tombstone(
  p_reservation_id uuid, p_recovery_token uuid, p_recheck_backoff_seconds int DEFAULT 120)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  IF p_recheck_backoff_seconds <= 0 THEN RAISE EXCEPTION 'p_recheck_backoff_seconds must be positive'; END IF;
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND status = 'cancelled' AND sealed_at IS NULL
     AND recovery_token = p_recovery_token AND recovering_lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN 'lost'; END IF;                       -- lease lost / already sealed
  IF now() >= v_res.reconcile_until THEN
    UPDATE public.invite_reservations
       SET sealed_at = now(), recovering_lease_until = NULL, recovery_token = NULL
     WHERE id = p_reservation_id;
    RETURN 'sealed';
  END IF;
  -- still in window: back off (keep token NULL so claim re-leases after the backoff)
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
    'public.cancel_recovering_reservation_tombstoned(uuid,uuid,int)',
    'public.claim_tombstones_for_recheck(int,int)',
    'public.settle_tombstone(uuid,uuid,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

-- Close the escape hatch: the legacy non-tombstoning cancel must NOT be reachable by the
-- app's service_role, so the DB enforces "every recovery cancellation arms a tombstone"
-- rather than relying on every caller picking the tombstoned RPC. (The function remains
-- defined for superuser/migration use; only the service_role grant is withdrawn.)
REVOKE EXECUTE ON FUNCTION public.cancel_recovering_reservation(uuid, uuid) FROM service_role;
