-- Supabase production hardening:
-- - enable RLS on every public table
-- - replace permissive predicate-free policies
-- - keep SECURITY DEFINER helpers in an unexposed private schema
-- - deny anonymous access except the intentionally public food reference table

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
      AND role = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION private.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = (SELECT auth.uid())
      AND role IN ('coach', 'admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_admin_of(target_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT private.is_super_admin() OR EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id = target_org_id
      AND user_id = (SELECT auth.uid())
      AND role IN ('admin', 'super_admin')
  );
$$;

CREATE OR REPLACE FUNCTION private.is_coach_of(target_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT private.is_super_admin() OR EXISTS (
    SELECT 1 FROM client_profiles
    WHERE user_id = target_client_id
      AND coach_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM public, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated;

DO $$
DECLARE
  table_row record;
  policy_row record;
BEGIN
  FOR table_row IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_row.tablename);
  END LOOP;

  FOR policy_row IN
    SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_row.policyname, policy_row.tablename);
  END LOOP;
END
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;

-- Identity and tenancy.
CREATE POLICY profiles_own_select ON profiles FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);
CREATE POLICY profiles_own_insert ON profiles FOR INSERT TO authenticated
WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY profiles_own_update ON profiles FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id) WITH CHECK ((SELECT auth.uid()) = id);
CREATE POLICY profiles_coach_select ON profiles FOR SELECT TO authenticated
USING (private.is_coach_of(id));
CREATE POLICY profiles_super_admin_all ON profiles FOR ALL TO authenticated
USING (private.is_super_admin()) WITH CHECK (private.is_super_admin());

CREATE POLICY client_profiles_own_all ON client_profiles FOR ALL TO authenticated
USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY client_profiles_coach_select ON client_profiles FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));
CREATE POLICY client_profiles_coach_update ON client_profiles FOR UPDATE TO authenticated
USING (private.is_coach_of(user_id)) WITH CHECK (private.is_coach_of(user_id));

CREATE POLICY organizations_member_select ON organizations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM organization_members
  WHERE org_id = organizations.id AND user_id = (SELECT auth.uid())
));
CREATE POLICY organizations_admin_update ON organizations FOR UPDATE TO authenticated
USING (private.is_admin_of(id)) WITH CHECK (private.is_admin_of(id));
CREATE POLICY organizations_super_admin_all ON organizations FOR ALL TO authenticated
USING (private.is_super_admin()) WITH CHECK (private.is_super_admin());

CREATE POLICY organization_members_own_select ON organization_members FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY organization_members_admin_all ON organization_members FOR ALL TO authenticated
USING (private.is_admin_of(org_id)) WITH CHECK (private.is_admin_of(org_id));

-- Client health and coaching data.
CREATE POLICY food_log_own_all ON food_log FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY food_log_coach_select ON food_log FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY water_log_own_all ON water_log FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY water_log_coach_select ON water_log FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY measurements_own_all ON measurements FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY measurements_coach_select ON measurements FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY coach_notes_coach_all ON coach_notes FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id))
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id));
CREATE POLICY coach_notes_client_select ON coach_notes FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));

CREATE POLICY coach_blocks_coach_all ON coach_blocks FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id))
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id));
CREATE POLICY coach_blocks_client_visible_select ON coach_blocks FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()) AND visible_to_client = true AND active = true);

CREATE POLICY habits_templates_select ON habits FOR SELECT TO authenticated
USING (is_template = true);
CREATE POLICY habits_owner_all ON habits FOR ALL TO authenticated
USING (created_by = (SELECT auth.uid()) AND private.is_staff())
WITH CHECK (created_by = (SELECT auth.uid()) AND private.is_staff());

CREATE POLICY client_habits_client_select ON client_habits FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));
CREATE POLICY client_habits_coach_all ON client_habits FOR ALL TO authenticated
USING (private.is_coach_of(client_id)) WITH CHECK (private.is_coach_of(client_id));

CREATE POLICY habit_checkins_own_all ON habit_checkins FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY habit_checkins_coach_select ON habit_checkins FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY supplement_protocols_coach_all ON supplement_protocols FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_staff())
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_staff());
CREATE POLICY supplement_protocols_client_select ON supplement_protocols FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM client_supplements
  WHERE protocol_id = supplement_protocols.id AND user_id = (SELECT auth.uid()) AND active = true
));

