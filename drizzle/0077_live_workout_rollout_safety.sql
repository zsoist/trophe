ALTER TABLE public.workout_sessions
  ADD COLUMN IF NOT EXISTS live_finish_request jsonb,
  ADD COLUMN IF NOT EXISTS workout_kind text,
  ADD COLUMN IF NOT EXISTS cardio_activity text,
  ADD COLUMN IF NOT EXISTS cardio_distance_km real,
  ADD COLUMN IF NOT EXISTS cardio_effort real;

-- A deploy can land after the old finish RPC committed but before its response
-- reached the client. Reconstruct that durable compatibility envelope before
-- validating the structured-cardio shape constraint.
UPDATE public.workout_sessions
SET live_finish_request = jsonb_build_object(
  'name', btrim(name),
  'duration_minutes', duration_minutes,
  'template_id', template_id,
  'notes', notes,
  'pain_flags', COALESCE(pain_flags, '[]'::jsonb)
)
WHERE duration_minutes IS NOT NULL
  AND live_finish_request IS NULL
  AND client_request->>'mode' = 'live';

-- Backfill only already-structured request facts. Historical localized notes
-- are presentation text and are deliberately never parsed into clinical data.
UPDATE public.workout_sessions
SET workout_kind = client_request->>'kind'
WHERE workout_kind IS NULL
  AND client_request->>'kind' IN ('strength', 'cardio');

UPDATE public.workout_sessions
SET cardio_activity = CASE
      WHEN client_request->>'activity' IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')
        THEN client_request->>'activity'
      ELSE NULL
    END,
    cardio_distance_km = CASE
      WHEN jsonb_typeof(client_request->'distance_km') = 'number'
        THEN (client_request->>'distance_km')::real
      ELSE NULL
    END,
    cardio_effort = CASE
      WHEN jsonb_typeof(client_request->'effort') = 'number'
        THEN (client_request->>'effort')::real
      ELSE NULL
    END
