-- Requires shared ledger and db/isolated/coach-food-profile.sql.
-- Extension of coach-durable-actions.sql for disposable CI ONLY.
-- Not a migration; no production ledger entry or deployment authorization.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'food.quantity.update', 'memory.confirm', 'memory.correct', 'memory.delete', 'workout.set.reps.update', 'food.preference.update'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_food_preference_versions (
  -- Tombstone survives deletion so reusing a subject UUID cannot revive a review.
  subject_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO private.coach_food_preference_versions(subject_id) SELECT user_id FROM public.client_profiles WHERE user_id IS NOT NULL;

-- Every actual row change invalidates a reviewed entry, including manual ABA.
-- Conservative profile-row revision also invalidates ordinary profile changes.
-- No foreign key: deletion/recreation of a profile must not revive old proposals.
CREATE FUNCTION private.advance_coach_food_preference_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.user_id IS NOT NULL THEN
      INSERT INTO private.coach_food_preference_versions(subject_id, revision) VALUES (OLD.user_id, 1)
        ON CONFLICT(subject_id) DO UPDATE SET revision = private.coach_food_preference_versions.revision + 1;
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.user_id IS NOT NULL AND NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    INSERT INTO private.coach_food_preference_versions(subject_id, revision) VALUES (OLD.user_id, 1)
      ON CONFLICT(subject_id) DO UPDATE SET revision = private.coach_food_preference_versions.revision + 1;
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO private.coach_food_preference_versions(subject_id, revision) VALUES (NEW.user_id, 1)
      ON CONFLICT(subject_id) DO UPDATE SET revision = private.coach_food_preference_versions.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_food_preference_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_food_preference_revision AFTER INSERT OR UPDATE OR DELETE ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_food_preference_version();
ALTER TABLE private.coach_food_preference_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_food_preference_versions FROM PUBLIC, anon, authenticated;
