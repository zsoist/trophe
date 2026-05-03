-- scripts/db/production-role-backfill.sql
--
-- Supabase-SAFE version of 0002_role_backfill.sql.
--
-- Difference from the dev migration:
--   ✗ SKIP: INSERT INTO auth.users — Supabase owns the auth schema in production;
--            this INSERT would fail with "permission denied for schema auth".
--            Daniel's auth.users row is created automatically when he first signs in.
--
--   ✓ KEEP: profiles upsert, RLS helper functions, GRANT EXECUTE.
--
-- Run via:
--   PGPASSWORD=<supabase-db-password> psql \
--     "postgresql://postgres.<project-ref>@aws-0-*.pooler.supabase.com:5432/postgres" \
--     -f scripts/db/production-role-backfill.sql
--
-- Idempotent: safe to re-run. If Daniel has not yet signed in, the SELECT from
-- auth.users returns 0 rows and the INSERT ... SELECT is a no-op.

-- ─── 1. Profiles: upsert super_admin row ──────────────────────────────────────
-- Requires Daniel to have signed in at least once (auth.users row must exist).
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

-- ─── 2. RLS helper functions ───────────────────────────────────────────────────
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

-- ─── 3. Grant execute ─────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION is_super_admin() TO public;
GRANT EXECUTE ON FUNCTION is_admin_of(uuid) TO public;
GRANT EXECUTE ON FUNCTION is_coach_of(uuid) TO public;