CREATE POLICY supplement_log_own_all ON supplement_log FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY supplement_log_coach_select ON supplement_log FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY client_supplements_own_select ON client_supplements FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY client_supplements_coach_all ON client_supplements FOR ALL TO authenticated
USING (private.is_coach_of(user_id)) WITH CHECK (private.is_coach_of(user_id));

-- Workouts.
CREATE POLICY exercises_templates_select ON exercises FOR SELECT TO authenticated
USING (is_template = true);
CREATE POLICY exercises_owner_select ON exercises FOR SELECT TO authenticated
USING (created_by = (SELECT auth.uid()));
CREATE POLICY exercises_owner_insert ON exercises FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY workout_templates_owner_all ON workout_templates FOR ALL TO authenticated
USING (created_by = (SELECT auth.uid())) WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY workout_templates_shared_select ON workout_templates FOR SELECT TO authenticated
USING (shared = true);

CREATE POLICY workout_sessions_own_all ON workout_sessions FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY workout_sessions_coach_select ON workout_sessions FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY workout_sets_own_all ON workout_sets FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM workout_sessions
  WHERE id = workout_sets.session_id AND user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM workout_sessions
  WHERE id = workout_sets.session_id AND user_id = (SELECT auth.uid())
));
CREATE POLICY workout_sets_coach_select ON workout_sets FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM workout_sessions
  WHERE id = workout_sets.session_id AND private.is_coach_of(user_id)
));

CREATE POLICY form_analyses_own_all ON form_analyses FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY form_analyses_coach_select ON form_analyses FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

-- Food reference data. Only food_database remains intentionally anonymous.
GRANT SELECT ON food_database TO anon;
CREATE POLICY food_database_public_select ON food_database FOR SELECT TO anon, authenticated
USING (true);
CREATE POLICY food_database_staff_insert ON food_database FOR INSERT TO authenticated
WITH CHECK (private.is_staff());

CREATE POLICY custom_foods_owner_all ON custom_foods FOR ALL TO authenticated
USING (created_by = (SELECT auth.uid())) WITH CHECK (created_by = (SELECT auth.uid()));
CREATE POLICY custom_foods_shared_select ON custom_foods FOR SELECT TO authenticated
USING (shared = true);

CREATE POLICY foods_authenticated_select ON foods FOR SELECT TO authenticated USING (true);
CREATE POLICY food_aliases_authenticated_select ON food_aliases FOR SELECT TO authenticated USING (true);
CREATE POLICY food_unit_conversions_authenticated_select ON food_unit_conversions FOR SELECT TO authenticated USING (true);
DO $$
BEGIN
  IF to_regclass('public.dish_recipes') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY dish_recipes_authenticated_select ON dish_recipes FOR SELECT TO authenticated USING (true)';
    EXECUTE 'CREATE POLICY dish_recipes_staff_insert ON dish_recipes FOR INSERT TO authenticated WITH CHECK (private.is_staff())';
    EXECUTE 'CREATE POLICY dish_recipes_staff_update ON dish_recipes FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff())';
  END IF;
END
$$;

-- AI, memory, wearable, and operational data.
-- Operational records are intentionally written only through trusted
-- server/service-role connections. Never add direct authenticated INSERT
-- policies that let clients spoof AI runs, cost, usage, or ingestion records.
CREATE POLICY memory_chunks_own_all ON memory_chunks FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY memory_chunks_coach_select ON memory_chunks FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY wearable_data_own_select ON wearable_data FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY wearable_data_coach_select ON wearable_data FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE POLICY agent_conversation_own_select ON agent_conversation FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY agent_runs_own_select ON agent_runs FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY api_usage_log_own_select ON api_usage_log FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY raw_captures_own_select ON raw_captures FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY audit_log_super_admin_select ON audit_log FOR SELECT TO authenticated
USING (private.is_super_admin());

-- wearable_connections contains encrypted credentials and remains server-only.
-- No authenticated policy is intentional.

DROP FUNCTION IF EXISTS public.is_super_admin();
DROP FUNCTION IF EXISTS public.is_admin_of(uuid);
DROP FUNCTION IF EXISTS public.is_coach_of(uuid);
