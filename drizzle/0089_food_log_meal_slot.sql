-- 0089_food_log_meal_slot
-- Defect: both snack slots persisted canonical meal_type='snack', so the log
-- surface guessed AM/PM from created_at (the INSERT time). Backdated logging and
-- a different browser timezone misrouted an afternoon snack into Morning Snack,
-- and explicit Dinner relied entirely on meal_type. This adds an explicit,
-- additive meal_slot token captured at log time. It DOES NOT rewrite history:
-- existing rows stay NULL and are shown in a truthful generic bucket.
--
-- Backwards compatible: nullable, no default, no backfill, no data rewrite.
-- Old clients that omit meal_slot keep writing valid rows (NULL passes the check).
--
-- NULL semantics (why `meal_type IS NOT NULL` is required): `meal_type` is itself
-- nullable. Under SQL three-valued logic `meal_type = meal_slot` against a NULL
-- meal_type evaluates to NULL, not FALSE, and a CHECK constraint is satisfied
-- when its result is NULL — so a bare `meal_slot IS NULL OR (<combination>)`
-- would ACCEPT a row with a non-null meal_slot and a NULL meal_type. The
-- predicate below therefore demands `meal_type IS NOT NULL` before any
-- allowed-combination arm, so a present slot always requires a coherent
-- meal_type. `meal_slot IS NULL` (legacy / not-yet-updated client) stays valid
-- regardless of meal_type.

ALTER TABLE public.food_log ADD COLUMN meal_slot text;

ALTER TABLE public.food_log
  ADD CONSTRAINT "food_log_meal_slot_check"
  CHECK (
    meal_slot IS NULL
    OR (
      meal_type IS NOT NULL
      AND (
        (
          meal_slot = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'pre_workout'::text, 'post_workout'::text])
          AND meal_type = meal_slot
        )
        OR (
          meal_slot = ANY (ARRAY['snack_am'::text, 'snack_pm'::text])
          AND meal_type = 'snack'::text
        )
      )
    )
  ) NOT VALID;

-- ── Preflight (run BEFORE applying, read-only) ──────────────────────────────
-- 1. Confirm the column does not already exist (must return 0 rows):
--      SELECT 1 FROM information_schema.columns
--      WHERE table_schema='public' AND table_name='food_log' AND column_name='meal_slot';
-- 2. Confirm the constraint name is free (must return 0 rows):
--      SELECT 1 FROM pg_constraint WHERE conname='food_log_meal_slot_check';
-- 3. Record the pre-change row count for the record:
--      SELECT count(*) FROM public.food_log;
--
-- ── Backup (before applying) ────────────────────────────────────────────────
-- The change is purely additive (no data rewrite, no backfill), so the default
-- "backup" is simply recording the pre-change cohort size (preflight step 3).
-- A physical copy is optional; if the audit trail wants one:
--      pg_dump -t public.food_log <database> > food_log_pre_0089.sql
--
-- ── Rollback (DATA-PRESERVING, default) ─────────────────────────────────────
-- Default rollback is APP-ONLY: redeploy the previous application build and STOP.
-- The additive column, its constraint, and every already-saved meal_slot value
-- are RETAINED — no DROP COLUMN, no data is deleted. The previous app build never
-- selects meal_slot, so leaving it in place is invisible and harmless, and any
-- AM/PM values users saved are preserved for a future re-apply.
--
--   -- (no database change on rollback — application redeploy only)
--
-- The DROPs below are NOT a normal rollback: they permanently destroy every saved
-- meal_slot value. They are a separate, destructive cleanup that requires its own
-- explicit approval, backup and migration. Do not run them as part of rollback.
--   -- FUTURE / NOT APPROVED — destructive cleanup only:
--   -- ALTER TABLE public.food_log DROP CONSTRAINT IF EXISTS "food_log_meal_slot_check";
--   -- ALTER TABLE public.food_log DROP COLUMN IF EXISTS meal_slot;
--
-- NOT VALID keeps the check enforced for every NEW/updated row while historical
-- rows (all NULL) are not rescanned. A later `VALIDATE CONSTRAINT` is optional
-- and only after AG1 confirms no in-flight legacy writer sets meal_slot alone.
