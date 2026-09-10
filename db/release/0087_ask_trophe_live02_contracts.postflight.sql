-- Exact postflight for 0087. Read-only and safe to run repeatedly.
DO $$
DECLARE
  relation_name text;
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
