-- Finding DB-1: user-created exercises must be private by default.
--
-- `exercises_templates_select` (migration 0008) makes every `is_template = true`
-- row readable by all authenticated users. Combined with `is_template DEFAULT
-- true` and an INSERT policy that only checked ownership, any client could add
-- a row that landed in every tenant's exercise picker, and with no UPDATE or
-- DELETE policy nobody could remove it. This migration:
--   1. flips the column default to false;
--   2. adds a (NOT VALID) check that library/template rows are never owned;
--   3. requires new rows to be private (is_template = false);
--   4. lets creators update and delete their own private rows without being
--      able to promote them to templates.

-- 1. Private by default.
ALTER TABLE public.exercises ALTER COLUMN is_template SET DEFAULT false;

-- 2. Library (template) rows are seeded without an owner. Any owned template
--    row is a pre-existing escalation artefact and must be triaged before the
--    constraint is validated. Left NOT VALID so this migration cannot fail on
--    existing production data; it still applies to every new INSERT/UPDATE.
--
--    OPERATOR: run this audit query on PRODUCTION before validating. It must
--    return zero rows (delete or disown any rows it does return first):
--
--      SELECT id, name, created_by FROM public.exercises WHERE is_template AND created_by IS NOT NULL;
--
--    Then validate:
--
--      ALTER TABLE public.exercises VALIDATE CONSTRAINT exercises_library_rows_unowned_check;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.exercises'::regclass
      AND conname = 'exercises_library_rows_unowned_check'
  ) THEN
    ALTER TABLE public.exercises
      ADD CONSTRAINT exercises_library_rows_unowned_check
      CHECK (is_template = false OR created_by IS NULL) NOT VALID;
  END IF;
END
$$;

-- 3. New rows must be owned by the caller AND private.
DROP POLICY IF EXISTS exercises_owner_insert ON public.exercises;
CREATE POLICY exercises_owner_insert ON public.exercises FOR INSERT TO authenticated
WITH CHECK (created_by = (SELECT auth.uid()) AND is_template = false);

-- 4. Creators manage their own private rows; the WITH CHECK blocks flipping
--    is_template to true (and reassigning created_by) through UPDATE.
DROP POLICY IF EXISTS exercises_owner_update ON public.exercises;
CREATE POLICY exercises_owner_update ON public.exercises FOR UPDATE TO authenticated
USING (created_by = (SELECT auth.uid()) AND is_template = false)
WITH CHECK (created_by = (SELECT auth.uid()) AND is_template = false);

DROP POLICY IF EXISTS exercises_owner_delete ON public.exercises;
CREATE POLICY exercises_owner_delete ON public.exercises FOR DELETE TO authenticated
USING (created_by = (SELECT auth.uid()) AND is_template = false);
