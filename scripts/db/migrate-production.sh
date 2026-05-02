#!/usr/bin/env bash
# scripts/db/migrate-production.sh
#
# Safe Supabase production migration runner for Trophē v0.3-overhaul.
#
# Applies all 7 Drizzle migrations to Supabase production then seeds:
#   1. Runs drizzle-kit migrate (migrations 0000-0006) via DIRECT_URL
#   2. Runs the Supabase-safe role backfill (skips auth.users INSERT)
#   3. Optionally seeds foods table from local pg_dump
#
# Prerequisites:
#   export DIRECT_URL="postgresql://postgres.<ref>:<pass>@aws-0-*.pooler.supabase.com:5432/postgres"
#   export DATABASE_URL="postgresql://postgres.<ref>:<pass>@aws-0-*.pooler.supabase.com:6543/postgres"
#
# Usage:
#   bash scripts/db/migrate-production.sh [--seed-foods]
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

# ── Validation ─────────────────────────────────────────────────────────────────
if [[ -z "${DIRECT_URL:-}" ]]; then
  echo "❌  DIRECT_URL is not set."
  echo "    Get it from: Supabase Dashboard → Project Settings → Database → Direct connection"
  exit 1
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Trophē v0.3 — Production migration"
echo "  Target: ${DIRECT_URL%@*}@*** (password redacted)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── Step 1: Drizzle migrations (0000–0006) ─────────────────────────────────────
echo ""
echo "📦  Step 1/3 — Running Drizzle migrations..."
DATABASE_URL="$DIRECT_URL" npx drizzle-kit migrate
echo "✅  Drizzle migrations applied."

# ── Step 2: Production-safe role backfill ─────────────────────────────────────
echo ""
echo "👤  Step 2/3 — Applying Supabase-safe role backfill..."
psql "$DIRECT_URL" -f scripts/db/production-role-backfill.sql
echo "✅  Role backfill applied."

# ── Step 3: (optional) Seed foods from local pg_dump ──────────────────────────
if [[ "${1:-}" == "--seed-foods" ]]; then
  echo ""
  echo "🌿  Step 3/3 — Seeding foods table from local Mac Mini Postgres..."

  LOCAL_DB="${DATABASE_URL:?Set DATABASE_URL — see .env.local.example}"

  # Dump foods + aliases + conversions from local
  # PGPASSWORD is picked up from env automatically — do not hardcode
  DUMP_FILE="/tmp/trophe-foods-seed-$(date +%Y%m%d%H%M%S).sql"
  pg_dump -h 127.0.0.1 -p 5433 -U "${PGUSER:-trophe_user}" -d trophe_dev \
    --table=foods --table=food_aliases --table=food_unit_conversions \
    --data-only --no-owner --no-privileges \
    --format=plain > "$DUMP_FILE"

  echo "   Dump written to $DUMP_FILE ($(du -sh "$DUMP_FILE" | cut -f1))"
  echo "   Restoring to production..."

  psql "$DIRECT_URL" < "$DUMP_FILE"

  echo "✅  Foods table seeded."
  echo "   Verifying row counts..."
  psql "$DIRECT_URL" -c "SELECT source, COUNT(*) FROM foods GROUP BY source ORDER BY source;"

else
  echo ""
  echo "⏭   Step 3/3 — Skipping foods seed (add --seed-foods flag to include)."
fi

# ── Verification ───────────────────────────────────────────────────────────────
echo ""
echo "🔍  Verifying schema..."
psql "$DIRECT_URL" -c "
  SELECT table_name
  FROM information_schema.tables
  WHERE table_schema = 'public'
  ORDER BY table_name;
"

echo ""
echo "🔍  Verifying pgvector extensions..."
psql "$DIRECT_URL" -c "SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector','pg_trgm','pgcrypto');"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅  Production migration complete."
echo "    Next steps:"
echo "    1. Set Vercel env vars (DATABASE_URL=pooler, DIRECT_URL=direct)"
echo "    2. Deploy preview: vercel --yes"
echo "    3. Smoke test preview URL"
echo "    4. Promote to production: vercel --prod"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
