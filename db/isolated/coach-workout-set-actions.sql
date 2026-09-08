-- Experimental delta for the disposable CI database ONLY.
-- Not a migration, not registered in the production ledger, not deployment approval.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'workout.set.reps.update'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_workout_set_versions (
  -- Deliberately no foreign key: the tombstone survives set and session deletion.
  set_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO private.coach_workout_set_versions(set_id) SELECT id FROM public.workout_sets;

CREATE FUNCTION private.advance_coach_workout_set_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  target_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  INSERT INTO private.coach_workout_set_versions(set_id, revision) VALUES (target_id, 1)
    ON CONFLICT(set_id) DO UPDATE SET revision = private.coach_workout_set_versions.revision + 1;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_workout_set_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_workout_set_revision AFTER INSERT OR UPDATE OR DELETE ON public.workout_sets
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_workout_set_version();

ALTER TABLE private.coach_workout_set_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_workout_set_versions FROM PUBLIC, anon, authenticated;
