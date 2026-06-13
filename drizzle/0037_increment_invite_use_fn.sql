-- Atomic guarded increment for beta invite-code consumption (plan B1).
-- Only increments when there are uses left; SECURITY DEFINER, callable by service role only.
CREATE OR REPLACE FUNCTION public.increment_invite_use(p_code_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beta_invite_codes
  SET used_count = used_count + 1
  WHERE id = p_code_id AND used_count < max_uses;
$$;
REVOKE ALL ON FUNCTION public.increment_invite_use(uuid) FROM public, anon, authenticated;
