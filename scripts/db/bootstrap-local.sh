#!/bin/bash
# Trophē v0.3 — local Postgres bootstrap.
#
# Idempotent. Creates trophe_dev database on the Mac Mini's open_brain_postgres
# container, enables required extensions, applies the auth shim that emulates
# Supabase's auth.users + auth.uid() for local RLS testing, and seeds with the
# legacy supabase-schema.sql + supabase-workout-schema.sql files.
#
# Phase 1 onward, schema changes go through `npm run db:generate` (Drizzle Kit
# diff vs db/schema/*) — not by editing the .sql files. Those become DEPRECATED
# reference docs after Phase 1 ships.
#
# Usage:
#   bash scripts/db/bootstrap-local.sh            # fresh bootstrap
#   FORCE_RESET=1 bash scripts/db/bootstrap-local.sh   # drop + recreate

set -euo pipefail

PG_HOST="${PG_HOST:-127.0.0.1}"
PG_PORT="${PG_PORT:-5433}"
PG_USER="${PG_USER:-brain_user}"
PG_DB="${PG_DB:-trophe_dev}"
PG_PASS="${PG_PASS:-$(grep PGPASSWORD ~/.local/secrets/pg.env | sed 's/export PGPASSWORD=//')}"

export PGPASSWORD="$PG_PASS"

echo "==> Bootstrap target: $PG_USER@$PG_HOST:$PG_PORT/$PG_DB"

if [ "${FORCE_RESET:-0}" = "1" ]; then
  echo "==> FORCE_RESET — dropping $PG_DB"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c "DROP DATABASE IF EXISTS $PG_DB"
fi

# Create database if it doesn't exist
DB_EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -tAc \
  "SELECT 1 FROM pg_database WHERE datname='$PG_DB'")
if [ -z "$DB_EXISTS" ]; then
  echo "==> Creating database $PG_DB"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d postgres -c \
    "CREATE DATABASE $PG_DB OWNER $PG_USER"
else
  echo "==> Database $PG_DB already exists — skipping create"
fi

echo "==> Enabling extensions + auth shim"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" <<'SQL'
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Supabase auth shim — local RLS uses these GUCs as JWT claims
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
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;
SQL

# Apply legacy schemas only if profiles table doesn't exist yet
PROFILES_EXISTS=$(psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -tAc \
  "SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='profiles'")
if [ -z "$PROFILES_EXISTS" ]; then
  echo "==> Applying supabase-schema.sql"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -f supabase-schema.sql
  echo "==> Applying supabase-workout-schema.sql"
  psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -f supabase-workout-schema.sql
else
  echo "==> Schemas already applied — skipping"
fi

echo "==> Verification:"
psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -tAc "
SELECT count(*) || ' public tables' FROM information_schema.tables WHERE table_schema='public';
SELECT count(*) || ' RLS policies'  FROM pg_policies WHERE schemaname='public';
SELECT count(*) || ' indexes'        FROM pg_indexes WHERE schemaname='public';
SELECT extname || ' v' || extversion FROM pg_extension WHERE extname IN ('vector','pg_trgm','pgcrypto');
"

echo "==> Bootstrap complete."