WHERE workout_kind = 'cardio'
  AND client_request->>'mode' = 'retrospective';

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workout_sessions_workout_kind_check' AND conrelid = 'public.workout_sessions'::regclass) THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_workout_kind_check
      CHECK (workout_kind IS NULL OR workout_kind IN ('strength', 'cardio')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workout_sessions_cardio_activity_check' AND conrelid = 'public.workout_sessions'::regclass) THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_cardio_activity_check
      CHECK (cardio_activity IS NULL OR cardio_activity IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workout_sessions_cardio_distance_check' AND conrelid = 'public.workout_sessions'::regclass) THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_cardio_distance_check
      CHECK (cardio_distance_km IS NULL OR (cardio_distance_km >= 0 AND cardio_distance_km::text NOT IN ('NaN', 'Infinity', '-Infinity'))) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workout_sessions_cardio_effort_check' AND conrelid = 'public.workout_sessions'::regclass) THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_cardio_effort_check
      CHECK (cardio_effort IS NULL OR (cardio_effort >= 1 AND cardio_effort <= 10 AND cardio_effort::text NOT IN ('NaN', 'Infinity', '-Infinity'))) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname = 'workout_sessions_cardio_shape_check' AND conrelid = 'public.workout_sessions'::regclass) THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_cardio_shape_check
      CHECK (
        workout_kind IS NULL
        OR (workout_kind = 'strength' AND cardio_activity IS NULL AND cardio_distance_km IS NULL AND cardio_effort IS NULL)
        OR (workout_kind = 'cardio' AND (
          duration_minutes IS NULL OR cardio_activity IS NOT NULL OR live_finish_request ? 'notes'
        ))
      ) NOT VALID;
  END IF;
END;
$migration$;

ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT workout_sessions_workout_kind_check;
ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT workout_sessions_cardio_activity_check;
ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT workout_sessions_cardio_distance_check;
ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT workout_sessions_cardio_effort_check;
ALTER TABLE public.workout_sessions VALIDATE CONSTRAINT workout_sessions_cardio_shape_check;

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
BEGIN
  SELECT live_structure, duration_minutes
    INTO v_structure, v_duration
    FROM public.workout_sessions
    WHERE id = NEW.session_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workout session is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add a set to a completed workout' USING ERRCODE = '22023';
  END IF;

  -- Retrospective transactions and controlled legacy live sessions have no
  -- structure yet. Terminal authority above still applies to both.
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
  v_duration integer;
  v_pain_flags jsonb;
  v_existing_request jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR btrim(COALESCE(p_name, '')) = ''
     OR p_duration_minutes IS NULL OR p_duration_minutes < 0 THEN
    RAISE EXCEPTION 'Invalid live workout finish request' USING ERRCODE = '22023';
  END IF;

  SELECT duration_minutes, pain_flags, live_finish_request
    INTO v_duration, v_pain_flags, v_existing_request
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_request := jsonb_build_object(
    'name', btrim(p_name),
    'duration_minutes', p_duration_minutes,
    'template_id', p_template_id,
    'notes', p_notes,
    'pain_flags', COALESCE(v_pain_flags, '[]'::jsonb)
  );
  IF v_duration IS NOT NULL THEN
    IF v_existing_request IS NOT DISTINCT FROM v_request THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'The finish request conflicts with the completed workout' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workout_sessions
    SET name = btrim(p_name),
        duration_minutes = p_duration_minutes,
        template_id = p_template_id,
        notes = p_notes,
        live_finish_request = v_request
    WHERE id = p_session_id AND user_id = v_user_id;

  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_live_workout_set_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_duration integer;
BEGIN
  SELECT duration_minutes
    INTO v_duration
    FROM public.workout_sessions
    WHERE id = OLD.session_id
    FOR UPDATE;

  -- Parent removal can cascade after the session row is already unavailable.
  IF NOT FOUND THEN
    RETURN OLD;
  END IF;
  IF v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete a set from a completed workout' USING ERRCODE = '22023';
  END IF;
  RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS workout_sets_terminal_delete_guard ON public.workout_sets;
CREATE TRIGGER workout_sets_terminal_delete_guard
  BEFORE DELETE ON public.workout_sets
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_live_workout_set_delete();

CREATE OR REPLACE FUNCTION public.delete_live_workout_set(
  p_session_id uuid,
  p_set_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_duration integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR p_set_id IS NULL THEN
    RAISE EXCEPTION 'A workout session and set are required' USING ERRCODE = '22023';
  END IF;

  SELECT duration_minutes
    INTO v_duration
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_duration IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot delete a set from a completed workout' USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.workout_sets
    WHERE id = p_set_id AND session_id = p_session_id;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_live_workout_session(
  p_session_id uuid,
  p_name text,
  p_duration_minutes integer,
  p_template_id uuid,
  p_cardio_activity text,
  p_cardio_distance_km real,
  p_cardio_effort real
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_duration integer;
  v_kind text;
  v_pain_flags jsonb;
  v_existing_request jsonb;
  v_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL OR btrim(COALESCE(p_name, '')) = ''
     OR p_duration_minutes IS NULL OR p_duration_minutes < 0 THEN
    RAISE EXCEPTION 'Invalid live workout finish request' USING ERRCODE = '22023';
  END IF;

  SELECT duration_minutes, workout_kind, pain_flags, live_finish_request
    INTO v_duration, v_kind, v_pain_flags, v_existing_request
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;
  IF v_kind = 'cardio' THEN
    IF p_cardio_activity IS NULL
       OR p_cardio_activity NOT IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')
       OR (p_cardio_distance_km IS NOT NULL AND (
         p_cardio_distance_km < 0 OR p_cardio_distance_km::text IN ('NaN', 'Infinity', '-Infinity')
       ))
       OR (p_cardio_effort IS NOT NULL AND (
         p_cardio_effort < 1 OR p_cardio_effort > 10 OR p_cardio_effort::text IN ('NaN', 'Infinity', '-Infinity')
       )) THEN
      RAISE EXCEPTION 'Invalid live cardio metrics' USING ERRCODE = '22023';
    END IF;
  ELSIF v_kind = 'strength' THEN
    IF p_cardio_activity IS NOT NULL OR p_cardio_distance_km IS NOT NULL OR p_cardio_effort IS NOT NULL THEN
      RAISE EXCEPTION 'Strength workout cannot contain cardio metrics' USING ERRCODE = '22023';
    END IF;
  ELSE
    RAISE EXCEPTION 'Workout kind is unavailable' USING ERRCODE = '22023';
  END IF;

  v_request := jsonb_build_object(
    'name', btrim(p_name),
    'duration_minutes', p_duration_minutes,
    'template_id', p_template_id,
    'workout_kind', v_kind,
    'cardio_activity', p_cardio_activity,
    'cardio_distance_km', p_cardio_distance_km,
    'cardio_effort', p_cardio_effort,
    'pain_flags', COALESCE(v_pain_flags, '[]'::jsonb)
  );
  IF v_duration IS NOT NULL THEN
    IF v_existing_request IS NOT DISTINCT FROM v_request THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'The finish request conflicts with the completed workout' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workout_sessions
    SET name = btrim(p_name),
        duration_minutes = p_duration_minutes,
        template_id = p_template_id,
        notes = NULL,
        cardio_activity = p_cardio_activity,
        cardio_distance_km = p_cardio_distance_km,
        cardio_effort = p_cardio_effort,
        live_finish_request = v_request
    WHERE id = p_session_id AND user_id = v_user_id;

  RETURN true;
END;
$function$;

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
  v_existing_duration integer;
  v_key_session_id uuid;
  v_fingerprint_session_id uuid;
  v_candidate record;
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
    user_id, session_date, name, template_id, pain_flags,
    client_idempotency_key, client_request, client_draft_fingerprint,
    live_structure, live_structure_version, workout_kind
  ) VALUES (
    v_user_id, p_session_date, btrim(p_name), p_template_id, '[]'::jsonb,
    p_idempotency_key, v_request, p_draft_fingerprint, p_live_structure, 0, p_kind
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  -- Lock every possible identity match in a stable order before choosing a
  -- replay target. A request key and a draft fingerprint must never be allowed
  -- to resolve to different sessions.
  FOR v_candidate IN
    SELECT id, client_idempotency_key, client_draft_hash
    FROM public.workout_sessions
    WHERE user_id = v_user_id
      AND (
        client_idempotency_key = p_idempotency_key
        OR client_draft_hash = pg_catalog.md5(p_draft_fingerprint)
      )
    ORDER BY id
    FOR UPDATE
  LOOP
    IF v_candidate.client_idempotency_key = p_idempotency_key THEN
      v_key_session_id := v_candidate.id;
    END IF;
    IF v_candidate.client_draft_hash = pg_catalog.md5(p_draft_fingerprint) THEN
      v_fingerprint_session_id := v_candidate.id;
    END IF;
  END LOOP;

  IF v_key_session_id IS NOT NULL
     AND v_fingerprint_session_id IS NOT NULL
     AND v_key_session_id IS DISTINCT FROM v_fingerprint_session_id THEN
    RAISE EXCEPTION 'The live request identity is ambiguous' USING ERRCODE = '22023';
  END IF;

  v_session_id := COALESCE(v_key_session_id, v_fingerprint_session_id);

  IF v_session_id IS NULL THEN
    RAISE EXCEPTION 'The live request could not be resolved' USING ERRCODE = '40001';
  END IF;

  SELECT client_idempotency_key, client_draft_fingerprint, client_request, duration_minutes
    INTO v_existing_key, v_existing_fingerprint, v_existing_request, v_existing_duration
    FROM public.workout_sessions
    WHERE id = v_session_id;

  IF v_existing_duration IS NOT NULL THEN
    RAISE EXCEPTION 'The live workout is already complete' USING ERRCODE = '22023';
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

-- Temporary rolling-deploy overload for clients released before 0076. These
-- rows stay explicitly unbootstrapped until a new client resumes them with its
-- recovered draft; they are never guessed to be strength or cardio in SQL.
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
  v_existing_duration integer;
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
    user_id, session_date, name, template_id, pain_flags,
    client_idempotency_key, client_request
  ) VALUES (
    v_user_id, p_session_date, btrim(p_name), p_template_id, '[]'::jsonb,
    p_idempotency_key, v_request
  )
  ON CONFLICT (user_id, client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NOT NULL THEN
    RETURN v_session_id;
  END IF;

  SELECT id, client_request, duration_minutes
    INTO v_session_id, v_existing_request, v_existing_duration
    FROM public.workout_sessions
    WHERE user_id = v_user_id AND client_idempotency_key = p_idempotency_key
    FOR UPDATE;

  IF v_session_id IS NULL
     OR v_existing_request IS DISTINCT FROM v_request THEN
    RAISE EXCEPTION 'The request key is already bound to a different workout' USING ERRCODE = '22023';
  END IF;
  IF v_existing_duration IS NOT NULL THEN
    RAISE EXCEPTION 'The live workout is already complete' USING ERRCODE = '22023';
  END IF;
  RETURN v_session_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.resume_legacy_live_workout_session(
  p_session_id uuid,
  p_kind text,
  p_live_structure jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_current_structure jsonb;
  v_current_version integer;
  v_duration integer;
  v_client_request jsonb;
  v_structure_item jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL
     OR p_kind NOT IN ('strength', 'cardio')
     OR jsonb_typeof(COALESCE(p_live_structure, '[]'::jsonb)) <> 'array'
     OR (p_kind = 'strength' AND jsonb_array_length(p_live_structure) = 0)
     OR (p_kind = 'cardio' AND jsonb_array_length(p_live_structure) <> 0) THEN
    RAISE EXCEPTION 'Invalid legacy live workout resume request' USING ERRCODE = '22023';
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
      RAISE EXCEPTION 'Invalid legacy live structure' USING ERRCODE = '22023';
    END IF;
    PERFORM (v_structure_item->>'exercise_id')::uuid;
  END LOOP;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_live_structure) AS exercise(value)
    GROUP BY exercise.value->>'exercise_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate legacy live exercise' USING ERRCODE = '22023';
  END IF;

  SELECT live_structure, live_structure_version, duration_minutes, client_request
    INTO v_current_structure, v_current_version, v_duration, v_client_request
    FROM public.workout_sessions
    WHERE id = p_session_id AND user_id = v_user_id
    FOR UPDATE;

  IF NOT FOUND OR v_duration IS NOT NULL OR v_client_request->>'mode' IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION 'Legacy live workout is unavailable' USING ERRCODE = '22023';
  END IF;
  IF v_current_structure IS NOT NULL THEN
    IF v_current_structure IS DISTINCT FROM p_live_structure THEN
      RAISE EXCEPTION 'Legacy live structure conflicts with its completed resume' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('version', v_current_version, 'structure', v_current_structure);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.workout_sets AS workout_set
    WHERE workout_set.session_id = p_session_id
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_live_structure) AS exercise(value)
        WHERE (exercise.value->>'exercise_id')::uuid = workout_set.exercise_id
          AND CASE
            WHEN jsonb_typeof(exercise.value->'superset_group') = 'number'
              THEN (exercise.value->>'superset_group')::integer
            ELSE NULL
          END IS NOT DISTINCT FROM workout_set.superset_group
      )
  ) THEN
    RAISE EXCEPTION 'Recovered draft conflicts with persisted legacy sets' USING ERRCODE = '22023';
  END IF;

  UPDATE public.workout_sessions
    SET live_structure = p_live_structure,
        live_structure_version = 0,
        workout_kind = p_kind
    WHERE id = p_session_id AND user_id = v_user_id;

  RETURN jsonb_build_object('version', 0, 'structure', p_live_structure);
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
         OR (jsonb_typeof(v_set->'weight_kg') = 'number' AND (v_set->>'weight_kg')::numeric < 0)
         OR NOT (v_set ? 'rpe')
         OR jsonb_typeof(v_set->'rpe') NOT IN ('number', 'null')
         OR (jsonb_typeof(v_set->'rpe') = 'number' AND ((v_set->>'rpe')::numeric < 1 OR (v_set->>'rpe')::numeric > 10))
         OR NOT (v_set ? 'superset_group')
         OR jsonb_typeof(v_set->'superset_group') NOT IN ('number', 'null')
         OR (
           jsonb_typeof(v_set->'superset_group') = 'number'
           AND ((v_set->>'superset_group')::numeric <> trunc((v_set->>'superset_group')::numeric) OR (v_set->>'superset_group')::numeric <= 0)
         ) THEN
        RAISE EXCEPTION 'Invalid retrospective set' USING ERRCODE = '22023';
      END IF;
      PERFORM (v_set->>'exercise_id')::uuid;
    END LOOP;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_sets) AS set_row(value)
      GROUP BY set_row.value->>'exercise_id', set_row.value->>'set_number'
      HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'Duplicate retrospective set number' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF jsonb_array_length(COALESCE(p_sets, '[]'::jsonb)) <> 0
       OR p_activity IS NULL
       OR p_activity NOT IN ('walk', 'run', 'cycle', 'hiit', 'swim', 'other')
       OR p_distance_km < 0 OR p_effort < 1 OR p_effort > 10
       OR p_distance_km::text IN ('NaN', 'Infinity', '-Infinity')
       OR p_effort::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Invalid retrospective cardio metrics' USING ERRCODE = '22023';
    END IF;
  END IF;

  v_request := jsonb_build_object(
    'mode', 'retrospective', 'session_date', p_session_date, 'kind', p_kind,
    'name', btrim(p_name), 'template_id', p_template_id,
    'duration_minutes', p_duration_minutes,
    'pain_flags', COALESCE(p_pain_flags, '[]'::jsonb),
    'activity', p_activity, 'distance_km', p_distance_km,
    'effort', p_effort, 'sets', COALESCE(p_sets, '[]'::jsonb)
  );

  -- Keep the new row non-terminal until every set is inserted. The trigger can
  -- therefore enforce terminal authority without weakening atomic history saves.
  INSERT INTO public.workout_sessions (
    user_id, session_date, name, template_id, duration_minutes, notes,
    pain_flags, client_idempotency_key, client_request, workout_kind,
    cardio_activity, cardio_distance_km, cardio_effort
  ) VALUES (
    v_user_id, p_session_date, btrim(p_name), p_template_id, NULL, NULL,
    COALESCE(p_pain_flags, '[]'::jsonb), p_idempotency_key, v_request, p_kind,
    CASE WHEN p_kind = 'cardio' THEN p_activity ELSE NULL END,
    CASE WHEN p_kind = 'cardio' THEN p_distance_km ELSE NULL END,
    CASE WHEN p_kind = 'cardio' THEN p_effort ELSE NULL END
  )
  ON CONFLICT (user_id, client_idempotency_key)
    WHERE client_idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_session_id;

  IF v_session_id IS NULL THEN
    SELECT id, client_request, duration_minutes
      INTO v_session_id, v_existing_request, v_existing_duration
      FROM public.workout_sessions
      WHERE user_id = v_user_id AND client_idempotency_key = p_idempotency_key;
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
      v_session_id, (value->>'exercise_id')::uuid, (value->>'set_number')::integer,
      CASE WHEN jsonb_typeof(value->'weight_kg') = 'number' THEN (value->>'weight_kg')::real ELSE NULL END,
      (value->>'reps')::integer,
      CASE WHEN jsonb_typeof(value->'rpe') = 'number' THEN (value->>'rpe')::real ELSE NULL END,
      (value->>'is_warmup')::boolean, (value->>'is_pr')::boolean,
      CASE WHEN jsonb_typeof(value->'superset_group') = 'number' THEN (value->>'superset_group')::integer ELSE NULL END,
      NULL
    FROM jsonb_array_elements(p_sets);
  END IF;

  UPDATE public.workout_sessions
    SET duration_minutes = p_duration_minutes
    WHERE id = v_session_id AND user_id = v_user_id;

  RETURN v_session_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, date, text, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_workout_session(uuid, text, date, text, uuid, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text, real, real) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text, real, real) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.finish_live_workout_session(uuid, text, integer, uuid, text, real, real) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_live_workout_set(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_live_workout_set(uuid, uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_live_workout_set(uuid, uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.save_retrospective_workout(uuid, date, text, text, uuid, integer, jsonb, text, real, real, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.resume_legacy_live_workout_session(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resume_legacy_live_workout_session(uuid, text, jsonb) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.resume_legacy_live_workout_session(uuid, text, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_structure() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_structure() FROM anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_delete() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_live_workout_set_delete() FROM anon, authenticated, service_role;
