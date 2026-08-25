-- Completed workout history is durable evidence. Owners may discard an empty
-- live creation, but cannot delete a terminal strength or zero-set cardio row.
CREATE OR REPLACE FUNCTION public.enforce_workout_terminal_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_table_owner name;
BEGIN
  IF OLD.completed_at IS NULL AND OLD.duration_minutes IS NULL THEN
    RETURN OLD;
  END IF;

  SELECT pg_catalog.pg_get_userbyid(relowner)
    INTO v_table_owner
    FROM pg_catalog.pg_class
    WHERE oid = 'public.workout_sessions'::regclass;

  -- Database maintenance may remove terminal rows directly. A profile/account
  -- deletion reaches this trigger through the user_id FK cascade after the
  -- parent profile is gone; retain that explicit erasure path for authenticated
  -- users without opening ordinary session DELETE.
  IF current_user = v_table_owner
     OR (
       pg_catalog.pg_trigger_depth() > 1
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles AS profile WHERE profile.id = OLD.user_id
       )
     ) THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'Cannot delete a completed workout' USING ERRCODE = '22023';
END;
$function$;

REVOKE ALL ON FUNCTION public.enforce_workout_terminal_delete() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_workout_terminal_delete() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_workout_terminal_delete() FROM authenticated;

DROP TRIGGER IF EXISTS workout_sessions_terminal_delete_guard ON public.workout_sessions;
CREATE TRIGGER workout_sessions_terminal_delete_guard
  BEFORE DELETE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workout_terminal_delete();

CREATE OR REPLACE FUNCTION public.discard_empty_workout_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_deleted_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.workout_sessions AS session
    WHERE session.id = p_session_id
      AND session.user_id = v_user_id
      AND session.completed_at IS NULL
      AND session.duration_minutes IS NULL
      AND session.live_finish_request IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.workout_sets AS workout_set
        WHERE workout_set.session_id = session.id
      )
    RETURNING session.id INTO v_deleted_id;

  RETURN v_deleted_id IS NOT NULL;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) TO authenticated;

COMMENT ON FUNCTION public.enforce_workout_terminal_delete() IS
  'Rejects owner deletion of terminal workout history while preserving trusted maintenance and account-erasure cascades.';
COMMENT ON FUNCTION public.discard_empty_workout_session(uuid) IS
  'Deletes only an owned, nonterminal, no-set live creation that has not entered finishing.';
