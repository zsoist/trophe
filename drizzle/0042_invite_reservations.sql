-- 0042_invite_reservations.sql — WP1 (Enterprise Remediation, BLOCKER-01/02/03/04)
-- Atomic, idempotent, fail-closed invite reservation + finalization.
-- SECURITY PRINCIPLE: finalizers DERIVE all authorization (role, coach) from the
-- LOCKED invite row and revalidate it — they never trust caller-supplied authority.
-- LIFECYCLE: claim_* (reserve) → caller creates Auth user → attach_reservation_user
-- (record orphan-risk) → finalize_* (locked, one txn, authority derived) → done.
-- On failure the caller deletes the Auth user + release_*. Recovery: the sweep frees
-- reservations with no Auth user; reservations WITH a user_id are orphans returned by
-- list_expired_orphan_reservations() for a server job to delete the Auth user first.

CREATE TABLE IF NOT EXISTS public.invite_reservations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_type         text NOT NULL CHECK (invite_type IN ('beta','client')),
  invite_id           uuid NOT NULL,
  idempotency_key     uuid NOT NULL,
  request_fingerprint text NOT NULL,
  status              text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','cancelled')),
  user_id             uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  expires_at          timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  completed_at        timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_reservation_idem_live
  ON public.invite_reservations (invite_id, idempotency_key) WHERE status IN ('reserved','completed');
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invite_live_claim
  ON public.invite_reservations (invite_id) WHERE invite_type = 'client' AND status IN ('reserved','completed');
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
  ON CONFLICT (invite_id, idempotency_key) WHERE status IN ('reserved','completed') DO NOTHING
  RETURNING * INTO v_res;

  IF v_res.id IS NULL THEN
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_code.id AND idempotency_key = p_idem AND status IN ('reserved','completed') FOR UPDATE;
    IF v_live.request_fingerprint <> p_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'conflict', NULL::uuid; RETURN;
    END IF;
    IF v_live.status = 'completed' THEN
      RETURN QUERY SELECT v_live.id, v_code.id, v_code.role, 'replayed_completed', v_live.user_id; RETURN;
    END IF;
    RETURN QUERY SELECT v_live.id, v_code.id, v_code.role, 'replayed_reserved', NULL::uuid; RETURN;
  END IF;

  UPDATE public.beta_invite_codes SET used_count = used_count + 1
   WHERE id = v_code.id AND used_count < max_uses AND (expires_at IS NULL OR expires_at > now());
  IF NOT FOUND THEN
    UPDATE public.invite_reservations SET status = 'cancelled' WHERE id = v_res.id;
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::text, 'exhausted', NULL::uuid; RETURN;
  END IF;

  RETURN QUERY SELECT v_res.id, v_code.id, v_code.role, 'claimed', NULL::uuid;
END; $$;

-- ── claim_client_invite: REPLAY-FIRST so completed retries are reachable ──────
CREATE OR REPLACE FUNCTION public.claim_client_invite(p_token uuid, p_idem uuid, p_fingerprint text)
RETURNS TABLE (reservation_id uuid, out_invite_id uuid, coach_id uuid, outcome text, res_user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_inv public.client_invites%ROWTYPE; v_res public.invite_reservations%ROWTYPE; v_live public.invite_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.client_invites WHERE token = p_token;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'invalid', NULL::uuid; RETURN; END IF;

  -- Idempotent replay BEFORE the pending check: a retry after successful activation
  -- (invite now 'accepted') must still resolve to its completed reservation.
  SELECT * INTO v_live FROM public.invite_reservations
   WHERE invite_id = v_inv.id AND idempotency_key = p_idem AND status IN ('reserved','completed') FOR UPDATE;
  IF v_live.id IS NOT NULL THEN
    IF v_live.request_fingerprint <> p_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict', NULL::uuid; RETURN;
    END IF;
    IF v_live.status = 'completed' THEN
      RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_completed', v_live.user_id; RETURN;
    END IF;
    RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_reserved', NULL::uuid; RETURN;
  END IF;

  -- Fresh claim requires a pending, unexpired invite.
  IF v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN
    RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'invalid', NULL::uuid; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status)
    VALUES ('client', v_inv.id, p_idem, p_fingerprint, 'reserved')
    RETURNING * INTO v_res;
    RETURN QUERY SELECT v_res.id, v_inv.id, v_inv.coach_id, 'claimed', NULL::uuid;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent: either our own key (idempotency index) or another claimant
    -- (one-live-claim index). Re-resolve OUR key; only ever return our reservation.
    SELECT * INTO v_live FROM public.invite_reservations
     WHERE invite_id = v_inv.id AND idempotency_key = p_idem AND status IN ('reserved','completed') FOR UPDATE;
    IF v_live.id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'exhausted', NULL::uuid; RETURN; -- another claimant
    END IF;
    IF v_live.request_fingerprint <> p_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::uuid, NULL::uuid, 'conflict', NULL::uuid; RETURN;
    END IF;
    IF v_live.status = 'completed' THEN
      RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_completed', v_live.user_id; RETURN;
    END IF;
    RETURN QUERY SELECT v_live.id, v_inv.id, v_inv.coach_id, 'replayed_reserved', NULL::uuid;
  END;
