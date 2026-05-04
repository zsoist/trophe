-- Phase 10: B2B billing readiness metadata.
-- This does not enable live money movement. Stripe Connect activation remains
-- operator-gated until legal/tax decisions are complete.

ALTER TABLE "organizations"
  ADD COLUMN IF NOT EXISTS "billing_email" text,
  ADD COLUMN IF NOT EXISTS "stripe_customer_id" text,
  ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text,
  ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS "plan_limits" jsonb NOT NULL DEFAULT '{"coaches":1,"clients":25}'::jsonb;

ALTER TABLE "organizations"
  DROP CONSTRAINT IF EXISTS "organizations_subscription_status_check";

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_subscription_status_check"
  CHECK (subscription_status = ANY (ARRAY['not_configured'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'canceled'::text]));
