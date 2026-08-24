ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS live_structure jsonb,
  ADD COLUMN IF NOT EXISTS live_structure_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS client_draft_fingerprint text,
  ADD COLUMN IF NOT EXISTS client_draft_hash text
    GENERATED ALWAYS AS (pg_catalog.md5(client_draft_fingerprint)) STORED,
  ADD COLUMN IF NOT EXISTS pain_mutation_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS client_request jsonb;

-- A set number is one logical row. Keep the earliest legacy row before adding
-- the invariant so retries cannot create a second completed set.
WITH ranked AS (
  SELECT id,
    row_number() OVER (
      PARTITION BY session_id, exercise_id, set_number
      ORDER BY created_at NULLS LAST, id
    ) AS position
  FROM public.workout_sets
)
DELETE FROM public.workout_sets AS workout_set
USING ranked
WHERE workout_set.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workout_sets_session_exercise_number_unique
  ON public.workout_sets (session_id, exercise_id, set_number);

CREATE UNIQUE INDEX IF NOT EXISTS workout_sessions_user_draft_hash_unique
  ON public.workout_sessions (user_id, client_draft_hash)
  WHERE client_draft_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.enforce_live_workout_set_structure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_structure jsonb;
  v_expected_group integer;
BEGIN
  SELECT live_structure
    INTO v_structure
    FROM public.workout_sessions
    WHERE id = NEW.session_id;

  -- Retrospective and legacy sessions have no canonical live structure.
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
         OR jsonb_typeof(v_set->'exercise_id') IS DISTINCT FROM 'string'
         OR btrim(v_set->>'exercise_id') = ''
         OR jsonb_typeof(v_set->'set_number') IS DISTINCT FROM 'number'
         OR (v_set->>'set_number')::numeric <> trunc((v_set->>'set_number')::numeric)
         OR (v_set->>'set_number')::numeric <= 0
         OR jsonb_typeof(v_set->'reps') IS DISTINCT FROM 'number'
         OR (v_set->>'reps')::numeric <> trunc((v_set->>'reps')::numeric)
         OR (v_set->>'reps')::numeric <= 0
         OR jsonb_typeof(v_set->'is_warmup') IS DISTINCT FROM 'boolean'
         OR jsonb_typeof(v_set->'is_pr') IS DISTINCT FROM 'boolean'
         OR NOT (v_set ? 'weight_kg')
         OR jsonb_typeof(v_set->'weight_kg') NOT IN ('number', 'null')
         OR (
           jsonb_typeof(v_set->'weight_kg') = 'number'
           AND (v_set->>'weight_kg')::numeric < 0
         )
         OR NOT (v_set ? 'rpe')
         OR jsonb_typeof(v_set->'rpe') NOT IN ('number', 'null')
         OR (
           jsonb_typeof(v_set->'rpe') = 'number'
           AND (
             (v_set->>'rpe')::numeric < 1
             OR (v_set->>'rpe')::numeric > 10
           )
         )
         OR NOT (v_set ? 'superset_group')
         OR jsonb_typeof(v_set->'superset_group') NOT IN ('number', 'null')
         OR (
           jsonb_typeof(v_set->'superset_group') = 'number'
           AND (
             (v_set->>'superset_group')::numeric <> trunc((v_set->>'superset_group')::numeric)
             OR (v_set->>'superset_group')::numeric <= 0
           )
         ) THEN
        RAISE EXCEPTION 'Invalid retrospective set' USING ERRCODE = '22023';
      END IF;
      PERFORM (v_set->>'exercise_id')::uuid;
    END LOOP;

    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_sets) AS set_row(value)
      GROUP BY set_row.value->>'exercise_id', set_row.value->>'set_number'
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
    user_id, session_date, name, template_id, duration_minutes, notes,
    pain_flags, client_idempotency_key, client_request
  ) VALUES (
    v_user_id, p_session_date, btrim(p_name), p_template_id,
    p_duration_minutes, v_notes, COALESCE(p_pain_flags, '[]'::jsonb),
    p_idempotency_key, v_request
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
      session_id, exercise_id, set_number, weight_kg, reps, rpe,
      is_warmup, is_pr, superset_group, notes
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

DROP FUNCTION IF EXISTS public.update_live_workout_structure(uuid, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.update_live_workout_structure(
  p_session_id uuid,
  p_expected_version integer,
  p_exercises jsonb,
  p_remove_exercise_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_current_version integer;
  v_duration integer;
  v_exercise jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_expected_version IS NULL OR p_expected_version < 0
     OR jsonb_typeof(COALESCE(p_exercises, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'A session, version, and exercise list are required' USING ERRCODE = '22023';
  END IF;

  FOR v_exercise IN SELECT value FROM jsonb_array_elements(p_exercises)
  LOOP
    IF jsonb_typeof(v_exercise) <> 'object'
       OR jsonb_typeof(v_exercise->'exercise_id') IS DISTINCT FROM 'string'
       OR btrim(v_exercise->>'exercise_id') = ''
       OR jsonb_typeof(v_exercise->'target_sets') IS DISTINCT FROM 'number'
       OR (v_exercise->>'target_sets')::numeric <> trunc((v_exercise->>'target_sets')::numeric)
       OR (v_exercise->>'target_sets')::numeric <= 0
       OR jsonb_typeof(v_exercise->'target_reps') IS DISTINCT FROM 'string'
       OR btrim(v_exercise->>'target_reps') = ''
       OR NOT (v_exercise ? 'superset_group')
       OR jsonb_typeof(v_exercise->'superset_group') NOT IN ('number', 'null')
       OR (
         jsonb_typeof(v_exercise->'superset_group') = 'number'
         AND (
           (v_exercise->>'superset_group')::numeric <> trunc((v_exercise->>'superset_group')::numeric)
           OR (v_exercise->>'superset_group')::numeric <= 0
         )
       ) THEN
      RAISE EXCEPTION 'Invalid live exercise structure' USING ERRCODE = '22023';
    END IF;
    PERFORM (v_exercise->>'exercise_id')::uuid;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_exercises) AS exercise(value)
    GROUP BY exercise.value->>'exercise_id'
    HAVING count(*) > 1
  ) OR (
    p_remove_exercise_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_exercises) AS exercise(value)
      WHERE (exercise.value->>'exercise_id')::uuid = p_remove_exercise_id
    )
  ) THEN
    RAISE EXCEPTION 'Duplicate or removed live exercise' USING ERRCODE = '22023';
  END IF;

  SELECT live_structure_version, duration_minutes
    INTO v_current_version, v_duration
    FROM public.workout_sessions
    WHERE id = p_session_id
      AND user_id = v_user_id
      AND live_structure IS NOT NULL
    FOR UPDATE;

  IF NOT FOUND OR v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Live workout is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_current_version <> p_expected_version THEN
    RAISE EXCEPTION 'Live structure version changed' USING ERRCODE = '40001';
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

  UPDATE public.workout_sessions
    SET live_structure = p_exercises,
        live_structure_version = v_current_version + 1
    WHERE id = p_session_id;

  IF p_remove_exercise_id IS NOT NULL THEN
    DELETE FROM public.workout_sets
      WHERE session_id = p_session_id
        AND exercise_id = p_remove_exercise_id;
  END IF;

  UPDATE public.workout_sets AS workout_set
    SET superset_group = exercise.superset_group
    FROM jsonb_to_recordset(p_exercises) AS exercise(
      exercise_id uuid,
      target_sets integer,
      target_reps text,
      superset_group integer
    )
    WHERE workout_set.session_id = p_session_id
      AND workout_set.exercise_id = exercise.exercise_id;

  RETURN jsonb_build_object(
    'version', v_current_version + 1,
    'structure', p_exercises
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.append_live_pain_flag(
  p_session_id uuid,
  p_mutation_id uuid,
  p_flag jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_pain_flags jsonb;
  v_mutation_ids uuid[];
  v_duration integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_mutation_id IS NULL
     OR jsonb_typeof(p_flag) <> 'object'
     OR jsonb_typeof(p_flag->'exercise_id') IS DISTINCT FROM 'string'
     OR btrim(p_flag->>'exercise_id') = ''
     OR jsonb_typeof(p_flag->'body_part') IS DISTINCT FROM 'string'
     OR btrim(p_flag->>'body_part') = ''
     OR jsonb_typeof(p_flag->'severity') IS DISTINCT FROM 'number'
     OR (p_flag->>'severity')::numeric <> trunc((p_flag->>'severity')::numeric)
     OR (p_flag->>'severity')::numeric < 1
     OR (p_flag->>'severity')::numeric > 5
     OR (p_flag ? 'notes' AND jsonb_typeof(p_flag->'notes') IS DISTINCT FROM 'string') THEN
    RAISE EXCEPTION 'Invalid pain flag' USING ERRCODE = '22023';
  END IF;
  PERFORM (p_flag->>'exercise_id')::uuid;

  SELECT COALESCE(pain_flags, '[]'::jsonb), pain_mutation_ids, duration_minutes
    INTO v_pain_flags, v_mutation_ids, v_duration
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND OR v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Live workout is unavailable' USING ERRCODE = '22023';
  END IF;
  IF p_mutation_id = ANY(v_mutation_ids) THEN
    RETURN v_pain_flags;
  END IF;

  v_pain_flags := v_pain_flags || jsonb_build_array(p_flag);
  UPDATE public.workout_sessions
    SET pain_flags = v_pain_flags,
        pain_mutation_ids = array_append(v_mutation_ids, p_mutation_id)
    WHERE id = p_session_id;

  RETURN v_pain_flags;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_live_workout_session(
  p_session_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_template_id uuid,
  p_notes text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR btrim(COALESCE(p_name, '')) = ''
     OR p_duration_minutes IS NULL OR p_duration_minutes < 0 THEN
    RAISE EXCEPTION 'Invalid live workout finish request' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workout_sessions
    SET name = btrim(p_name),
        duration_minutes = p_duration_minutes,
        template_id = p_template_id,
        notes = p_notes
    WHERE id = p_session_id
      AND user_id = v_user_id
      AND duration_minutes IS NULL
    RETURNING id INTO v_session_id;

  RETURN v_session_id IS NOT NULL;
END;
$function$;

DROP TRIGGER IF EXISTS workout_sets_live_structure_guard ON public.workout_sets;
CREATE TRIGGER workout_sets_live_structure_guard
  BEFORE INSERT OR UPDATE OF session_id, exercise_id, superset_group
  ON public.workout_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_live_workout_set_structure();

DROP FUNCTION IF EXISTS public.start_workout_session(uuid, date, text, uuid);

CREATE OR REPLACE FUNCTION public.start_workout_session(
  p_idempotency_key uuid,
  p_draft_fingerprint text,
  p_session_date date,
  p_name text,
  p_template_id uuid,
  p_kind text,
  p_live_structure jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_session_id uuid;
  v_existing_key uuid;
  v_existing_fingerprint text;
  v_existing_request jsonb;
  v_request jsonb;
  v_structure_item jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL
     OR btrim(COALESCE(p_draft_fingerprint, '')) = ''
     OR p_session_date IS NULL
     OR btrim(COALESCE(p_name, '')) = ''
     OR p_kind NOT IN ('strength', 'cardio')
     OR jsonb_typeof(COALESCE(p_live_structure, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Invalid live workout start request' USING ERRCODE = '22023';
  END IF;
  IF (p_kind = 'strength' AND jsonb_array_length(p_live_structure) = 0)
     OR (p_kind = 'cardio' AND jsonb_array_length(p_live_structure) <> 0) THEN
    RAISE EXCEPTION 'Live structure does not match workout kind' USING ERRCODE = '22023';
  END IF;

  FOR v_structure_item IN SELECT value FROM jsonb_array_elements(p_live_structure)
  LOOP
    IF jsonb_typeof(v_structure_item) <> 'object'
       OR jsonb_typeof(v_structure_item->'exercise_id') IS DISTINCT FROM 'string'
       OR btrim(v_structure_item->>'exercise_id') = ''
       OR jsonb_typeof(v_structure_item->'target_sets') IS DISTINCT FROM 'number'
       OR (v_structure_item->>'target_sets')::numeric <> trunc((v_structure_item->>'target_sets')::numeric)
       OR (v_structure_item->>'target_sets')::numeric <= 0
       OR jsonb_typeof(v_structure_item->'target_reps') IS DISTINCT FROM 'string'
       OR btrim(v_structure_item->>'target_reps') = ''
       OR NOT (v_structure_item ? 'superset_group')
       OR jsonb_typeof(v_structure_item->'superset_group') NOT IN ('number', 'null')
       OR (
         jsonb_typeof(v_structure_item->'superset_group') = 'number'
         AND (
           (v_structure_item->>'superset_group')::numeric <> trunc((v_structure_item->>'superset_group')::numeric)
           OR (v_structure_item->>'superset_group')::numeric <= 0
         )
       ) THEN
      RAISE EXCEPTION 'Invalid live workout structure' USING ERRCODE = '22023';
    END IF;
    PERFORM (v_structure_item->>'exercise_id')::uuid;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_live_structure) AS exercise(value)
    GROUP BY exercise.value->>'exercise_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate live exercise' USING ERRCODE = '22023';
  END IF;

  v_request := jsonb_build_object(
    'mode', 'live',
    'session_date', p_session_date,
    'name', btrim(p_name),
    'template_id', p_template_id,
    'kind', p_kind,
    'structure', p_live_structure
  );

  INSERT INTO public.workout_sessions (
    user_id,
    session_date,
    name,
    template_id,
    pain_flags,
    client_idempotency_key,
    client_request,
    client_draft_fingerprint,
    live_structure,
    live_structure_version
  ) VALUES (
    v_user_id,
    p_session_date,
    btrim(p_name),
    p_template_id,
    '[]'::jsonb,
    p_idempotency_key,
    v_request,
    p_draft_fingerprint,
    p_live_structure,
    0
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  SELECT id, client_idempotency_key, client_draft_fingerprint, client_request
    INTO v_session_id, v_existing_key, v_existing_fingerprint, v_existing_request
    FROM public.workout_sessions
    WHERE user_id = v_user_id
      AND (
        client_idempotency_key = p_idempotency_key
        OR client_draft_hash = pg_catalog.md5(p_draft_fingerprint)
      )
    ORDER BY (client_idempotency_key = p_idempotency_key) DESC
    LIMIT 1;

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'The live request could not be resolved' USING ERRCODE = '40001';
  END IF;
  IF v_existing_key = p_idempotency_key
     AND v_existing_request IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'The request key is already bound to a different workout' USING ERRCODE = '22023';
  END IF;
  IF v_existing_fingerprint = p_draft_fingerprint
     AND (v_existing_request - 'session_date') IS DISTINCT FROM (v_request - 'session_date') THEN
    RAISE EXCEPTION 'The draft fingerprint conflicts with a different workout' USING ERRCODE = '22023';
  END IF;
  IF v_existing_key IS DISTINCT FROM p_idempotency_key
     AND v_existing_fingerprint IS DISTINCT FROM p_draft_fingerprint THEN
    RAISE EXCEPTION 'The live request identity is ambiguous' USING ERRCODE = '22023';
  END IF;

  RETURN v_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_live_workout_set(
  p_session_id uuid,
  p_exercise_id uuid,
  p_set_number integer,
  p_weight_kg real,
  p_reps integer,
  p_rpe real,
  p_is_warmup boolean,
  p_is_pr boolean,
  p_superset_group integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_structure jsonb;
  v_duration integer;
  v_expected_group integer;
  v_set_id uuid;
  v_existing_request jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_exercise_id IS NULL
     OR p_set_number IS NULL OR p_set_number <= 0
     OR p_reps IS NULL OR p_reps <= 0
     OR p_is_warmup IS NULL OR p_is_pr IS NULL
     OR p_weight_kg < 0
     OR p_weight_kg::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_rpe < 1 OR p_rpe > 10
     OR p_rpe::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_superset_group <= 0 THEN
    RAISE EXCEPTION 'Invalid live set' USING ERRCODE = '22023';
  END IF;

  SELECT live_structure, duration_minutes
    INTO v_structure, v_duration
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND OR v_structure IS NULL OR v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Live workout is unavailable' USING ERRCODE = '22023';
  END IF;

  SELECT CASE
      WHEN jsonb_typeof(exercise.value->'superset_group') = 'number'
        THEN (exercise.value->>'superset_group')::integer
      ELSE NULL
    END
    INTO v_expected_group
    FROM jsonb_array_elements(v_structure) AS exercise(value)
    WHERE (exercise.value->>'exercise_id')::uuid = p_exercise_id;

  IF NOT FOUND OR p_superset_group IS DISTINCT FROM v_expected_group THEN
    RAISE EXCEPTION 'Set conflicts with the canonical live structure' USING ERRCODE = '22023';
  END IF;

  v_request := jsonb_build_object(
    'exercise_id', p_exercise_id,
    'set_number', p_set_number,
    'weight_kg', p_weight_kg,
    'reps', p_reps,
    'rpe', p_rpe,
    'is_warmup', p_is_warmup,
    'is_pr', p_is_pr,
    'superset_group', p_superset_group
  );

  INSERT INTO public.workout_sets (
    session_id, exercise_id, set_number, weight_kg, reps, rpe,
    is_warmup, is_pr, superset_group, notes, client_request
  ) VALUES (
    p_session_id, p_exercise_id, p_set_number, p_weight_kg, p_reps, p_rpe,
    p_is_warmup, p_is_pr, p_superset_group, NULL, v_request
  )
  ON CONFLICT (session_id, exercise_id, set_number) DO NOTHING
  RETURNING id INTO v_set_id;

  IF v_set_id IS NOT NULL THEN
    RETURN v_set_id;
  END IF;

  SELECT id, client_request
    INTO v_set_id, v_existing_request
    FROM public.workout_sets
    WHERE session_id = p_session_id
      AND exercise_id = p_exercise_id
      AND set_number = p_set_number;

  IF v_set_id IS NULL OR v_existing_request IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'The completed set conflicts with an existing set' USING ERRCODE = '22023';
  END IF;
  RETURN v_set_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_structure() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_structure() FROM anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_live_workout_set(uuid, uuid, integer, real, integer, real, boolean, boolean, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_live_workout_set(uuid, uuid, integer, real, integer, real, boolean, boolean, integer) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_live_workout_set(uuid, uuid, integer, real, integer, real, boolean, boolean, integer) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.append_live_pain_flag(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.append_live_pain_flag(uuid, uuid, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.append_live_pain_flag(uuid, uuid, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, integer, jsonb, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, integer, jsonb, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_live_workout_structure(uuid, integer, jsonb, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) TO authenticated;
