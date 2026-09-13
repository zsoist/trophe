-- Promote the reviewed text Food action using the existing proposal/receipt authority.
-- Accept only the exact known predecessor or an already-applied identical check.
-- RLS, actor scope, envelope bounds, confirmation and canonical writers are unchanged.
DO $$
DECLARE current_definition text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO current_definition FROM pg_constraint
 WHERE conrelid='private.coach_action_proposals'::regclass
 AND conname='coach_action_proposals_action_check';
 IF current_definition = 'CHECK ((action = ANY (ARRAY[''preference.update''::text, ''food.quantity.update''::text, ''food.photo.create''::text])))' THEN
  ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
  ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
   CHECK (action IN ('preference.update','food.quantity.update','food.photo.create','food.text.create'));
 ELSIF current_definition IS DISTINCT FROM 'CHECK ((action = ANY (ARRAY[''preference.update''::text, ''food.quantity.update''::text, ''food.photo.create''::text, ''food.text.create''::text])))' THEN
  RAISE EXCEPTION 'Unexpected action constraint; review fresh schema before applying';
 END IF;
END $$;
