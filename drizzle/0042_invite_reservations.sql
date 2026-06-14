-- 0042_invite_reservations.sql — WP1 (Enterprise Remediation, BLOCKER-01/02/03/04)
-- Atomic, idempotent, fail-closed invite reservation + finalization.
-- Flow: claim_* (atomic reserve) → caller creates Supabase Auth user → finalize_*
-- (locked, one-transaction profile+consent+invite+reservation) → done; on any failure
-- the caller deletes the Auth user and release_* gives the slot back. A recovery sweep
-- reclaims abandoned reservations. All RPCs are service_role-only.

CREATE TABLE IF NOT EXISTS public.invite_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_type         text NOT NULL CHECK (invite_type IN ('beta','client')),
  invite_id           uuid NOT NULL,
  idempotency_key     uuid NOT NULL,                 -- bounded (UUID), not free text
  request_fingerprint text NOT NULL,                 -- binds the key to the payload
  status              text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','cancelled')),
  user_id             uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  completed_at        timestamptz
);

-- Idempotency: at most one LIVE reservation per (invite, key). Cancelled rows don't
-- block a fresh re-claim with the same key (defined cancelled-replay semantics).
CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_idem_live
  ON public.invite_reservations (invite_id, idempotency_key)
  WHERE status IN ('reserved','completed');

-- A client invite may have at most ONE live claim, regardless of key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invite_live_claim
  ON public.invite_reservations (invite_id)
  WHERE invite_type = 'client' AND status IN ('reserved','completed');

CREATE INDEX IF NOT EXISTS idx_invite_reservations_sweep
  ON public.invite_reservations (status, expires_at);

ALTER TABLE public.invite_reservations ENABLE ROW LEVEL SECURITY; -- deny-all; service_role bypasses

-- ── claim_beta_invite: idempotency-first reserve, then guarded increment ──────
CREATE OR REPLACE FUNCTION public.claim_beta_invite(p_code text, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, out_invite_id uuid, invite_role text, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_code public.beta_invite_codes%ROWTYPE; v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_code FROM public.beta_invite_codes WHERE code = p_code;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'invalid'; RETURN; END IF;

  -- Idempotency-first: claim the (invite,key) slot. ON CONFLICT on the live partial
  -- index makes concurrent same-key calls converge on ONE reservation.
  INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
  VALUES ('beta', v_code.id, p_idem, p_fingerprint, 'reserved')
  ON CONFLICT (invite_id, idempotency_key) WHERE status IN ('reserved','completed') DO NOTHING
  RETURNING * INTO v_res;

  IF v_res.id IS NULL THEN
    -- Same key already has a live reservation → idempotent replay (fingerprint must match).
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_code.id AND idempotency_key = p_idem AND status IN ('reserved','completed')
     FOR UPDATE;
    IF v_live.request_fingerprint <> p_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'conflict'; RETURN;
    END IF;
    RETURN QUERY SELECT v_live.id, v_code.id, v_code.role, 'replayed'; RETURN;
  END IF;

  -- New reservation row created: now atomically take a slot.
  UPDATE public.beta_invite_codes SET used_count = used_count + 1
   WHERE id = v_code.id AND used_count < max_uses AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    -- Exhausted/expired: release the idempotency slot we just took.
    UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = v_res.id;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'exhausted'; RETURN;
  END IF;

  RETURN QUERY SELECT v_res.id, v_code.id, v_code.role, 'claimed';
END; $$;

-- ── claim_client_invite: idempotency + one-live-claim, no client_invites.status change ──
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token uuid, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, out_invite_id uuid, coach_id uuid, outcome text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_inv public.client_invites%ROWTYPE; v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.client_invites WHERE token = p_token;
  IF NOT FOUND OR v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'invalid'; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
    VALUES ('client', v_inv.id, p_idem, p_fingerprint, 'reserved')
    RETURNING * INTO v_res;
    RETURN QUERY SELECT v_res.id, v_inv.id, v_inv.coach_id, 'claimed';
  EXCEPTION WHEN unique_violation THEN
    -- Either our own key (idempotent replay) or another claimant already holds the
    -- single live claim. Only ever return OUR reservation, never another's.
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_inv.id AND idempotency_key = p_idem AND status IN ('reserved','completed')
     FOR UPDATE;
    IF v_live.id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'exhausted'; RETURN; -- another claimant
    END IF;
    IF v_live.request_fingerprint <> p_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict'; RETURN;
    END IF;
    RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed';
  END;
END; $$;

-- ── finalize_beta_signup: locked, atomic profile+consent+complete (fail-closed) ──
CREATE OR REPLACE FUNCTION public.finalize_beta_signup(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text,
  p_role text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() THEN
    RETURN false; -- lost to expiry/cancel: caller must delete the Auth user
  END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, p_role::public.user_role);
  IF p_role = 'client' THEN
    INSERT INTO public.client_profiles (user_id, coaching_phase) VALUES (p_user_id, 'onboarding');
  END IF;
  INSERT INTO public.consents (user_id, purpose, version, status, evidence)
  VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.invite_reservations SET status = 'completed', user_id = p_user_id, completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- ── finalize_client_activation: locked, atomic profile+client_profile+consent+accept ──
CREATE OR REPLACE FUNCTION public.finalize_client_activation(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text,
  p_coach_id uuid, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coach_id, coaching_phase) VALUES (p_user_id, p_coach_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence)
  VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.client_invites SET status = 'accepted', accepted_user_id = p_user_id WHERE id = v_res.invite_id;
  UPDATE public.invite_reservations SET status = 'completed', user_id = p_user_id, completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- ── release: compensate a failed claim (locked) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.release_invite_reservation(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND status = 'reserved' FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = p_reservation_id;
  IF v_res.invite_type = 'beta' THEN
    UPDATE public.beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id;
  END IF; -- client: status was never changed, so nothing to revert
END; $$;

-- ── recovery sweep: reclaim abandoned reservations (skip in-flight finalizes) ──
CREATE OR REPLACE FUNCTION public.expire_stale_invite_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.invite_reservations
     WHERE status = 'reserved' AND expires_at < now()
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.release_invite_reservation(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ── Lock down execution: service_role only (these are SECURITY DEFINER) ───────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_beta_invite(text,uuid,text)',
    'public.claim_client_invite(uuid,uuid,text)',
    'public.finalize_beta_signup(uuid,uuid,text,text,text,text,jsonb)',
    'public.finalize_client_activation(uuid,uuid,text,text,uuid,text,jsonb)',
    'public.release_invite_reservation(uuid)',
    'public.expire_stale_invite_reservations()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
