-- Exact postflight for 0087. Read-only and safe to run repeatedly.
DO $$
DECLARE
  relation_name text;
  helper_name text;
  expected_definer boolean;
  helper_oid oid;
  helper_owner oid;
  authenticated_oid oid := (SELECT oid FROM pg_roles WHERE rolname = 'authenticated');
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
    IF to_regclass(relation_name) IS NULL THEN
      RAISE EXCEPTION '0087 relation missing: %', relation_name;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = relation_name::regclass) THEN
      RAISE EXCEPTION '0087 RLS missing: %', relation_name;
    END IF;
    IF has_table_privilege('anon', relation_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
      OR has_table_privilege('authenticated', relation_name, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
      RAISE EXCEPTION '0087 direct application grant found: %', relation_name;
    END IF;
  END LOOP;

  IF private.coach_chat_contract_version() IS DISTINCT FROM 'coach-assistant.chat.v1' THEN
    RAISE EXCEPTION '0087 chat contract incomplete';
  END IF;

  FOR helper_name, expected_definer IN
    SELECT * FROM (VALUES
      ('private.advance_coach_preference_version()', true),
      ('private.advance_coach_food_entry_version()', true),
      ('private.coach_chat_content_visible(uuid,uuid,text,text)', true),
      ('private.coach_chat_revoke_scope()', true),
      ('private.coach_chat_thread_immutable()', false),
      ('private.coach_chat_turn_immutable()', false),
      ('private.coach_chat_content_immutable()', true),
      ('private.coach_chat_resource_guard()', true),
      ('private.coach_chat_contract_version()', false),
      ('private.coach_photo_food_observation_guard()', false),
      ('private.coach_photo_food_no_truncate()', false),
      ('private.coach_photo_food_auth_invalidate()', true)
    ) AS expected(helper_name, expected_definer)
  LOOP
    helper_oid := to_regprocedure(helper_name);
    IF helper_oid IS NULL THEN
      RAISE EXCEPTION '0087 helper missing: %', helper_name;
    END IF;
    SELECT proowner INTO helper_owner FROM pg_proc WHERE oid = helper_oid;
    IF helper_owner IS DISTINCT FROM (SELECT oid FROM pg_roles WHERE rolname = 'postgres') THEN
      RAISE EXCEPTION '0087 helper has untrusted owner: %', helper_name;
    END IF;
    IF (SELECT prosecdef FROM pg_proc WHERE oid = helper_oid) IS DISTINCT FROM expected_definer THEN
      RAISE EXCEPTION '0087 helper security mode differs: %', helper_name;
    END IF;
    IF has_function_privilege('anon', helper_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '0087 helper executable by anon: %', helper_name;
    END IF;
    IF helper_name = 'private.coach_chat_content_visible(uuid,uuid,text,text)' THEN
      IF NOT has_function_privilege('authenticated', helper_oid, 'EXECUTE') THEN
        RAISE EXCEPTION '0087 visibility helper missing authenticated EXECUTE';
      END IF;
    ELSIF has_function_privilege('authenticated', helper_oid, 'EXECUTE') THEN
      RAISE EXCEPTION '0087 helper unexpectedly executable by authenticated: %', helper_name;
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_proc p, LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      WHERE p.oid = helper_oid AND acl.privilege_type = 'EXECUTE'
        AND acl.grantee <> helper_owner
        AND NOT (helper_name = 'private.coach_chat_content_visible(uuid,uuid,text,text)'
                 AND acl.grantee = authenticated_oid)
    ) THEN
      RAISE EXCEPTION '0087 helper has unexpected explicit EXECUTE grant: %', helper_name;
    END IF;
  END LOOP;
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint
      WHERE conrelid = 'private.coach_action_proposals'::regclass
        AND conname = 'coach_action_proposals_action_check') NOT LIKE '%food.photo.create%' THEN
    RAISE EXCEPTION '0087 photo action constraint incomplete';
  END IF;
  IF (SELECT count(*) FROM private.coach_preference_versions) <
      (SELECT count(*) FROM public.client_profiles WHERE user_id IS NOT NULL) THEN
    RAISE EXCEPTION '0087 preference version backfill incomplete';
  END IF;
  IF (SELECT count(*) FROM private.coach_food_entry_versions) < (SELECT count(*) FROM public.food_log) THEN
    RAISE EXCEPTION '0087 food version backfill incomplete';
  END IF;
END $$;

SELECT private.coach_chat_contract_version() AS chat_contract,
       '0087_postflight_ok' AS result;
