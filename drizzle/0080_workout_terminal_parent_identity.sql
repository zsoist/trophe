-- Completed workout history is immutable, including parent identity, ordering,
-- and template provenance. The sole template exception is the FK's own
-- ON DELETE SET NULL action after the referenced template has ceased to exist.
CREATE OR REPLACE FUNCTION public.enforce_workout_terminal_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.duration_minutes IS NOT NULL THEN
      NEW.completed_at := pg_catalog.clock_timestamp();
    ELSIF NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'Cannot mark an unfinished workout complete' USING ERRCODE = '22023';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.completed_at IS NOT NULL THEN
    IF OLD.live_finish_request IS NULL
       AND NEW.live_finish_request IS NOT NULL
       AND (to_jsonb(NEW) - ARRAY['live_finish_request', 'client_draft_hash'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['live_finish_request', 'client_draft_hash'])
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
       AND (to_jsonb(NEW) - ARRAY['workout_kind', 'client_draft_hash'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['workout_kind', 'client_draft_hash']) THEN
      RETURN NEW;
    END IF;
    IF OLD.workout_kind = 'cardio'
       AND OLD.client_request->>'mode' = 'retrospective'
       AND (to_jsonb(NEW) - ARRAY['cardio_activity', 'cardio_distance_km', 'cardio_effort', 'client_draft_hash'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['cardio_activity', 'cardio_distance_km', 'cardio_effort', 'client_draft_hash'])
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

    -- The template archival trigger below runs as the table owner before the
    -- FK action. Authenticated owners cannot satisfy this trusted-role check.
    IF OLD.template_id IS NOT NULL
       AND NEW.template_id IS NULL
       AND (to_jsonb(NEW) - ARRAY['template_id', 'client_draft_hash'])
         IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['template_id', 'client_draft_hash'])
       AND current_user = (
         SELECT pg_catalog.pg_get_userbyid(relowner)
         FROM pg_catalog.pg_class
         WHERE oid = 'public.workout_sessions'::regclass
       ) THEN
      RETURN NEW;
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.template_id IS DISTINCT FROM OLD.template_id
       OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
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

COMMENT ON FUNCTION public.enforce_workout_terminal_authority() IS
  'Stamps terminal authority and freezes every completed parent field; permits only FK-driven template archival.';

-- Clear the nullable FK through a tightly scoped owner-context update before
-- PostgreSQL runs ON DELETE SET NULL. This preserves template deletion without
-- allowing an authenticated client to erase completed-session provenance.
CREATE OR REPLACE FUNCTION public.archive_workout_template_provenance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.workout_sessions
  SET template_id = NULL
  WHERE template_id = OLD.id;
  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.archive_workout_template_provenance() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_workout_template_provenance() FROM anon;
REVOKE ALL ON FUNCTION public.archive_workout_template_provenance() FROM authenticated;

DROP TRIGGER IF EXISTS archive_workout_template_provenance_before_delete
  ON public.workout_templates;
CREATE TRIGGER archive_workout_template_provenance_before_delete
BEFORE DELETE ON public.workout_templates
FOR EACH ROW EXECUTE FUNCTION public.archive_workout_template_provenance();
