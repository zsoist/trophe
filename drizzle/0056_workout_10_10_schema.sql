-- Workout 10/10 wave: exercise form cues + superset grouping.
--
-- exercises.instructions{,_es,_el}: one concise form-cue sentence per language
--   (shown in the exercise info sheet and guided mode). Seeded in 0057.
-- workout_sets.superset_group: nullable int — sets sharing a group id within a
--   session belong to the same superset pairing (freestyle logger, Hevy-style).
--   Display-level semantics only; no RLS impact (column rides existing policies).

ALTER TABLE exercises ADD COLUMN IF NOT EXISTS instructions text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS instructions_es text;
ALTER TABLE exercises ADD COLUMN IF NOT EXISTS instructions_el text;

ALTER TABLE workout_sets ADD COLUMN IF NOT EXISTS superset_group integer;
