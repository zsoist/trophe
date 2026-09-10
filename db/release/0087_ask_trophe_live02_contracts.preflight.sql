-- Read-only preflight for project iwbpzwmidzvpiofnqexd.
-- Run before 0087. It fails closed on missing prerequisites or a partial prior install.
DO $$
DECLARE
  relation_name text;
  role_name text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY[
    'private.coach_preference_versions',
    'private.coach_action_proposals',
    'private.coach_action_receipts',
    'private.coach_food_entry_versions',
    'private.coach_attachment_uploads',
    'private.coach_chat_threads',
    'private.coach_chat_turns',
    'private.coach_photo_food_observations'
  ] LOOP
    IF to_regclass(relation_name) IS NOT NULL THEN
      RAISE EXCEPTION '0087 relation already exists: %', relation_name;
    END IF;
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'public.profiles',
    'public.client_profiles',
    'public.organizations',
    'public.organization_members',
    'public.food_log',
    'public.agent_conversation'
  ] LOOP
    IF to_regclass(relation_name) IS NULL THEN
      RAISE EXCEPTION '0087 prerequisite missing: %', relation_name;
    END IF;
  END LOOP;

  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      RAISE EXCEPTION '0087 prerequisite role missing: %', role_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'private') THEN
    RAISE EXCEPTION '0087 prerequisite schema missing: private';
  END IF;
  IF to_regclass('private.coach_pilot_budgets') IS NULL THEN
    RAISE EXCEPTION '0087 prerequisite missing: 0086 shared pilot budget authority';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'private.coach_pilot_budgets'::regclass) THEN
    RAISE EXCEPTION '0087 prerequisite RLS missing: private.coach_pilot_budgets';
  END IF;
  IF has_table_privilege('anon', 'private.coach_pilot_budgets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated', 'private.coach_pilot_budgets', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '0087 prerequisite exposes pilot budget authority to an application role';
  END IF;
  IF NOT has_table_privilege('service_role', 'private.coach_pilot_budgets', 'SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role', 'private.coach_pilot_budgets', 'TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION '0087 prerequisite service_role grants differ from 0086';
  END IF;
  IF EXISTS (
    SELECT required.column_name
    FROM (VALUES
      ('scope_key'), ('organization_id'), ('allowed_actor_ids'), ('cap_nano_usd'),
      ('operating_target_nano_usd'), ('budget_day'), ('charged_nano_usd'),
      ('attempt_count'), ('accounting_blocked')
    ) AS required(column_name)
    LEFT JOIN information_schema.columns actual
      ON actual.table_schema = 'private' AND actual.table_name = 'coach_pilot_budgets'
      AND actual.column_name = required.column_name
    WHERE actual.column_name IS NULL
  ) THEN
    RAISE EXCEPTION '0087 prerequisite 0086 budget shape incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'agent_conversation'
             AND policyname = 'coach_chat_namespace_guard') THEN
    RAISE EXCEPTION '0087 policy collision: coach_chat_namespace_guard';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
             WHERE pg_namespace.nspname = 'private' AND pg_proc.proname IN (
               'advance_coach_preference_version', 'advance_coach_food_entry_version',
               'coach_chat_content_visible', 'coach_chat_revoke_scope', 'coach_chat_thread_immutable',
               'coach_chat_turn_immutable', 'coach_chat_content_immutable', 'coach_chat_resource_guard',
               'coach_chat_contract_version', 'coach_photo_food_observation_guard',
               'coach_photo_food_no_truncate', 'coach_photo_food_auth_invalidate')) THEN
    RAISE EXCEPTION '0087 private function collision';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE NOT tgisinternal AND tgname IN (
               'coach_preference_revision', 'coach_food_entry_revision', 'coach_chat_membership_revocation',
               'coach_chat_profile_revocation', 'coach_chat_assignment_revocation', 'coach_chat_thread_immutable',
               'coach_chat_turn_immutable', 'coach_chat_content_immutable', 'coach_chat_attachment_guard',
               'coach_chat_proposal_guard', 'coach_photo_food_observation_guard', 'coach_photo_food_no_truncate',
               'coach_photo_food_profile_invalidate', 'coach_photo_food_client_invalidate',
               'coach_photo_food_membership_invalidate')) THEN
    RAISE EXCEPTION '0087 trigger collision';
  END IF;
  IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.agent_conversation'::regclass), false) THEN
    RAISE EXCEPTION '0087 prerequisite missing: agent_conversation RLS';
  END IF;
END $$;

SELECT '0087_preflight_ok' AS result;

-- Release operator must separately confirm one fixed row and adequate remaining
-- capacity. This is evidence only; this file never changes budget authority.
SELECT scope_key, cap_nano_usd, operating_target_nano_usd, charged_nano_usd,
       attempt_count, accounting_blocked
FROM private.coach_pilot_budgets
WHERE scope_key = 'ask-trophe-shared';
