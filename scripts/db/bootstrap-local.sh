#!/bin/bash
# Trophē v0.3 — canonical local DB bootstrap.
#
# Local source of truth:
#   1. OrbStack Docker runtime
#   2. Supabase CLI local stack (`supabase/config.toml`)
#   3. Drizzle migrations in `drizzle/`
#
# Compatibility mode:
#   - CI can set SKIP_SUPABASE_START=1 and provide PG_*/DATABASE_URL against a
#     pgvector Postgres service. This path still applies the same Drizzle
#     migrations and RLS compatibility setup; it does not seed legacy SQL.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

ARTIFACT_DIR="${DB_ARTIFACT_DIR:-$ROOT/artifacts/db}"
mkdir -p "$ARTIFACT_DIR"

LOCAL_HOST="${PG_HOST:-127.0.0.1}"
LOCAL_PORT="${PG_PORT:-54322}"
LOCAL_USER="${PG_USER:-postgres}"
LOCAL_PASS="${PG_PASS:-${PGPASSWORD:-postgres}}"
LOCAL_DB="${PG_DB:-postgres}"
COMPAT_MODE=1

if [ "${SKIP_SUPABASE_START:-0}" != "1" ] && [ "${CI:-false}" != "true" ]; then
  echo "==> Checking OrbStack / Docker / Supabase readiness"
  if ! npx tsx scripts/db/doctor.ts >/dev/null 2>&1; then
    echo "==> Starting OrbStack"
    orbctl start >/dev/null
  fi

  if ! docker ps >/dev/null 2>&1; then
    echo "Docker daemon is not reachable after OrbStack start." >&2
    exit 1
  fi

  if ! npx supabase status -o pretty >/dev/null 2>&1; then
    echo "==> Starting local Supabase stack"
    npx supabase start >"$ARTIFACT_DIR/supabase-start.log" 2>&1
  fi

  LOCAL_HOST=127.0.0.1
  LOCAL_PORT=54322
  LOCAL_USER=postgres
  LOCAL_PASS=postgres
  LOCAL_DB=postgres
  COMPAT_MODE=0
fi

export PGHOST="$LOCAL_HOST"
export PGPORT="$LOCAL_PORT"
export PGUSER="$LOCAL_USER"
export PGPASSWORD="$LOCAL_PASS"
export PGDATABASE="$LOCAL_DB"

echo "==> Bootstrap target: $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"

if [ "${PGDATABASE}" != "postgres" ]; then
  DB_EXISTS="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${PGDATABASE}'")"
  if [ -z "$DB_EXISTS" ]; then
    echo "==> Creating database $PGDATABASE"
    psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d postgres -c "CREATE DATABASE ${PGDATABASE} OWNER ${PGUSER}"
  fi
fi

echo "==> Preparing extensions"
psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
SQL

if [ "$COMPAT_MODE" = "1" ]; then
  echo "==> Installing plain-Postgres compatibility for Supabase-style auth/RLS"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'authenticated')
$$;
SQL
fi

export DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"

# Migration 0048 intentionally fails closed when Supabase Vault exists without the
# memory worker secret. Local Supabase has Vault, so seed a non-production fixture
# before running migrations. Plain Postgres CI has no Vault and skips this block.
if [ "$COMPAT_MODE" = "0" ]; then
  echo "==> Preparing local-only Vault fixtures"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'memory_cron_secret'
  ) THEN
    PERFORM vault.create_secret('local-test-only', 'memory_cron_secret');
  END IF;
END
$$;
SQL
fi

echo "==> Applying Drizzle migrations"
psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  hash text NOT NULL,
  created_at bigint
);
SQL

history_count="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT count(*) FROM drizzle.__drizzle_migrations")"
profiles_exists="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'")"

if [ "$history_count" = "0" ] && [ -n "$profiles_exists" ]; then
  echo "   - existing schema detected without migration history; backfilling journal"
  while IFS='|' read -r tag created_at; do
    file="drizzle/${tag}.sql"
    hash="$(shasum -a 256 "$file" | awk '{print $1}')"
    psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
      -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${created_at});" >/dev/null
  done < <(node -e 'const j=require("./drizzle/meta/_journal.json"); for (const e of j.entries) console.log(`${e.tag}|${e.when}`)')
else
  # Fresh DB or partially-migrated DB: apply pending migrations via the
  # drizzle-orm migrator (not drizzle-kit CLI, which swallows errors in CI).
  echo "   - running drizzle-orm migrator"
  DIRECT_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}" \
  DATABASE_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}" \
    npx tsx scripts/db/run-migrations.ts
fi

if [ "$COMPAT_MODE" = "1" ]; then
  echo "==> Granting test/runtime privileges to Supabase-style roles"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
GRANT SELECT ON TABLE public.food_database TO anon;
SQL
fi

