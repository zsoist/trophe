-- scripts/db/seed-drizzle-journal.sql
--
-- Pre-seeds the Drizzle migration journal so that `drizzle-kit migrate` (or
-- run-migrations.ts) skips migration 0000 on Supabase production.
--
-- WHY: Migration 0000 uses CREATE TABLE (not IF NOT EXISTS). On production,
-- these tables already exist from the old supabase-schema.sql, so 0000 would
-- fail with "relation already exists".
--
-- HOW: Drizzle's migrator uses a watermark approach — it finds the row with
-- the highest `created_at` in drizzle.__drizzle_migrations, then runs all
-- migrations with folderMillis > that value. By seeding 0000, the migrator
-- sees it as already applied and starts from 0001.
--
-- After running this, execute: DATABASE_URL="$DIRECT_URL" npx tsx scripts/db/run-migrations.ts
-- to apply migrations 0001–0006.
--
-- Usage:
--   psql "$DIRECT_URL" -f scripts/db/seed-drizzle-journal.sql

CREATE SCHEMA IF NOT EXISTS drizzle;

CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Seed migration 0000 (base schema — already exists on production)
-- Hash: SHA-256 of drizzle/0000_complex_johnny_blaze.sql content
-- created_at: folderMillis from drizzle/meta/_journal.json
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT
  'f10698b25417de993e6db90732eb7409bd666f6b6991aad0f88da157fa004f9d',
  1777647161067
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations
  WHERE hash = 'f10698b25417de993e6db90732eb7409bd666f6b6991aad0f88da157fa004f9d'
);
