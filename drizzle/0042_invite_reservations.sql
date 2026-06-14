-- 0042_invite_reservations.sql — WP1 (Enterprise Remediation, BLOCKER-01/02)
-- Atomic invite reservation + claim RPCs. The route claims an invite (atomically,
-- with a unique idempotency key) BEFORE creating the external Supabase Auth user,
-- then completes the reservation after profile+consent persist, or releases it on
-- failure. This makes elevated signup and client activation concurrency-safe:
-- only the permitted number of accounts can ever be created.

CREATE TABLE IF NOT EXISTS invite_reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_type     text NOT NULL CHECK (invite_type IN ('beta','client')),
  invite_id       uuid NOT NULL,
  idempotency_key text NOT NULL,
  status          text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','completed','cancelled')),
  user_id         uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  completed_at    timestamptz,
  -- Retries with the same key never double-claim: they resolve to the same row.
  UNIQUE (invite_id, idempotency_key)
);

-- A client invite may have at most ONE live claim (reserved or completed).
CREATE UNIQUE INDEX IF NOT EXISTS uq_client_invite_live_claim
  ON invite_reservations (invite_id)
  WHERE invite_type = 'client' AND status IN ('reserved','completed');

CREATE INDEX IF NOT EXISTS idx_invite_reservations_sweep
  ON invite_reservations (status, expires_at);

-- Service-role only. RLS enabled with no policies → deny-all for anon/authenticated;
-- the service role (server routes) bypasses RLS.
ALTER TABLE invite_reservations ENABLE ROW LEVEL SECURITY;

-- ── claim_beta_invite: atomic guarded increment for elevated (coach/admin) codes ──
CREATE OR REPLACE FUNCTION claim_beta_invite(p_code text, p_idempotency_key text)
RETURNS TABLE (reservation_id uuid, invite_id uuid, invite_role text, claim_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_code  beta_invite_codes%ROWTYPE;
  v_res   invite_reservations%ROWTYPE;
BEGIN
  -- Idempotent replay: same key on the same code returns the existing reservation.
  SELECT r.* INTO v_res
    FROM invite_reservations r
    JOIN beta_invite_codes c ON c.id = r.invite_id
   WHERE c.code = p_code AND r.idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY
      SELECT v_res.id, v_res.invite_id,
             (SELECT role FROM beta_invite_codes WHERE id = v_res.invite_id),
             v_res.status;
    RETURN;
  END IF;

  -- Atomic gate: increments only if a slot is free and the code is not expired.
  UPDATE beta_invite_codes
     SET used_count = used_count + 1
   WHERE code = p_code
     AND used_count < max_uses
     AND (expires_at IS NULL OR expires_at > now())
  RETURNING * INTO v_code;
  IF NOT FOUND THEN
    RETURN; -- invalid / exhausted / expired → no reservation
  END IF;

  BEGIN
    INSERT INTO invite_reservations (invite_type, invite_id, idempotency_key, status)
    VALUES ('beta', v_code.id, p_idempotency_key, 'reserved')
    RETURNING * INTO v_res;
  EXCEPTION WHEN unique_violation THEN
    -- A concurrent call with the SAME key won the insert; give back our extra
    -- increment and return the winner's reservation.
    UPDATE beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_code.id;
    SELECT * INTO v_res FROM invite_reservations
     WHERE invite_id = v_code.id AND idempotency_key = p_idempotency_key LIMIT 1;
  END;

  RETURN QUERY SELECT v_res.id, v_code.id, v_code.role, v_res.status;
END;
$$;

-- ── claim_client_invite: atomic pending→claimed transition for coach client invites ──
CREATE OR REPLACE FUNCTION claim_client_invite(p_token uuid, p_idempotency_key text)
RETURNS TABLE (reservation_id uuid, invite_id uuid, coach_id uuid, claim_status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inv  client_invites%ROWTYPE;
  v_res  invite_reservations%ROWTYPE;
BEGIN
  SELECT r.* INTO v_res
    FROM invite_reservations r
    JOIN client_invites i ON i.id = r.invite_id
   WHERE i.token = p_token AND r.idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    RETURN QUERY
      SELECT v_res.id, v_res.invite_id,
             (SELECT coach_id FROM client_invites WHERE id = v_res.invite_id),
             v_res.status;
    RETURN;
  END IF;

  -- Atomic gate: only one request flips pending → claimed.
  UPDATE client_invites
     SET status = 'claimed'
   WHERE token = p_token
     AND status = 'pending'
     AND expires_at > now()
  RETURNING * INTO v_inv;
  IF NOT FOUND THEN
    RETURN; -- not pending / expired / invalid
  END IF;

  BEGIN
    INSERT INTO invite_reservations (invite_type, invite_id, idempotency_key, status)
    VALUES ('client', v_inv.id, p_idempotency_key, 'reserved')
    RETURNING * INTO v_res;
  EXCEPTION WHEN unique_violation THEN
    -- Lost the live-claim/idempotency race; revert our transition is unnecessary
    -- (the winner holds the claim). Return the existing reservation.
    SELECT * INTO v_res FROM invite_reservations
     WHERE invite_id = v_inv.id ORDER BY created_at LIMIT 1;
  END;

  RETURN QUERY SELECT v_res.id, v_inv.id, v_inv.coach_id, v_res.status;
END;
$$;

-- ── complete: mark a reservation done once the account + consent are durable ──
CREATE OR REPLACE FUNCTION complete_invite_reservation(p_reservation_id uuid, p_user_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE invite_reservations
     SET status = 'completed', user_id = p_user_id, completed_at = now()
   WHERE id = p_reservation_id AND status = 'reserved';
$$;

-- ── release: compensate a failed claim — cancel + give the slot back ──
CREATE OR REPLACE FUNCTION release_invite_reservation(p_reservation_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_res invite_reservations%ROWTYPE;
BEGIN
  UPDATE invite_reservations SET status = 'cancelled'
   WHERE id = p_reservation_id AND status = 'reserved'
  RETURNING * INTO v_res;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_res.invite_type = 'beta' THEN
    UPDATE beta_invite_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id = v_res.invite_id;
  ELSE
    UPDATE client_invites SET status = 'pending' WHERE id = v_res.invite_id AND status = 'claimed';
  END IF;
END;
$$;

-- ── recovery: sweep abandoned (still-reserved, expired) claims back to available ──
CREATE OR REPLACE FUNCTION expire_stale_invite_reservations()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_count int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM invite_reservations
     WHERE status = 'reserved' AND expires_at < now()
  LOOP
    PERFORM release_invite_reservation(v_id);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
