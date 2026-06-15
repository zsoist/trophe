-- WP1: server-side lookup of an Auth user by its reservation tag.
--
-- Replaces a client-side service.auth.admin.listUsers() scan that could only inspect
-- a bounded number of pages and therefore could NOT distinguish "no such user" from
-- "user exists past the scan bound" — a false negative would let the recovery worker
-- free a reservation while leaving the tagged Auth user stranded.
--
-- This is a single indexed-ish predicate over auth.users, so a NULL result is a
-- conclusive "no Auth user carries this reservation_id". service_role only.
CREATE OR REPLACE FUNCTION public.find_auth_user_id_by_reservation(p_reservation_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT u.id
  FROM auth.users u
  WHERE u.raw_user_meta_data ->> 'reservation_id' = p_reservation_id::text
  LIMIT 1;
$$;

-- Lock down: the worker runs as service_role; nobody else may enumerate auth users.
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_reservation(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.find_auth_user_id_by_reservation(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_id_by_reservation(uuid) TO service_role;
