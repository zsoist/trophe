-- A completed workout is immutable history. Cover every set mutation, not only
-- structural columns, while retaining canonical structure checks for live rows.
CREATE OR REPLACE FUNCTION public.enforce_live_workout_set_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_structure jsonb;
  v_duration integer;
  v_expected_group integer;
  v_session_id uuid;
BEGIN
  -- Lock both parents when a row is moved so finish cannot race the write.
  FOR v_session_id, v_duration IN
    SELECT session.id, session.duration_minutes
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
    IF v_duration IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot mutate a set in a completed workout' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  IF TG_OP = 'DELETE' THEN
    -- Parent removal may cascade after its session row is unavailable.
    RETURN OLD;
  END IF;

  SELECT session.live_structure, session.duration_minutes
    INTO v_structure, v_duration
    FROM public.workout_sessions AS session
    WHERE session.id = NEW.session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout session is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot mutate a set in a completed workout' USING ERRCODE = '22023';
  END IF;

  -- Retrospective transactions and controlled legacy sessions may have no
  -- structure. Terminal authority above still applies.
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

DROP TRIGGER IF EXISTS workout_sets_terminal_delete_guard ON public.workout_sets;
DROP TRIGGER IF EXISTS workout_sets_live_structure_guard ON public.workout_sets;
CREATE TRIGGER workout_sets_live_structure_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.workout_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_live_workout_set_structure();

COMMENT ON FUNCTION public.enforce_live_workout_set_structure() IS
  'Locks workout-session authority and rejects every set mutation after completion.';
