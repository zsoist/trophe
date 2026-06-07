-- Reconcile schema objects that previously existed only in manually-applied SQL.
-- Every statement is safe on both a fresh database and production.

DO $$ BEGIN
  CREATE TYPE recipe_source AS ENUM ('fndds', 'manual', 'llm_decomp', 'menustat');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'menustat';
--> statement-breakpoint
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'chain_co';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS dish_recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  dish_name text NOT NULL,
  dish_name_localized text,
  lang text DEFAULT 'en' NOT NULL,
  region text[],
  total_grams real NOT NULL,
  total_kcal real NOT NULL,
  total_protein real NOT NULL,
  total_carbs real NOT NULL,
  total_fat real NOT NULL,
  total_fiber real,
  ingredients jsonb NOT NULL,
  source recipe_source DEFAULT 'llm_decomp' NOT NULL,
  confidence real DEFAULT 0.8,
  verified_by uuid REFERENCES profiles(id),
  use_count integer DEFAULT 0 NOT NULL,
  last_used_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT dish_recipes_name_lang_key UNIQUE(dish_name, lang)
);
--> statement-breakpoint
ALTER TABLE food_log ALTER COLUMN calories TYPE real USING calories::real;
--> statement-breakpoint
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS billing_email text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS plan_limits jsonb NOT NULL DEFAULT '{"coaches":1,"clients":25}'::jsonb;
--> statement-breakpoint
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;
--> statement-breakpoint
ALTER TABLE organizations ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status = ANY (ARRAY['not_configured', 'trialing', 'active', 'past_due', 'canceled']));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dish_recipes_name_gin
  ON dish_recipes USING gin(to_tsvector('simple', dish_name));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_dish_recipes_region ON dish_recipes USING gin(region);
--> statement-breakpoint
ALTER TABLE dish_recipes ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_select ON dish_recipes;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_insert ON dish_recipes;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_update ON dish_recipes;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_authenticated_select ON dish_recipes;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_staff_insert ON dish_recipes;
--> statement-breakpoint
DROP POLICY IF EXISTS dish_recipes_staff_update ON dish_recipes;
--> statement-breakpoint
CREATE POLICY dish_recipes_authenticated_select ON dish_recipes
  FOR SELECT TO authenticated USING (true);
--> statement-breakpoint
CREATE POLICY dish_recipes_staff_insert ON dish_recipes
  FOR INSERT TO authenticated WITH CHECK (private.is_staff());
--> statement-breakpoint
CREATE POLICY dish_recipes_staff_update ON dish_recipes
  FOR UPDATE TO authenticated USING (private.is_staff()) WITH CHECK (private.is_staff());
