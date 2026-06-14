#!/usr/bin/env bash
# WP1 adversarial concurrency proof for the invite-claim RPCs (0042).
# Spins a THROWAWAY Postgres (never touches prod), applies the migration, and runs
# the 25-concurrent claim test. Free-tier Supabase has no branching, so this is the
# isolated substrate for the race proof. Exit 0 = all assertions pass.
set -euo pipefail
DOCKER=/usr/local/bin/docker
C=wp1-claim-test-pg
PORT=55433
cd "$(dirname "$0")/../.."

"$DOCKER" rm -f "$C" >/dev/null 2>&1 || true
"$DOCKER" run -d --name "$C" -e POSTGRES_PASSWORD=test -e POSTGRES_DB=wp1 -p ${PORT}:5432 postgres:17 >/dev/null
trap '"$DOCKER" rm -f "$C" >/dev/null 2>&1 || true' EXIT

echo "waiting for throwaway postgres…"
for i in $(seq 1 60); do
  "$DOCKER" exec "$C" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 1
done

export TEST_DATABASE_URL="postgres://postgres:test@localhost:${PORT}/wp1"
npx tsx scripts/test/wp1-invite-claim-concurrency.ts
