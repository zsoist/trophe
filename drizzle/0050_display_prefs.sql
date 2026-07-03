-- 0050_display_prefs.sql
-- Per-coach display preferences (Michael feedback: "too many features").
--
--   * profiles.display_prefs — which panels the coach sees on their OWN
--     surfaces (coach dashboard, client detail). Written by the coach via the
--     existing "Users can update own profile" policy.
--   * client_profiles.client_view_prefs — what THIS coach's clients see
--     (calories on/off, analytics sections…). Replaces the hardcoded
--     lib/client-view.ts module constants, exactly as its own comment
--     anticipated. Coach writes via the existing "Coaches can update assigned
--     clients" policy; the client reads their own row via "Users can manage
--     own client_profile". No RLS changes needed.
--
-- Unknown/missing keys fall back to the Essential-preset defaults in
-- lib/display-prefs.ts, so new panels can ship default-off without migrations.
-- Additive only.

ALTER TABLE "profiles" ADD COLUMN "display_prefs" jsonb DEFAULT '{}'::jsonb;

ALTER TABLE "client_profiles" ADD COLUMN "client_view_prefs" jsonb DEFAULT '{}'::jsonb;
