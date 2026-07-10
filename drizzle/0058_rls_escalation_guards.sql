-- Bug hunt 2026-07-10 — close two privilege/tenant-integrity holes that the
-- own-row RLS policies left open (profiles_own_update and client_profiles_own_all
-- both allow FOR UPDATE/ALL with only a `id/user_id = auth.uid()` check, i.e. no
-- column-level restriction).
--
--  CRITICAL: any authenticated user could `UPDATE profiles SET role='super_admin'`
--            on their own row → full account takeover.
--  HIGH:     a client could `UPDATE client_profiles SET coach_id=<any coach>` on
--            their own row → self-enroll into another coach's tenant, bypassing
--            the invite flow.
--
-- Both are closed with BEFORE UPDATE triggers (the same pattern as
-- private.messages_guard_client_update in 0053). The guards only fire for the
-- offending column change AND when the caller is an authenticated non-super user
-- acting on their own row. auth.uid() is NULL for the service-role/server
-- context (signup, invite activation, admin scripts), so trusted server writes
-- and super admins are unaffected. The `private` schema + private.is_super_admin()
-- already exist (migration 0008).

CREATE OR REPLACE FUNCTION private.profiles_guard_role()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND (SELECT auth.uid()) IS NOT NULL
     AND NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'role can only be changed by a super admin';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS profiles_guard_role ON profiles;
CREATE TRIGGER profiles_guard_role BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION private.profiles_guard_role();

CREATE OR REPLACE FUNCTION private.client_profiles_guard_coach()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $fn$
BEGIN
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     AND (SELECT auth.uid()) = OLD.user_id
     AND NOT private.is_super_admin() THEN
    RAISE EXCEPTION 'clients cannot change their own coach assignment';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS client_profiles_guard_coach ON client_profiles;
CREATE TRIGGER client_profiles_guard_coach BEFORE UPDATE ON client_profiles
  FOR EACH ROW EXECUTE FUNCTION private.client_profiles_guard_coach();