# Canonical lookup foods required by the local/CI food-lookup regression tests.
# Seeded HERE (bootstrap path) and deliberately NOT as a journaled migration, so these
# deterministic fixtures never enter production: prod already holds the real USDA/HHF rows
# for these canonical_food_keys. Macros are standard USDA SR reference values.
echo "==> Seeding canonical lookup foods (local/CI bootstrap fixture only — not production)"
psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
INSERT INTO foods (
  source, source_id, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g,
  default_serving_grams, default_serving_unit, macro_confidence,
  unit_conversion_verified, canonical_food_key, provenance_notes, data_reviewed_at,
  popularity, verified
) VALUES
  ('usda', 'wp2-seed-plantain-raw', 'lab_verified', 'Plantain, raw', ARRAY['US','CO'],
   122, 1.3, 31.9, 0.4, 2.3, 179, 'piece', 0.85, true, 'plantain_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 75, 'manual'),
  ('usda', 'wp2-seed-plantain-fried', 'lab_verified', 'Plantains, yellow, ripe, fried', ARRAY['US','CO'],
   309, 1.5, 49.2, 11.8, 2.3, 119, 'piece', 0.85, true, 'plantain_fried',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 80, 'manual'),
  ('usda', 'wp2-seed-banana-raw', 'lab_verified', 'Banana, raw', ARRAY['US','CO','GR'],
   89, 1.1, 22.8, 0.33, 2.6, 118, 'medium', 0.9, true, 'banana_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 90, 'manual'),
  ('usda', 'wp2-seed-chicken-breast-grilled', 'lab_verified', 'Chicken breast, grilled', ARRAY['US','GR','CO'],
   165, 31.0, 0.0, 3.6, 0.0, 120, 'piece', 0.9, true, 'chicken_breast_grilled',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 90, 'manual'),
  ('usda', 'wp2-seed-white-rice-cooked', 'lab_verified', 'Rice, white, cooked', ARRAY['US','GR','CO'],
   130, 2.7, 28.2, 0.3, 0.4, 158, 'cup', 0.9, true, 'rice_white_cooked',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 88, 'manual'),
  ('usda', 'wp2-seed-apple-raw', 'lab_verified', 'Apple, raw', ARRAY['US','CO','GR'],
   52, 0.3, 13.8, 0.2, 2.4, 182, 'medium', 0.9, true, 'apple_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 85, 'manual'),
  ('usda', 'wp2-seed-egg-raw', 'lab_verified', 'Egg, whole, raw', ARRAY['US','GR','CO'],
   143, 12.6, 0.72, 9.51, 0.0, 50, 'piece', 0.9, true, 'egg_chicken_whole_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 90, 'manual'),
  ('usda', 'wp2-seed-egg-scrambled', 'lab_verified', 'Egg, whole, cooked, scrambled', ARRAY['US','GR','CO'],
   149, 10.0, 1.6, 10.9, 0.0, 50, 'piece', 0.88, true, 'egg_chicken_scrambled',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-whole-milk', 'lab_verified', 'Milk, whole', ARRAY['US','GR','CO'],
   61, 3.2, 4.8, 3.3, 0.0, 244, 'cup', 0.9, true, 'milk_whole',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 80, 'manual'),
  ('usda', 'wp2-seed-bacon-cooked', 'lab_verified', 'Pork, cured, bacon, cooked', ARRAY['US'],
   541, 37.0, 1.4, 42.0, 0.0, 8, 'strip', 0.85, true, 'bacon_pork_cooked',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 75, 'manual'),
  ('usda', 'wp2-seed-salad-garden', 'lab_verified', 'Side salad, mixed salad greens, raw', ARRAY['US','GR','CO'],
   17, 1.0, 3.3, 0.2, 1.6, 100, 'serving', 0.75, true, 'salad_garden',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 70, 'manual'),
  ('usda', 'wp2-seed-honey', 'lab_verified', 'Honey', ARRAY['US','GR','CO'],
   304, 0.3, 82.4, 0.0, 0.2, 21, 'tablespoon', 0.9, true, 'honey',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 80, 'manual'),
  ('usda', 'wp2-seed-whey-protein-powder', 'lab_verified', 'Whey protein isolate', ARRAY['US','GR','CO'],
   352, 78.1, 6.27, 1.57, 0.0, 30, 'scoop', 0.85, true, 'whey_protein_powder',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 72, 'manual'),
  ('usda', 'wp2-seed-olive-oil', 'lab_verified', 'Olive oil, extra virgin', ARRAY['US','GR','CO'],
   884, 0.0, 0.0, 100.0, 0.0, 14, 'tbsp', 0.9, true, 'olive_oil_extra_virgin',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 90, 'manual'),
  ('usda', 'wp2-seed-black-beans-cooked', 'lab_verified', 'Black beans, cooked', ARRAY['US','CO'],
   132, 8.86, 23.7, 0.54, 8.7, 172, 'cup', 0.9, true, 'black_beans_cooked',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-arepa-corn', 'lab_verified', 'Arepa, cornmeal cake', ARRAY['CO'],
   362, 8.12, 76.9, 3.58, 7.3, 65, 'piece', 0.75, true, 'arepa_corn',
   'USDA cornmeal proxy; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-ground-beef-cooked', 'lab_verified', 'Ground beef, 80% lean, 20% fat, cooked, pan-browned', ARRAY['US','CO'],
   250, 25.9, 0.0, 15.4, 0.0, 100, 'serving', 0.9, true, 'ground_beef_cooked',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 85, 'manual'),
  ('usda', 'wp2-seed-avocado-raw', 'lab_verified', 'Avocado, raw', ARRAY['US','GR','CO'],
   160, 2.0, 8.53, 14.7, 6.7, 201, 'piece', 0.9, true, 'avocado_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 88, 'manual'),
  ('usda', 'wp2-seed-oats-rolled-dry', 'lab_verified', 'Cereals, oats, regular, quick, instant, dry', ARRAY['US','GR'],
   379, 13.2, 67.7, 6.52, 10.1, 81, 'cup', 0.9, true, 'oats_rolled_dry',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 84, 'manual'),
  ('usda', 'wp2-seed-salmon-atlantic-raw', 'lab_verified', 'Fish, salmon, Atlantic, farmed, raw', ARRAY['US','GR'],
   142, 19.8, 0.0, 6.34, 0.0, 198, 'fillet', 0.9, true, 'salmon_atlantic_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 86, 'manual'),
  ('usda', 'wp2-seed-broccoli-raw', 'lab_verified', 'Broccoli, raw', ARRAY['US','GR'],
   34, 2.82, 6.64, 0.37, 2.6, 91, 'cup', 0.9, true, 'broccoli_raw',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 84, 'manual'),
  ('usda', 'wp2-seed-peanut-butter', 'lab_verified', 'Peanut butter, smooth', ARRAY['US'],
   598, 22.2, 22.3, 51.4, 5.0, 16, 'tbsp', 0.9, true, 'peanut_butter',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-almonds', 'lab_verified', 'Almonds, raw', ARRAY['US','GR'],
   579, 21.2, 21.6, 49.9, 12.5, 30, 'handful', 0.9, true, 'almonds',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-rice-cake-plain', 'lab_verified', 'Rice cake, brown rice, plain', ARRAY['US','GR'],
   387, 8.22, 81.6, 2.78, 4.2, 9, 'piece', 0.9, true, 'rice_cake_plain',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 82, 'manual'),
  ('usda', 'wp2-seed-canned-tuna-water', 'lab_verified', 'Tuna, canned in water, drained', ARRAY['US','GR'],
   116, 25.5, 0.0, 0.82, 0.0, 165, 'can', 0.9, true, 'canned_tuna_water',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 84, 'manual'),
  ('usda', 'wp2-seed-whole-wheat-bread', 'lab_verified', 'Whole wheat bread', ARRAY['US','GR','CO'],
   252, 12.4, 42.7, 3.5, 6.0, 28, 'slice', 0.9, true, 'whole_wheat_bread',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 84, 'manual'),
  ('usda', 'wp2-seed-feta-cheese', 'lab_verified', 'Feta cheese', ARRAY['GR','US'],
   264, 14.2, 4.1, 21.3, 0.0, 30, 'slice', 0.9, true, 'feta_cheese',
   'USDA SR reference values; deterministic local/CI bootstrap fixture (not production data).', now(), 85, 'manual')
ON CONFLICT (source, source_id) DO UPDATE SET
  data_quality = EXCLUDED.data_quality,
  name_en = EXCLUDED.name_en,
  region = EXCLUDED.region,
  kcal_per_100g = EXCLUDED.kcal_per_100g,
  protein_per_100g = EXCLUDED.protein_per_100g,
  carb_per_100g = EXCLUDED.carb_per_100g,
  fat_per_100g = EXCLUDED.fat_per_100g,
  fiber_per_100g = EXCLUDED.fiber_per_100g,
  default_serving_grams = EXCLUDED.default_serving_grams,
  default_serving_unit = EXCLUDED.default_serving_unit,
  macro_confidence = EXCLUDED.macro_confidence,
  unit_conversion_verified = EXCLUDED.unit_conversion_verified,
  canonical_food_key = EXCLUDED.canonical_food_key,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = EXCLUDED.popularity,
  verified = EXCLUDED.verified;

-- The generated search vector includes localized names, so these deterministic
-- translations exercise the same cross-language lookup path as production.
UPDATE foods SET name_el = 'Φέτα'
WHERE source = 'usda' AND source_id = 'wp2-seed-feta-cheese';
UPDATE foods SET name_el = 'Ελαιόλαδο'
WHERE source = 'usda' AND source_id = 'wp2-seed-olive-oil';
UPDATE foods SET name_el = 'Κοτόπουλο στήθος'
WHERE source = 'usda' AND source_id = 'wp2-seed-chicken-breast-grilled';
SQL

echo "==> Verifying schema and capturing explain plans"
npx tsx scripts/db/verify.ts
npx tsx scripts/db/explain.ts

echo "==> Bootstrap complete."
