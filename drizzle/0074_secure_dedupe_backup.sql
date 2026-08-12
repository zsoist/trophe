-- A July food-dedupe recovery table was created outside the migration chain.
-- Supabase inherited broad authenticated grants and RLS was not enabled, which
-- made the nine-row operator backup visible to signed-in users. Keep the
-- recovery data for rollback, but restrict it to database operators.
DO $$
BEGIN
  IF to_regclass('public.foods_dedupe_backup_20260703') IS NOT NULL THEN
    REVOKE ALL PRIVILEGES ON TABLE public.foods_dedupe_backup_20260703
      FROM anon, authenticated;
    ALTER TABLE public.foods_dedupe_backup_20260703 ENABLE ROW LEVEL SECURITY;
  END IF;
END
$$;