END; $$;

-- ── attach_reservation_user: record the created Auth user (orphan-recovery hook) ──
CREATE OR REPLACE FUNCTION public.attach_reservation_user(p_reservation_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.invite_reservations SET user_id = p_user_id
   WHERE id = p_reservation_id AND status = 'reserved';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n = 1;
END; $$;

-- ── finalize_beta_signup: lock+revalidate the beta code; DERIVE role from it ──
CREATE OR REPLACE FUNCTION public.finalize_beta_signup(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text,
  p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_code public.beta_invite_codes%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND invite_type = 'beta' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() THEN RETURN false; END IF;
  SELECT * INTO v_code FROM public.beta_invite_codes WHERE id = v_res.invite_id FOR UPDATE; -- lock + revalidate
  IF NOT FOUND OR (v_code.expires_at IS NOT NULL AND v_code.expires_at < now()) THEN RETURN false; END IF;
  IF v_code.role NOT IN ('coach','admin') THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, v_code.role::public.user_role);
  INSERT INTO public.consents (user_id, purpose, version, status, evidence)
  VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.invite_reservations SET status = 'completed', user_id = p_user_id, completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- ── finalize_client_activation: coach DERIVED from locked invite; invite revalidated ──
CREATE OR REPLACE FUNCTION public.finalize_client_activation(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text,
  p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_inv public.client_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations
   WHERE id = p_reservation_id AND invite_type = 'client' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() THEN RETURN false; END IF;
  SELECT * INTO v_inv FROM public.client_invites WHERE id = v_res.invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coach_id, coaching_phase) VALUES (p_user_id, v_inv.coach_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence)
  VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.client_invites SET status = 'accepted', accepted_user_id = p_user_id WHERE id = v_inv.id AND status = 'pending';
  UPDATE public.invite_reservations SET status = 'completed', user_id = p_user_id, completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;

-- ── finalize_ordinary_signup: no-invite client signup (atomic, fail-closed consent) ──
CREATE OR REPLACE FUNCTION public.finalize_ordinary_signup(
  p_user_id uuid, p_full_name text, p_email text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coaching_phase) VALUES (p_user_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence)
  VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
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
  END IF;
END; $$;

-- ── recovery: sweep ONLY orphan-free expired reservations (no Auth user to clean) ──
CREATE OR REPLACE FUNCTION public.expire_stale_invite_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.invite_reservations
     WHERE status = 'reserved' AND expires_at < now() AND user_id IS NULL
     FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM public.release_invite_reservation(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $$;

-- ── orphans: expired reservations WITH an Auth user — the server recovery job must
--    delete the Auth user (Admin API) THEN call release_invite_reservation(id). ──
CREATE OR REPLACE FUNCTION public.list_expired_orphan_reservations()
RETURNS TABLE (reservation_id uuid, invite_type text, user_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT id, invite_type, user_id FROM public.invite_reservations
   WHERE status = 'reserved' AND expires_at < now() AND user_id IS NOT NULL;
$$;

-- ── Lock down execution: service_role only (all are SECURITY DEFINER) ─────────
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_beta_invite(text,uuid,text)',
    'public.claim_client_invite(uuid,uuid,text)',
    'public.attach_reservation_user(uuid,uuid)',
    'public.finalize_beta_signup(uuid,uuid,text,text,text,jsonb)',
    'public.finalize_client_activation(uuid,uuid,text,text,text,jsonb)',
    'public.finalize_ordinary_signup(uuid,text,text,text,jsonb)',
    'public.release_invite_reservation(uuid)',
    'public.expire_stale_invite_reservations()',
    'public.list_expired_orphan_reservations()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
