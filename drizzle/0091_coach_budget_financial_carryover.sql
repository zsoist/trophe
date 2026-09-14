-- An operator-reviewed, frozen source ledger can seed this authority without
-- copying QA users or application records. Never reseed or refund this snapshot.
ALTER TABLE private.coach_pilot_budgets ADD COLUMN carryover_records jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE private.coach_pilot_budgets ADD CONSTRAINT coach_pilot_budget_carryover_array
  CHECK (jsonb_typeof(carryover_records) = 'array' AND jsonb_array_length(carryover_records) <= 4096);
CREATE FUNCTION private.coach_budget_carryover_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF NEW.carryover_records IS DISTINCT FROM OLD.carryover_records THEN
    RAISE EXCEPTION 'Financial carryover is immutable';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_budget_carryover_immutable() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_budget_carryover_immutable BEFORE UPDATE ON private.coach_pilot_budgets
  FOR EACH ROW EXECUTE FUNCTION private.coach_budget_carryover_immutable();
COMMENT ON COLUMN private.coach_pilot_budgets.carryover_records IS
  'Immutable source financial attempt records; charged total and attempt_count include these records. Source runtime must remain frozen.';
