ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS client_idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS client_request jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_user_id_client_idempotency_key_unique
  ON public.workout_sessions (user_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.start_workout_session(
  p_idempotency_key uuid,
  p_session_date date,
  p_name text,
  p_template_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_existing_request jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_session_date IS NULL OR btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'A request key, date, and workout name are required' USING ERRCODE = '22023';
  END IF;

  v_request := jsonb_build_object(
    'mode', 'live',
    'session_date', p_session_date,
    'name', btrim(p_name),
    'template_id', p_template_id
  );

  INSERT INTO public.workout_sessions (
    user_id,
    session_date,
    name,
    template_id,
    pain_flags,
    client_idempotency_key,
    client_request
  ) VALUES (
    v_user_id,
    p_session_date,
    btrim(p_name),
    p_template_id,
    '[]'::jsonb,
    p_idempotency_key,
    v_request
  )
  ON CONFLICT (user_id, client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  SELECT id, client_request
    INTO v_session_id, v_existing_request
    FROM public.workout_sessions
    WHERE user_id = v_user_id
      AND client_idempotency_key = p_idempotency_key;

  IF v_session_id IS NULL OR v_existing_request IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'The request key is already bound to a different workout' USING ERRCODE = '22023';
  END IF;

  RETURN v_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_retrospective_workout(
  p_idempotency_key uuid,
  p_session_date date,
  p_kind text,
  p_name text,
  p_template_id uuid,
  p_duration_minutes integer,
  p_pain_flags jsonb,
  p_activity text,
  p_distance_km real,
  p_effort real,
  p_sets jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_existing_request jsonb;
  v_existing_duration integer;
  v_request jsonb;
  v_set jsonb;
  v_notes text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR p_session_date IS NULL OR btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'A request key, date, and workout name are required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('strength', 'cardio') OR p_duration_minutes IS NULL OR p_duration_minutes <= 0 THEN
    RAISE EXCEPTION 'Invalid workout kind or duration' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_pain_flags, '[]'::jsonb)) <> 'array'
     OR jsonb_typeof(COALESCE(p_sets, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Pain flags and sets must be arrays' USING ERRCODE = '22023';
  END IF;

  IF p_kind = 'strength' THEN
    IF jsonb_array_length(COALESCE(p_sets, '[]'::jsonb)) = 0 THEN
      RAISE EXCEPTION 'A strength workout requires at least one set' USING ERRCODE = '22023';
    END IF;

    FOR v_set IN SELECT value FROM jsonb_array_elements(p_sets)
    LOOP
      IF jsonb_typeof(v_set) <> 'object'
         OR btrim(COALESCE(v_set->>'exercise_id', '')) = ''
         OR COALESCE(v_set->>'set_number', '') !~ '^[1-9][0-9]*$'
         OR COALESCE(v_set->>'reps', '') !~ '^[1-9][0-9]*$'
         OR jsonb_typeof(v_set->'is_warmup') <> 'boolean'
         OR jsonb_typeof(v_set->'is_pr') <> 'boolean'
         OR (
           v_set->'weight_kg' IS NOT NULL
           AND jsonb_typeof(v_set->'weight_kg') <> 'null'
           AND (
             COALESCE(v_set->>'weight_kg', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
             OR (v_set->>'weight_kg')::numeric < 0
           )
         )
         OR (
           v_set->'rpe' IS NOT NULL
           AND jsonb_typeof(v_set->'rpe') <> 'null'
           AND (
             COALESCE(v_set->>'rpe', '') !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$'
             OR (v_set->>'rpe')::numeric < 1
             OR (v_set->>'rpe')::numeric > 10
           )
         )
         OR (
           v_set->'superset_group' IS NOT NULL
           AND jsonb_typeof(v_set->'superset_group') <> 'null'
           AND COALESCE(v_set->>'superset_group', '') !~ '^[1-9][0-9]*$'
         ) THEN
        RAISE EXCEPTION 'Invalid retrospective set' USING ERRCODE = '22023';
      END IF;

      -- Cast here as part of validation so an invalid identifier rolls back the whole RPC.
      PERFORM (v_set->>'exercise_id')::uuid;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_sets) AS a(value)
      GROUP BY value->>'exercise_id', value->>'set_number'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicate retrospective set number' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF jsonb_array_length(COALESCE(p_sets, '[]'::jsonb)) <> 0
       OR p_activity IS NULL
       OR p_activity NOT IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')
       OR p_distance_km < 0
       OR p_effort < 1
       OR p_effort > 10
       OR p_distance_km::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_effort::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Invalid retrospective cardio metrics' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_request := jsonb_build_object(
    'mode', 'retrospective',
    'session_date', p_session_date,
    'kind', p_kind,
    'name', btrim(p_name),
    'template_id', p_template_id,
    'duration_minutes', p_duration_minutes,
    'pain_flags', COALESCE(p_pain_flags, '[]'::jsonb),
    'activity', p_activity,
    'distance_km', p_distance_km,
    'effort', p_effort,
    'sets', COALESCE(p_sets, '[]'::jsonb)
  );

  IF p_kind = 'cardio' THEN
    v_notes := concat_ws(
      ' · ',
      'Activity: ' || p_activity,
      CASE WHEN p_distance_km IS NULL THEN NULL ELSE 'Distance: ' || p_distance_km || ' km' END,
      CASE WHEN p_effort IS NULL THEN NULL ELSE 'Effort: ' || p_effort || '/10' END
    );
  END IF;

  INSERT INTO public.workout_sessions (
    user_id,
    session_date,
    name,
    template_id,
    duration_minutes,
    notes,
    pain_flags,
    client_idempotency_key,
    client_request
  ) VALUES (
    v_user_id,
    p_session_date,
    btrim(p_name),
    p_template_id,
    p_duration_minutes,
    v_notes,
    COALESCE(p_pain_flags, '[]'::jsonb),
    p_idempotency_key,
    v_request
  )
  ON CONFLICT (user_id, client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id, client_request, duration_minutes
      INTO v_session_id, v_existing_request, v_existing_duration
      FROM public.workout_sessions
      WHERE user_id = v_user_id
        AND client_idempotency_key = p_idempotency_key;

    IF v_session_id IS NULL
       OR v_existing_request IS DISTINCT FROM v_request
       OR v_existing_duration IS NULL THEN
      RAISE EXCEPTION 'The request key is already bound to a different workout' USING ERRCODE = '22023';
    END IF;
    RETURN v_session_id;
  END IF;

  IF p_kind = 'strength' THEN
    INSERT INTO public.workout_sets (
      session_id,
      exercise_id,
      set_number,
      weight_kg,
      reps,
      rpe,
      is_warmup,
      is_pr,
      superset_group,
      notes
    )
    SELECT
      v_session_id,
      (value->>'exercise_id')::uuid,
      (value->>'set_number')::integer,
      CASE WHEN jsonb_typeof(value->'weight_kg') = 'number' THEN (value->>'weight_kg')::real ELSE NULL END,
      (value->>'reps')::integer,
      CASE WHEN jsonb_typeof(value->'rpe') = 'number' THEN (value->>'rpe')::real ELSE NULL END,
      (value->>'is_warmup')::boolean,
      (value->>'is_pr')::boolean,
      CASE WHEN jsonb_typeof(value->'superset_group') = 'number' THEN (value->>'superset_group')::integer ELSE NULL END,
      NULL
    FROM jsonb_array_elements(p_sets);
  END IF;

  RETURN v_session_id;
END;
$function$;

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
      AND NOT EXISTS (
        SELECT 1
        FROM public.workout_sets AS workout_set
        WHERE workout_set.session_id = session.id
      )
    RETURNING session.id INTO v_deleted_id;

  RETURN v_deleted_id IS NOT NULL;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_live_workout_structure(
  p_session_id uuid,
  p_exercises jsonb,
  p_remove_exercise_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_exercise jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A session and exercise list are required' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
  ) THEN
    RETURN false;
  END IF;

  FOR v_exercise IN SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    IF jsonb_typeof(v_exercise) <> 'object'
       OR btrim(COALESCE(v_exercise->>'exercise_id', '')) = ''
       OR (
         v_exercise->'superset_group' IS NOT NULL
         AND jsonb_typeof(v_exercise->'superset_group') <> 'null'
         AND COALESCE(v_exercise->>'superset_group', '') !~ '^[1-9][0-9]*$'
       ) THEN
      RAISE EXCEPTION 'Invalid live exercise structure' USING ERRCODE = '22023';
    END IF;
    PERFORM (v_exercise->>'exercise_id')::uuid;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) AS exercise(value)
    GROUP BY value->>'exercise_id'
    HAVING count(*) > 1
  ) OR (
    p_remove_exercise_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_exercises) AS exercise(value)
      WHERE (value->>'exercise_id')::uuid = p_remove_exercise_id
    )
  ) THEN
    RAISE EXCEPTION 'Duplicate or removed live exercise' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workout_sets AS workout_set
    WHERE workout_set.session_id = p_session_id
      AND workout_set.exercise_id IS DISTINCT FROM p_remove_exercise_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_exercises) AS exercise(value)
        WHERE (exercise.value->>'exercise_id')::uuid = workout_set.exercise_id
      )
  ) THEN
    RAISE EXCEPTION 'Live structure omits a persisted exercise' USING ERRCODE = '22023';
  END IF;

  IF p_remove_exercise_id IS NOT NULL THEN
    DELETE FROM public.workout_sets
      WHERE session_id = p_session_id
        AND exercise_id = p_remove_exercise_id;
  END IF;

  UPDATE public.workout_sets AS workout_set
    SET superset_group = exercise.superset_group
    FROM jsonb_to_recordset(p_exercises) AS exercise(exercise_id uuid, superset_group integer)
    WHERE workout_set.session_id = p_session_id
      AND workout_set.exercise_id = exercise.exercise_id;

  RETURN true;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM service_role;
GRANT EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.discard_empty_workout_session(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, jsonb, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, jsonb, uuid) FROM service_role;
GRANT EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, jsonb, uuid) TO authenticated;
