-- Phase 1: seed Daniel R as super_admin + install RLS helper functions.
--
-- This migration is idempotent (ON CONFLICT DO NOTHING for the UPDATE,
-- CREATE OR REPLACE for the functions).
--
-- In local dev: sets the auth.users + profiles row for daniel@reyes.com.
-- In production (Phase 9+): Supabase Auth already owns auth.users; only the
-- profiles UPDATE runs (the INSERT is a no-op on conflict).

-- ─── 1. Auth shim: ensure Daniel's user row exists in dev ──────────────────
-- Wrapped in DO block with exception handling: on Supabase production,
-- auth.users is owned by Supabase Auth and direct INSERTs are denied
-- with "permission denied for table users". The block catches this
-- gracefully so the rest of the migration continues.
DO $$
BEGIN
  INSERT INTO auth.users (id, email)
  VALUES (
    'a0000000-0000-0000-0000-000000000001',
    'daniel@reyes.com'
  )
  ON CONFLICT (id) DO NOTHING;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'auth.users INSERT skipped (Supabase owns auth schema) — this is expected in production';
END $$;

-- ─── 2. Profiles: upsert super_admin row ──────────────────────────────────
INSERT INTO profiles (id, full_name, email, role, language, timezone)
SELECT
  au.id,
  'Daniel R',
  'daniel@reyes.com',
  'super_admin',
  'en',
  'America/Bogota'
FROM auth.users au
WHERE au.email = 'daniel@reyes.com'
ON CONFLICT (id) DO UPDATE
  SET role = 'super_admin'
WHERE profiles.email = 'daniel@reyes.com';

-- ─── 3. RLS helper functions ───────────────────────────────────────────────
-- These are SECURITY DEFINER so they execute with owner privileges,
-- bypassing RLS while still using auth.uid() for identity checks.

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION is_admin_of(org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = $1
      AND om.user_id = auth.uid()
      AND om.role IN ('super_admin', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION is_coach_of(p_client_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_profiles cp
    WHERE cp.user_id = p_client_id
      AND cp.coach_id = auth.uid()
  );
$$;

-- ─── 4. Grant execute to public role ──────────────────────────────────────
-- RLS policies call these functions; the `public` role must be able to EXECUTE.
GRANT EXECUTE ON FUNCTION is_super_admin() TO public;
GRANT EXECUTE ON FUNCTION is_admin_of(uuid) TO public;
GRANT EXECUTE ON FUNCTION is_coach_of(uuid) TO public;
