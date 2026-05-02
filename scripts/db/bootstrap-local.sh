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
while IFS='|' read -r tag created_at; do
  file="drizzle/${tag}.sql"
  hash="$(shasum -a 256 "$file" | awk '{print $1}')"
  applied="$(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -tAc "SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = '${hash}'")"

  if [ -n "$applied" ]; then
    echo "   - ${tag} already applied"
    continue
  fi

  echo "   - applying ${tag}"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -f "$file" >/dev/null
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" \
    -c "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${created_at});" >/dev/null
done < <(node -e 'const j=require("./drizzle/meta/_journal.json"); for (const e of j.entries) console.log(`${e.tag}|${e.when}`)')
fi

if [ "$COMPAT_MODE" = "1" ]; then
  echo "==> Granting test/runtime privileges to Supabase-style roles"
  psql -v ON_ERROR_STOP=1 -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" <<'SQL'
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA auth TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;
SQL
fi

echo "==> Verifying schema and capturing explain plans"
npx tsx scripts/db/verify.ts
npx tsx scripts/db/explain.ts

echo "==> Bootstrap complete."
