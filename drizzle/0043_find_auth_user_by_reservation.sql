-- WP1: enumerate ALL Auth users carrying a reservation's TRUSTED tag.
--
-- Authority is auth.users.raw_app_meta_data ->> 'reservation_id' (app_metadata), NOT
-- raw_user_meta_data. Supabase only lets the service role / Admin API write
-- app_metadata; an authenticated user's auth.updateUser() can only change
-- user_metadata. So app_metadata is safe to use as deletion authority, user_metadata
-- is not. (https://supabase.com/docs/reference/javascript/auth-updateuser —
-- updateUser writes user_metadata; app_metadata is admin-only.)
--
-- Returns EVERY carrier (no LIMIT) so duplicate tags are fully reconciled instead of
-- silently collapsing to one arbitrary id and stranding the rest. service_role only.
CREATE OR REPLACE FUNCTION public.find_auth_user_ids_by_reservation(p_reservation_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce(array_agg(u.id), '{}')
  FROM auth.users u
  WHERE u.raw_app_meta_data ->> 'reservation_id' = p_reservation_id::text;
$$;

-- Lock down: the worker runs as service_role; nobody else may enumerate auth users.
REVOKE ALL ON FUNCTION public.find_auth_user_ids_by_reservation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_auth_user_ids_by_reservation(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.find_auth_user_ids_by_reservation(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.find_auth_user_ids_by_reservation(uuid) TO service_role;

-- Best-effort expression index for scale. Creating an index on auth.users requires
-- ownership of that table; on managed Supabase the migration role may lack it, so we
-- swallow insufficient_privilege rather than abort the migration. At current free-tier
-- user volume the predicate is cheap; a governed mapping table is the scale-up path.
DO $$
BEGIN
  CREATE INDEX IF NOT EXISTS idx_auth_users_reservation_app_tag
    ON auth.users ((raw_app_meta_data ->> 'reservation_id'));
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'skip idx on auth.users (no ownership) — predicate runs unindexed at current scale';
END $$;
