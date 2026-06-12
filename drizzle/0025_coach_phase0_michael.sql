-- Phase 0 of coach module (Michael Kavdas call, 2026-06-12).
-- 1. Weekly meal plan entries (free-text per day x slot — matches coaching style)
-- 2. client_profiles: assessment notes + custom goal + stabilization status
-- 3. client_habits: custom display color

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_slot text NOT NULL CHECK (meal_slot IN ('breakfast','snack1','lunch','snack2','dinner')),
  description text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, day_of_week, meal_slot)
);

ALTER TABLE meal_plan_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY meal_plan_coach_all ON meal_plan_entries FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id))
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id));

CREATE POLICY meal_plan_client_select ON meal_plan_entries FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_meal_plan_client ON meal_plan_entries(client_id, day_of_week);

ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS assessment text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS goal_title text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS goal_metric text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS goal_window text;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS stabilization boolean NOT NULL DEFAULT false;

ALTER TABLE client_habits ADD COLUMN IF NOT EXISTS color text;
