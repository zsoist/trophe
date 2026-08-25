-- Terminality must not depend only on duration_minutes: an owner could clear
-- that mutable value and otherwise reopen immutable workout history.
ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone;

UPDATE public.workout_sessions
SET completed_at = COALESCE(created_at, pg_catalog.clock_timestamp())
WHERE duration_minutes IS NOT NULL
  AND completed_at IS NULL;

CREATE OR REPLACE FUNCTION public.enforce_workout_terminal_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.duration_minutes IS NOT NULL THEN
      -- The database, never caller input, stamps the one-way authority.
      NEW.completed_at := pg_catalog.clock_timestamp();
    ELSIF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot mark an unfinished workout complete' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.completed_at IS NOT NULL THEN
    -- Rolling migration 0077 may be replayed after this guard in recovery or
    -- tests. Permit only its exact, one-time derivations from already-frozen
    -- request facts; an owner cannot choose any new value through these paths.
    IF OLD.live_finish_request IS NULL
       AND NEW.live_finish_request IS NOT NULL
       AND (to_jsonb(NEW) - 'live_finish_request') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'live_finish_request')
       AND NEW.live_finish_request IS NOT DISTINCT FROM jsonb_build_object(
         'name', btrim(OLD.name), 'duration_minutes', OLD.duration_minutes,
         'template_id', OLD.template_id, 'notes', OLD.notes,
         'pain_flags', COALESCE(OLD.pain_flags, '[]'::jsonb)
       )
       AND OLD.client_request->>'mode' = 'live' THEN
      RETURN NEW;
    END IF;
    IF OLD.workout_kind IS NULL
       AND NEW.workout_kind = OLD.client_request->>'kind'
       AND NEW.workout_kind IN ('strength', 'cardio')
       AND (to_jsonb(NEW) - 'workout_kind') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'workout_kind') THEN
      RETURN NEW;
    END IF;
    IF OLD.workout_kind = 'cardio'
       AND OLD.client_request->>'mode' = 'retrospective'
       AND (to_jsonb(NEW) - ARRAY['cardio_activity', 'cardio_distance_km', 'cardio_effort'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['cardio_activity', 'cardio_distance_km', 'cardio_effort'])
       AND NEW.cardio_activity IS NOT DISTINCT FROM (CASE
         WHEN OLD.client_request->>'activity' IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')
           THEN OLD.client_request->>'activity' ELSE NULL END)
       AND NEW.cardio_distance_km IS NOT DISTINCT FROM (CASE
         WHEN jsonb_typeof(OLD.client_request->'distance_km') = 'number'
           THEN (OLD.client_request->>'distance_km')::real ELSE NULL END)
       AND NEW.cardio_effort IS NOT DISTINCT FROM (CASE
         WHEN jsonb_typeof(OLD.client_request->'effort') = 'number'
           THEN (OLD.client_request->>'effort')::real ELSE NULL END) THEN
      RETURN NEW;
    END IF;
    IF NEW.completed_at IS DISTINCT FROM OLD.completed_at
       OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.session_date IS DISTINCT FROM OLD.session_date
       OR NEW.name IS DISTINCT FROM OLD.name
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.pain_flags IS DISTINCT FROM OLD.pain_flags
       OR NEW.client_idempotency_key IS DISTINCT FROM OLD.client_idempotency_key
       OR NEW.client_request IS DISTINCT FROM OLD.client_request
       OR NEW.live_structure IS DISTINCT FROM OLD.live_structure
       OR NEW.live_structure_version IS DISTINCT FROM OLD.live_structure_version
       OR NEW.client_draft_fingerprint IS DISTINCT FROM OLD.client_draft_fingerprint
       OR NEW.pain_mutation_ids IS DISTINCT FROM OLD.pain_mutation_ids
       OR NEW.live_finish_request IS DISTINCT FROM OLD.live_finish_request
       OR NEW.workout_kind IS DISTINCT FROM OLD.workout_kind
       OR NEW.cardio_activity IS DISTINCT FROM OLD.cardio_activity
       OR NEW.cardio_distance_km IS DISTINCT FROM OLD.cardio_distance_km
       OR NEW.cardio_effort IS DISTINCT FROM OLD.cardio_effort THEN
      RAISE EXCEPTION 'Cannot reopen or mutate a completed workout' USING ERRCODE = '22023';
    END IF;
    -- template_id is intentionally excluded so its ON DELETE SET NULL foreign
    -- key keeps working for archived templates.
    RETURN NEW;
  END IF;

  IF NEW.duration_minutes IS NOT NULL THEN
    NEW.completed_at := pg_catalog.clock_timestamp();
  ELSIF NEW.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot mark an unfinished workout complete' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS workout_sessions_terminal_authority_guard ON public.workout_sessions;
CREATE TRIGGER workout_sessions_terminal_authority_guard
  BEFORE INSERT OR UPDATE ON public.workout_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_workout_terminal_authority();

CREATE OR REPLACE FUNCTION public.enforce_live_workout_set_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_structure jsonb;
  v_completed_at timestamp with time zone;
  v_expected_group integer;
  v_session_id uuid;
BEGIN
  FOR v_session_id, v_completed_at IN
    SELECT session.id, session.completed_at
      FROM public.workout_sessions AS session
      WHERE session.id = ANY (
        CASE TG_OP
          WHEN 'INSERT' THEN ARRAY[NEW.session_id]::uuid[]
          WHEN 'DELETE' THEN ARRAY[OLD.session_id]::uuid[]
          ELSE ARRAY[OLD.session_id, NEW.session_id]::uuid[]
        END
      )
      ORDER BY session.id
      FOR UPDATE
  LOOP
    IF v_completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot mutate a set in a completed workout' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  SELECT session.live_structure, session.completed_at
    INTO v_structure, v_completed_at
    FROM public.workout_sessions AS session
    WHERE session.id = NEW.session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout session is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot mutate a set in a completed workout' USING ERRCODE = '22023';
  END IF;
  IF v_structure IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT CASE
      WHEN jsonb_typeof(exercise.value->'superset_group') = 'number'
        THEN (exercise.value->>'superset_group')::integer
      ELSE NULL
    END
    INTO v_expected_group
    FROM jsonb_array_elements(v_structure) AS exercise(value)
    WHERE (exercise.value->>'exercise_id')::uuid = NEW.exercise_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exercise is not in the canonical live structure' USING ERRCODE = '22023';
  END IF;
  IF NEW.superset_group IS DISTINCT FROM v_expected_group THEN
    RAISE EXCEPTION 'Set superset group conflicts with the canonical live structure' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS workout_sets_live_structure_guard ON public.workout_sets;
CREATE TRIGGER workout_sets_live_structure_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.workout_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_live_workout_set_structure();

COMMENT ON COLUMN public.workout_sessions.completed_at IS
  'Database-owned, one-way terminal authority. Non-null workout history cannot be reopened.';
COMMENT ON FUNCTION public.enforce_workout_terminal_authority() IS
  'Stamps terminal authority and rejects owner attempts to reopen or rewrite completed history.';
COMMENT ON FUNCTION public.enforce_live_workout_set_structure() IS
  'Locks one-way workout terminal authority and rejects every set mutation after completion.';
