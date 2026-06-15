-- 0047_client_activation_email_binding.sql — WP1 part 2: bind client activation to the
-- invited email, INSIDE the locked finalize transaction (fail-closed by construction).
--
-- The route also pre-checks this, but a route/DB error there could fail open. Enforcing it
-- in finalize_client_activation makes "if the coach issued the invite FOR a specific email,
-- the activator MUST use that email" part of the same locked claim→finalize transaction —
-- unskippable. (Email EQUALITY proves the activator knows the address; mailbox OWNERSHIP is
-- proven separately by the email-confirmation step the routes now require.)
CREATE OR REPLACE FUNCTION public.finalize_client_activation(
  p_reservation_id uuid, p_user_id uuid, p_full_name text, p_email text, p_consent_version text, p_consent_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_res public.invite_reservations%ROWTYPE; v_inv public.client_invites%ROWTYPE;
BEGIN
  SELECT * INTO v_res FROM public.invite_reservations WHERE id = p_reservation_id AND invite_type = 'client' FOR UPDATE;
  IF NOT FOUND OR v_res.status <> 'reserved' OR v_res.expires_at < now() OR v_res.user_id IS DISTINCT FROM p_user_id THEN RETURN false; END IF;
  SELECT * INTO v_inv FROM public.client_invites WHERE id = v_res.invite_id FOR UPDATE;
  IF NOT FOUND OR v_inv.status <> 'pending' OR v_inv.expires_at < now() THEN RETURN false; END IF;
  -- 0047: invited-email binding (normalized). NULL client_email = open invite (no binding).
  IF v_inv.client_email IS NOT NULL AND lower(trim(v_inv.client_email)) <> lower(trim(p_email)) THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, full_name, email, role) VALUES (p_user_id, p_full_name, p_email, 'client'::public.user_role);
  INSERT INTO public.client_profiles (user_id, coach_id, coaching_phase) VALUES (p_user_id, v_inv.coach_id, 'onboarding');
  INSERT INTO public.consents (user_id, purpose, version, status, evidence) VALUES (p_user_id, 'nutrition_processing', p_consent_version, 'granted', p_consent_evidence);
  UPDATE public.client_invites SET status = 'accepted', accepted_user_id = p_user_id WHERE id = v_inv.id AND status = 'pending';
  UPDATE public.invite_reservations SET status = 'completed', completed_at = now() WHERE id = p_reservation_id;
  RETURN true;
END; $$;
-- CREATE OR REPLACE preserves the service_role-only grant established in 0042.
