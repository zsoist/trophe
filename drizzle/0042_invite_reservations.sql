-- 0042_invite_reservations.sql — WP1 (Enterprise Remediation, BLOCKER-01/02/03/04)
-- Reservation ownership + recovery STATE MACHINE.
--   reserved --attach(user, CAS)--> reserved(+user) --finalize(user match)--> completed
--   reserved(±user, expired) --claim_orphan(lease+token)--> recovering --cancel(token)--> cancelled
--   (no blind sweep: EVERY expired reservation is leased + Auth-reconciled before cancel)
-- SECURITY: finalizers DERIVE role/coach from the locked invite AND require the
-- reservation's attached user_id == caller's user_id. attach is compare-and-set.
-- Recovery leases expired+attached reservations so a worker can delete the orphan
-- Auth user (Admin API) before freeing the slot — without racing a live finalize.

CREATE TABLE IF NOT EXISTS public.invite_reservations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_type           text NOT NULL CHECK (invite_type IN ('beta','client','ordinary')),
  invite_id             uuid NOT NULL,
  idempotency_key       uuid NOT NULL,
  request_fingerprint   text NOT NULL,
  status                text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','cancelled','recovering')),
  user_id               uuid,
  recovering_lease_until timestamptz,
  recovery_token        uuid,                -- minted per lease; required to cancel a recovering row
  created_at            timestamptz NOT NULL DEFAULT now(),
  expires_at            timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  completed_at          timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_idem_live
  ON public.invite_reservations (invite_id, idempotency_key) WHERE status IN ('reserved','completed','recovering');
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invite_live_claim
  ON public.invite_reservations (invite_id) WHERE invite_type = 'client' AND status IN ('reserved','completed','recovering');
-- ordinary signup: at most ONE live reservation per identity (invite_id = pseudo-id
-- the route derives from the normalised email), so different retry keys converge.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ordinary_live_claim
  ON public.invite_reservations (invite_id) WHERE invite_type = 'ordinary' AND status IN ('reserved','completed','recovering');
CREATE INDEX IF NOT EXISTS idx_invite_reservations_sweep
  ON public.invite_reservations (status, expires_at);

ALTER TABLE public.invite_reservations ENABLE ROW LEVEL SECURITY; -- deny-all; service_role bypasses

