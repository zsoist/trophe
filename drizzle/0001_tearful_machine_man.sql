-- Phase 1: schema discipline + 4-tier roles + organizations.
--
-- Key operations:
--   1. Coerce legacy 'both' role to 'coach' (v0.2 had 'both', v0.3 enum doesn't)
--   2. Create user_role enum (super_admin | admin | coach | client)
--   3. Create organizations + organization_members + audit_log tables
--   4. Upgrade profiles.role from text → user_role enum
--      REQUIREMENT: must drop + recreate any policy that references profiles.role
--      as text, because Postgres blocks ALTER COLUMN TYPE when policies depend on it.
--   5. Recreate food_database GIN search index (correct expression)

-- ─── guard: coerce legacy 'both' role before enum is created ────────────────
UPDATE profiles SET role = 'coach' WHERE role = 'both';--> statement-breakpoint

-- ─── 1. user_role enum ───────────────────────────────────────────────────────
CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'coach', 'client');--> statement-breakpoint

-- ─── 2. new tables ────────────────────────────────────────────────────────────
CREATE TABLE "organization_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" DEFAULT 'client' NOT NULL,
	"invited_by" uuid,
	"joined_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organization_members_org_user_key" UNIQUE("org_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"owner_id" uuid,
	"plan" text DEFAULT 'free' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "organizations_slug_key" UNIQUE("slug"),
	CONSTRAINT "organizations_plan_check" CHECK (plan = ANY (ARRAY['free'::text, 'pro'::text, 'enterprise'::text]))
);
--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_role" "user_role",
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- ─── 3. upgrade profiles.role: text → user_role enum ─────────────────────────
-- Must drop the policy whose WITH CHECK references profiles.role as text first,
-- otherwise Postgres error: "cannot alter type of a column used in a policy definition".
DROP POLICY IF EXISTS "Coaches insert food_database" ON food_database;--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT IF EXISTS "profiles_role_check";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "role" SET DEFAULT 'client'::"public"."user_role";--> statement-breakpoint
ALTER TABLE "profiles" ALTER COLUMN "role" SET DATA TYPE "public"."user_role" USING "role"::"public"."user_role";--> statement-breakpoint

-- Recreate the policy with enum-aware WITH CHECK clause.
CREATE POLICY "Coaches insert food_database" ON food_database
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    auth.uid() IN (
      SELECT profiles.id FROM profiles
      WHERE profiles.role IN ('coach'::user_role, 'admin'::user_role, 'super_admin'::user_role)
    )
  );--> statement-breakpoint

-- ─── 4. foreign keys for new tables ──────────────────────────────────────────
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- ─── 5. indexes ───────────────────────────────────────────────────────────────
CREATE INDEX "idx_org_members_org" ON "organization_members" USING btree ("org_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_org_members_user" ON "organization_members" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_actor" ON "audit_log" USING btree ("actor_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_action" ON "audit_log" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_table" ON "audit_log" USING btree ("table_name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_audit_log_created" ON "audit_log" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
-- Recreate food_database GIN search index with corrected expression.
DROP INDEX IF EXISTS "idx_food_db_search";--> statement-breakpoint
CREATE INDEX "idx_food_db_search" ON "food_database" USING gin (
  to_tsvector('simple'::regconfig,
    (((COALESCE(name, ''::text) || ' '::text) || COALESCE(name_el, ''::text)) || ' '::text) || COALESCE(name_es, ''::text)
  )
);--> statement-breakpoint

-- ─── 6. RLS helper stub (full version in 0002_role_backfill.sql) ─────────────
-- audit_log policy references is_super_admin(); create a stub now so the
-- policy compiles, then 0002 installs the real implementation.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT false; $$;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION is_super_admin() TO public;--> statement-breakpoint

-- ─── 7. RLS policies for new tables ──────────────────────────────────────────
CREATE POLICY "Members view own membership" ON "organization_members" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Org admins manage members" ON "organization_members" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Org members can view own org" ON "organizations" AS PERMISSIVE FOR SELECT TO public USING ((id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())));--> statement-breakpoint
CREATE POLICY "Org admins can update org" ON "organizations" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Super admins full org access" ON "organizations" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Super admins read audit log" ON "audit_log" AS PERMISSIVE FOR SELECT TO public USING ((SELECT is_super_admin()));--> statement-breakpoint
CREATE POLICY "Service role insert audit log" ON "audit_log" AS PERMISSIVE FOR INSERT TO public;
