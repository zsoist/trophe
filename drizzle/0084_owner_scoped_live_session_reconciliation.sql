-- P2-10: resolve live-session state in one owner-scoped, RLS-independent read.
--
-- A normal SELECT cannot distinguish a genuinely missing session from a row
-- hidden by RLS. This SECURITY DEFINER function checks auth.uid() itself and
-- returns only the minimum state needed by the recovery UI. It is deliberately
-- read-only and does not expose the session owner or any free-form content.
CREATE OR REPLACE FUNCTION public.resolve_live_workout_session(
  p_session_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_live_structure jsonb;
  v_version integer;
  v_duration integer;
  v_completed_at timestamptz;
  v_client_request jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'A live workout session id is required' USING ERRCODE = '22023';
  END IF;

  SELECT user_id, live_structure, live_structure_version, duration_minutes,
         completed_at, client_request
    INTO v_owner_id, v_live_structure, v_version, v_duration,
         v_completed_at, v_client_request
    FROM public.workout_sessions
    WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('state', 'missing');
  END IF;
  IF v_owner_id IS DISTINCT FROM v_user_id THEN
    RETURN jsonb_build_object('state', 'forbidden');
  END IF;

  IF v_completed_at IS NOT NULL OR v_duration IS NOT NULL THEN
    RETURN jsonb_build_object(
      'state', 'terminal',
      'completed_at', v_completed_at,
      'duration_minutes', v_duration
    );
  END IF;

  IF v_live_structure IS NULL THEN
    IF v_client_request IS NOT NULL
       AND jsonb_typeof(v_client_request) = 'object'
       AND v_client_request->>'mode' = 'live' THEN
      RETURN jsonb_build_object('state', 'legacy');
    END IF;
    RETURN jsonb_build_object('state', 'invalid');
  END IF;

  IF jsonb_typeof(v_live_structure) <> 'array' OR v_version IS NULL THEN
    RETURN jsonb_build_object('state', 'invalid');
  END IF;
  RETURN jsonb_build_object(
    'state', 'active',
    'version', v_version,
    'structure', v_live_structure
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.resolve_live_workout_session(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_live_workout_session(uuid) FROM anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_live_workout_session(uuid) TO authenticated;
