-- Extension of coach-durable-actions.sql for disposable CI ONLY.
-- Not a migration; no production ledger entry or deployment authorization.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'food.quantity.update'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_food_entry_versions (
  -- Tombstone survives deletion so reusing a food UUID cannot revive a review.
  entry_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO private.coach_food_entry_versions(entry_id) SELECT id FROM public.food_log;

-- Every actual row change invalidates a reviewed entry, including manual ABA.
-- Canonical foods nutrient changes are additionally re-derived under lock by
-- the service: an unchanged food_log revision alone is insufficient authority.
CREATE FUNCTION private.advance_coach_food_entry_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO private.coach_food_entry_versions(entry_id, revision) VALUES (OLD.id, 1)
      ON CONFLICT(entry_id) DO UPDATE SET revision = private.coach_food_entry_versions.revision + 1;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  INSERT INTO private.coach_food_entry_versions(entry_id, revision) VALUES (NEW.id, 1)
    ON CONFLICT(entry_id) DO UPDATE SET revision = private.coach_food_entry_versions.revision + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_food_entry_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_food_entry_revision AFTER INSERT OR UPDATE OR DELETE ON public.food_log
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_food_entry_version();
ALTER TABLE private.coach_food_entry_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_food_entry_versions FROM PUBLIC, anon, authenticated;