-- ── claim_beta_invite: idempotency-first reserve, then guarded increment ──────
CREATE OR REPLACE FUNCTION public.claim_beta_invite(p_code text, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, out_invite_id uuid, invite_role text, outcome text, res_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_code public.beta_invite_codes%ROWTYPE; v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_code FROM public.beta_invite_codes WHERE code = p_code;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'invalid', NULL::uuid; RETURN; END IF;

  INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
  VALUES ('beta', v_code.id, p_idem, p_fingerprint, 'reserved')
  ON CONFLICT (invite_id, idempotency_key) WHERE status IN ('reserved','completed','recovering') DO NOTHING
  RETURNING * INTO v_res;

  IF v_res.id IS NULL THEN
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_code.id AND idempotency_key = p_idem AND status IN ('reserved','completed','recovering') FOR UPDATE;
    IF v_live.request_fingerprint <> p_fingerprint THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'conflict', NULL::uuid; RETURN; END IF;
    IF v_live.status = 'completed' THEN RETURN QUERY SELECT v_live.id, v_code.id, v_code.role, 'replayed_completed', v_live.user_id; RETURN; END IF;
    IF v_live.status = 'recovering' THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'conflict', NULL::uuid; RETURN; END IF;
    RETURN QUERY SELECT v_live.id, v_code.id, v_code.role, 'replayed_reserved', v_live.user_id; RETURN; -- returns attached user
  END IF;

  UPDATE public.beta_invite_codes SET used_count = used_count + 1
   WHERE id = v_code.id AND used_count < max_uses AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = v_res.id;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'exhausted', NULL::uuid; RETURN;
  END IF;
  RETURN QUERY SELECT v_res.id, v_code.id, v_code.role, 'claimed', NULL::uuid;
END; $$;

-- ── claim_client_invite: replay-first; idempotency + one-live-claim ───────────
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token uuid, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, out_invite_id uuid, coach_id uuid, outcome text, res_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_inv public.client_invites%ROWTYPE; v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.client_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'invalid', NULL::uuid; RETURN; END IF;

  SELECT * INTO v_live FROM public.invite_reservations
   WHERE invite_id = v_inv.id AND idempotency_key = p_idem AND status IN ('reserved','completed','recovering') FOR UPDATE;
  IF v_live.id IS NOT NULL THEN
    IF v_live.request_fingerprint <> p_fingerprint THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict', NULL::uuid; RETURN; END IF;
    IF v_live.status = 'completed' THEN RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_completed', v_live.user_id; RETURN; END IF;
    IF v_live.status = 'recovering' THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict', NULL::uuid; RETURN; END IF;
    RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_reserved', v_live.user_id; RETURN;
  END IF;

  IF v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'invalid', NULL::uuid; RETURN; END IF;

  BEGIN
    INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
    VALUES ('client', v_inv.id, p_idem, p_fingerprint, 'reserved') RETURNING * INTO v_res;
    RETURN QUERY SELECT v_res.id, v_inv.id, v_inv.coach_id, 'claimed', NULL::uuid;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_inv.id AND idempotency_key = p_idem AND status IN ('reserved','completed','recovering') FOR UPDATE;
    IF v_live.id IS NULL THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'exhausted', NULL::uuid; RETURN; END IF;
    IF v_live.request_fingerprint <> p_fingerprint OR v_live.status = 'recovering' THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict', NULL::uuid; RETURN; END IF;
    IF v_live.status = 'completed' THEN RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_completed', v_live.user_id; RETURN; END IF;
    RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_reserved', v_live.user_id;
  END;
END; $$;

-- ── claim_ordinary_signup: no-invite client signup gets a reservation too ─────
-- p_pseudo_invite is a deterministic uuid the route derives from the normalised email,
-- so retries converge and orphan recovery covers ordinary signups.
CREATE OR REPLACE FUNCTION public.claim_ordinary_signup(p_pseudo_invite uuid, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, outcome text, res_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
    VALUES ('ordinary', p_pseudo_invite, p_idem, p_fingerprint, 'reserved') RETURNING * INTO v_res;
    RETURN QUERY SELECT v_res.id, 'claimed', NULL::uuid; RETURN;
  EXCEPTION WHEN unique_violation THEN
    -- Either our key (idempotency) or another live signup for this identity (one-live).
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = p_pseudo_invite AND idempotency_key = p_idem AND status IN ('reserved','completed','recovering') FOR UPDATE;
    IF v_live.id IS NULL THEN RETURN QUERY SELECT NULL::uuid, 'conflict', NULL::uuid; RETURN; END IF; -- different key, same identity
    IF v_live.request_fingerprint <> p_fingerprint OR v_live.status = 'recovering' THEN RETURN QUERY SELECT NULL::uuid, 'conflict', NULL::uuid; RETURN; END IF;
    IF v_live.status = 'completed' THEN RETURN QUERY SELECT v_live.id, 'replayed_completed', v_live.user_id; RETURN; END IF;
    RETURN QUERY SELECT v_live.id, 'replayed_reserved', v_live.user_id;
  END;
END; $$;

-- ── attach_reservation_user: compare-and-set (cannot overwrite a different user) ──
CREATE OR REPLACE FUNCTION public.attach_reservation_user(p_reservation_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'gone'; END IF;
  IF v_res.user_id IS NOT NULL AND v_res.user_id <> p_user_id THEN RETURN 'conflict'; END IF;
  IF v_res.status <> 'reserved' OR v_res.expires_at < now() THEN RETURN 'gone'; END IF;
  UPDATE public.invite_reservations SET user_id = p_user_id WHERE id = p_reservation_id;
  RETURN 'attached';
END; $$;

-- ── finalizers: require status='reserved', not expired, AND user_id = caller ──
CREATE OR REPLACE FUNCTION public.finalize_beta_signup(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_code public.beta_invite_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND invite_type = 'beta' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() OR v_res.user_id IS DISTINCT FROM p_user_id THEN RETURN false; END IF;
  SELECT * INTO v_code FROM public.beta_invite_codes WHERE id = v_res.invite_id FOR UPDATE;
  IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at < now()) OR v_code.role NOT IN ('coach','admin') THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, v_code.role::public.user_role);
  INSERT INTO public.consents (user_id, purpose, version, status, evidence) VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.invite_reservations SET status = 'completed', completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_client_activation(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_inv public.client_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND invite_type = 'client' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() OR v_res.user_id IS DISTINCT FROM p_user_id THEN RETURN false; END IF;
  SELECT * INTO v_inv FROM public.client_invites WHERE id = v_res.invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coach_id, coaching_phase) VALUES (p_user_id, v_inv.coach_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence) VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.client_invites SET status = 'accepted', accepted_user_id = p_user_id WHERE id = v_inv.id AND status = 'pending';
  UPDATE public.invite_reservations SET status = 'completed', completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.finalize_ordinary_signup(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND invite_type = 'ordinary' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() OR v_res.user_id IS DISTINCT FROM p_user_id THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coaching_phase) VALUES (p_user_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence) VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.invite_reservations SET status = 'completed', completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- ── release_invite_reservation: ONLY unattached reservations (no orphan Auth user) ──
CREATE OR REPLACE FUNCTION public.release_invite_reservation(p_reservation_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND status = 'reserved' AND user_id IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF; -- refuses attached reservations
  UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id; END IF;
  RETURN true;
END; $$;

-- ── cancel_attached_reservation: after the caller deletes the orphan Auth user ──
-- Used by route compensation (status='reserved') AND the recovery worker (status='recovering').
CREATE OR REPLACE FUNCTION public.cancel_attached_reservation(p_reservation_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  -- Synchronous route compensation only: a 'reserved' row the route still owns. A row
  -- already leased to the recovery worker ('recovering') is off-limits — only the
  -- token-holding cancel_recovering_reservation may cancel those.
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND user_id = p_user_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id; END IF;
  RETURN true;
END; $$;

-- ── cancel_recovering_reservation: the worker cancels a LEASED reservation after it
--    has reconciled the external Auth user (deleted it if present). The recovery lease
--    is the worker's ownership; this frees the slot. There is NO blind sweep — every
--    expired reservation is leased via claim_orphan_for_recovery and reconciled first. ──
CREATE OR REPLACE FUNCTION public.cancel_recovering_reservation(p_reservation_id uuid, p_recovery_token uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  -- Token-AND-lease gated: the worker must hold the current token AND its lease must
  -- still be valid. An expired lease means the worker no longer owns the row (even
  -- before another worker reclaims it), so it must not mutate it.
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND status = 'recovering'
     AND recovery_token = p_recovery_token AND recovering_lease_until > now() FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id; END IF;
  RETURN true;
END; $$;

-- ── claim_orphan_for_recovery: atomically LEASE expired+attached (or lease-expired
--    recovering) reservations → 'recovering'. Worker deletes the Auth user, then
--    cancel_recovering_reservation (token + live-lease gated). Finalizers reject 'recovering'. ──
CREATE OR REPLACE FUNCTION public.claim_orphan_for_recovery(p_limit int DEFAULT 50, p_lease_seconds int DEFAULT 120)
RETURNS TABLE (reservation_id uuid, invite_type text, user_id uuid, recovery_token uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_lease_seconds <= 0 THEN RAISE EXCEPTION 'p_lease_seconds must be positive'; END IF;
  p_limit := LEAST(GREATEST(p_limit, 1), 1000);
  -- Leases ALL expired reservations (attached OR not): an unattached-expired row may
  -- still hide a pre-attach orphan Auth user, so the worker must reconcile every one
  -- against Auth before cancelling. No reservation is ever blind-released. Each lease
  -- mints a fresh recovery_token; only the holder of the current token may cancel.
  RETURN QUERY
  UPDATE public.invite_reservations r
     SET status = 'recovering',
         recovering_lease_until = now() + make_interval(secs => p_lease_seconds),
         recovery_token = gen_random_uuid()
   WHERE r.id IN (
     SELECT s.id FROM public.invite_reservations s
      WHERE (s.status = 'reserved' AND s.expires_at < now())
         OR (s.status = 'recovering' AND s.recovering_lease_until < now())
      ORDER BY s.expires_at
      FOR UPDATE SKIP LOCKED
      LIMIT p_limit)
  RETURNING r.id, r.invite_type, r.user_id, r.recovery_token;
END; $$;

-- ── Lock down execution: service_role only (all SECURITY DEFINER) ─────────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_beta_invite(text,uuid,text)',
    'public.claim_client_invite(uuid,uuid,text)',
    'public.claim_ordinary_signup(uuid,uuid,text)',
    'public.attach_reservation_user(uuid,uuid)',
    'public.finalize_beta_signup(uuid,uuid,text,text,text,jsonb)',
    'public.finalize_client_activation(uuid,uuid,text,text,text,jsonb)',
    'public.finalize_ordinary_signup(uuid,uuid,text,text,text,jsonb)',
    'public.release_invite_reservation(uuid)',
    'public.cancel_attached_reservation(uuid,uuid)',
    'public.cancel_recovering_reservation(uuid,uuid)',
    'public.claim_orphan_for_recovery(int,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
