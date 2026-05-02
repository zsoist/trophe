# v0.3-overhaul Production Cutover Plan

> **Author**: Daniel R + Claude  
> **Created**: 2026-05-02  
> **Status**: DRAFT — do not execute until all open questions are resolved  
> **Branch**: `v0.3-overhaul` (commit 9ea02c9+)

---

## TL;DR

- **Target deploy date**: 2026-05-17 or 2026-05-24 (Saturday morning COT)
- **Hard deadline**: 2026-05-31 (Gemini 2.0 hard-shutdown June 1)
- **Total breaking changes**: 4 (auth model, schema, role coercion, middleware)
- **Estimated downtime**: 15–30 minutes (migration + deploy + smoke)
- **Rollback time if needed**: ~5 minutes (Vercel instant rollback + env var revert)
- **Affected testers**: 11 profiles, all will be logged out
- **Production data at risk**: 224 food logs, 121 water logs, 16 workout sessions, 113 API usage entries — all preserved by additive migrations

---

## Critical Findings from Planning Session

These were discovered during inventory and MUST be addressed before cutover:

| # | Finding | Severity | Action Required |
|---|---------|----------|-----------------|
| 1 | **`proxy.ts` is dead code** — exports `proxy` not `middleware`, file not named `middleware.ts`. Auth gate (codex HIGH #1 fix) is NOT active. | BLOCKER | Rename file + export before cutover |
| 2 | **Migration 0000 will fail** — `CREATE TABLE profiles` etc. against existing tables, no `IF NOT EXISTS` | BLOCKER | Skip 0000, seed Drizzle journal |
| 3 | **Migration 0002 `INSERT INTO auth.users`** — Supabase owns `auth` schema, direct INSERT will fail | BLOCKER | Use production-safe version (skip auth.users INSERT) |
| 4 | **pgvector + pg_trgm not installed** on production Supabase | BLOCKER | Enable via Dashboard before migration 0004 |
| 5 | **`DATABASE_URL` not in Vercel** — v0.3 Drizzle client falls back to localhost:54322 | BLOCKER | Add Supabase pooler URL to Vercel |
| 6 | **Gap #3 still open** — meal-suggest route has no session check, `guardAiRoute` is rate-limit only | P2 | Add `requireRole` or session check before/during cutover |
| 7 | **4 profiles have role `both`** — coerced to `coach` by migration 0001 | INFO | Verify Daniel's profile gets `super_admin` via 0002 |
| 8 | **No `foods` data on production** — 0 USDA/HHF rows, food_parse v4 will return 0 DB hits | P1 | Seed foods table after migrations |

---

## Pre-Flight Checklist (T-7 days)

Complete these a full week before the target deploy date.

- [ ] CI on v0.3-overhaul has been green for >=3 consecutive runs
- [ ] All BLOCKER findings above are resolved (code committed, tested)
- [ ] `proxy.ts` renamed to `middleware.ts`, export renamed to `middleware`
- [ ] Production-safe migration script created (`scripts/db/migrate-production.sh`)
- [ ] Migration 0002 production-safe version created (no `INSERT INTO auth.users`)
- [ ] Drizzle journal seeding script tested locally
- [ ] `DATABASE_URL` and `DIRECT_URL` values obtained from Supabase Dashboard
- [ ] Gap #3 session check added to meal-suggest route (or accepted as post-cutover debt)
- [ ] Foods seed strategy decided: pg_dump from Mac Mini or re-run ingest scripts
- [ ] Tester comms drafted (see Comms Plan section)
- [ ] Vercel preview deployment of v0.3-overhaul tested by >=1 person
- [ ] Production Supabase backup taken and verified restorable
- [ ] State audit doc re-run if >5 days old

---

## Day-of Pre-Flight Checklist (T-1 hour)

- [ ] Working tree clean on v0.3-overhaul (`git status --short` empty)
- [ ] Latest CI green (`gh run list --branch v0.3-overhaul --limit 1`)
- [ ] No stashes (`git stash list` empty)
- [ ] Production Supabase backup taken (SECOND backup, fresher)
- [ ] Vercel CLI authenticated (`vercel whoami`)
- [ ] `DIRECT_URL` and `DATABASE_URL` ready in clipboard/secure note
- [ ] Tester comms sent (T-24h or T-1h, see Comms Plan)
- [ ] Block 90 minutes of uninterrupted time
- [ ] Mac Mini running, Docker up, local DB accessible (for emergency reference)
- [ ] This document open and visible

---

## Migration Order

Each step includes what to do, how to verify, and how to roll back.
**Execute in exact order. Do not skip steps. Do not parallelize.**

### Step 0 — Backup production Supabase

```bash
# Via Supabase Dashboard: Project Settings > Database > Backups
# Or via CLI if available:
# supabase db dump --project-ref iwbpzwmidzvpiofnqexd > ~/backups/trophe-pre-v03-$(date +%Y%m%d).sql
```

**Verify**: Backup file exists and is non-empty (should be ~500KB–2MB).  
**Rollback**: N/A — this IS the rollback safety net.

### Step 1 — Enable required extensions

In Supabase Dashboard > Database > Extensions, enable:
- `vector` (pgvector)
- `pg_trgm`

Both should already have `pgcrypto` enabled (confirmed).

**Verify**:
```sql
SELECT extname FROM pg_extension WHERE extname IN ('vector', 'pg_trgm');
-- Must return both rows
```

**Rollback**: `DROP EXTENSION IF EXISTS vector; DROP EXTENSION IF EXISTS pg_trgm;`  
(Safe — no tables depend on them yet.)

### Step 2 — Seed the Drizzle journal (skip migration 0000)

Migration 0000 is the initial introspection snapshot — it would CREATE tables that already exist. Instead, mark it as already-applied by seeding the Drizzle migrations journal.

```bash
# Connect via DIRECT_URL (port 5432, NOT the pooler)
DIRECT_URL="postgresql://postgres.[ref]:[PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres"

psql "$DIRECT_URL" <<'SQL'
-- Create the Drizzle journal schema + table
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
  id serial PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

-- Mark 0000 as already applied (hash from drizzle/meta/_journal.json)
-- IMPORTANT: get the actual hash from the local journal file
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
SELECT hash, (EXTRACT(EPOCH FROM now()) * 1000)::bigint
FROM (VALUES ('REPLACE_WITH_0000_HASH')) AS t(hash)
WHERE NOT EXISTS (
  SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = 'REPLACE_WITH_0000_HASH'
);
SQL
```

**OPEN QUESTION**: Verify the exact hash format Drizzle Kit expects. Read `drizzle/meta/_journal.json` locally and extract the hash for entry 0.

**Verify**:
```sql
SELECT * FROM drizzle.__drizzle_migrations;
-- Must show 1 row with 0000's hash
```

**Rollback**: `DROP TABLE drizzle.__drizzle_migrations; DROP SCHEMA drizzle;`

### Step 3 — Create production-safe 0002

Migration 0002 has `INSERT INTO auth.users` which will fail on Supabase (auth schema is managed). Create a production-safe version:

```bash
# scripts/db/production-role-backfill.sql
# Copy 0002 but REMOVE the auth.users INSERT (lines 11-16).
# Keep: profiles upsert (lines 18-31) + RLS functions (lines 33-75).
```

**This must be a pre-built file, committed and tested before cutover day.**

### Step 4 — Apply migrations 0001, 0003–0006

```bash
# Use DIRECT_URL (direct connection, not pooler — DDL requires it)
DIRECT_URL="postgresql://..." npx drizzle-kit migrate
```

This will apply 0001 through 0006 in order, SKIPPING 0000 (already in journal).

**Migration 0001 effects on production data:**
- 4 profiles with role `both` → coerced to `coach`
- `user_role` enum created
- `profiles.role` column type changed from text to enum
- 3 new tables created: `organizations`, `organization_members`, `audit_log`

**Verify after 0001**:
```sql
SELECT role, count(*) FROM profiles GROUP BY role;
-- Expected: coach=5, client=6 (the 4 'both' became 'coach')
-- No 'both' remaining

SELECT typname FROM pg_type WHERE typname = 'user_role';
-- Must return 1 row
```

**Migration 0002 will fail** (auth.users INSERT). This is expected.

### Step 5 — Apply production-safe 0002 manually

```bash
psql "$DIRECT_URL" -f scripts/db/production-role-backfill.sql
```

**Verify**:
```sql
SELECT role FROM profiles WHERE email = 'd.reyesusma@gmail.com';
-- Must return 'super_admin'

SELECT routine_name FROM information_schema.routines 
WHERE routine_name IN ('is_super_admin', 'is_admin_of', 'is_coach_of');
-- Must return 3 rows
```

**If 0002 already partially applied** (functions exist but role not set):
The script is idempotent — safe to re-run.

**Rollback for Steps 4+5 combined**: Restore from Step 0 backup.

### Step 6 — Seed foods table

Production needs food data for the v4 food_parse pipeline. Without it, every food lookup returns 0 hits and falls back to AI estimates.

**Option A — pg_dump from Mac Mini (recommended, ~2 min):**
```bash
# On Mac Mini:
PGPASSWORD=<trophe_user_pass> pg_dump -h 127.0.0.1 -p 5433 -U trophe_user -d trophe_dev \
  --table=foods --table=food_aliases --table=food_unit_conversions \
  --data-only --format=plain > /tmp/foods-seed.sql

# Review the dump (sanity check row counts):
grep -c 'INSERT\|COPY' /tmp/foods-seed.sql

# Restore to production:
psql "$DIRECT_URL" < /tmp/foods-seed.sql
```

**Option B — Re-run ingest scripts against production (~10 min):**
```bash
DIRECT_URL="..." USDA_API_KEY="..." npx tsx scripts/ingest/usda.ts
DIRECT_URL="..." npx tsx scripts/ingest/hhf-dishes.ts
DIRECT_URL="..." VOYAGE_API_KEY="..." npx tsx scripts/ingest/embed-foods.ts
```

**Verify**:
```sql
SELECT count(*) FROM foods;                  -- Expected: ~7918 (USDA) + 30 (HHF)
SELECT count(*) FROM food_unit_conversions;  -- Expected: ~200+
SELECT count(*) FROM foods WHERE embedding IS NOT NULL;  -- Should match foods count
```

**Rollback**: `TRUNCATE foods, food_aliases, food_unit_conversions CASCADE;`

### Step 7 — Add new Vercel env vars

In Vercel Dashboard > Project > Settings > Environment Variables (Production scope):

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | Supabase Transaction pooler URL (port **6543**) | **CRITICAL** — runtime queries |
| `DIRECT_URL` | Supabase direct connection URL (port **5432**) | For CI migration job only |

**Where to find these**:  
Supabase Dashboard > Project Settings > Database > Connection string  
- "Transaction" = pooler (6543) → `DATABASE_URL`  
- "Direct" = direct (5432) → `DIRECT_URL`

**Do NOT remove existing env vars** — keep all current ones. This is additive.

**Verify**: `vercel env ls production` shows both new vars.

**Rollback**: `vercel env rm DATABASE_URL production && vercel env rm DIRECT_URL production`

### Step 8 — Deploy Vercel from v0.3-overhaul

```bash
# FIRST: Merge v0.3-overhaul into main (or deploy from branch)
# Option A (merge to main):
git checkout main
git merge v0.3-overhaul --no-ff
git push origin main
# Vercel auto-deploys from main

# Option B (deploy from branch directly):
vercel --prod
```

**OPEN QUESTION**: Decide merge vs branch deploy. Merge is cleaner long-term. Branch deploy is safer short-term (main stays as rollback target).

**Verify build succeeds**: Watch Vercel deployment logs. Build should complete in ~2 minutes.

**Rollback**: `vercel rollback` (reverts to previous deployment instantly).

### Step 9 — Smoke test production

Run these immediately after deploy completes:

```bash
# 1. Homepage loads
curl -sI https://trophe-mu.vercel.app/ | grep "HTTP/"
# Expected: HTTP/2 200

# 2. Dashboard redirects to login (auth gate working)
curl -sI -o /dev/null -w "%{http_code} %{redirect_url}" https://trophe-mu.vercel.app/dashboard
# Expected: 307 .../login?redirectTo=%2Fdashboard

# 3. Login page renders
curl -sI https://trophe-mu.vercel.app/login | grep "HTTP/"
# Expected: HTTP/2 200

# 4. Meal suggest returns real suggestions (not fallbacks)
curl -sS -X POST https://trophe-mu.vercel.app/api/ai/meal-suggest \
  -H 'content-type: application/json' \
  -d '{"remaining_calories":600,"remaining_protein_g":40,"remaining_carbs_g":50,"remaining_fat_g":20}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['suggestions'][0]['name'])"
# Expected: NOT "Grilled Chicken with Rice & Vegetables" (that's a fallback)

# 5. CSP header has no unsafe-eval
curl -sI https://trophe-mu.vercel.app/ | grep content-security-policy | grep -o 'unsafe-eval' || echo "OK: no unsafe-eval"

# 6. Food parse works (requires auth in v0.3 — may need token)
# This test requires a valid session cookie — test via browser after login
```

**If smoke test 2 fails** (dashboard doesn't redirect): The middleware rename wasn't applied. **STOP and rollback immediately.**

**If smoke test 4 returns fallbacks**: Anthropic API key issue or route error. Check Vercel runtime logs.

### Step 10 — Tester verification

Have one tester (preferably Daniel):
1. Open https://trophe-mu.vercel.app/login
2. Log in with existing credentials (magic link or OAuth)
3. Navigate to /dashboard — verify data loads
4. Log a meal: "200g feta cheese"
5. Verify calories are ~530 (USDA-accurate, not LLM-invented)

### Step 11 — Verify cost tracking

```sql
-- In Supabase SQL Editor or via psql:
SELECT task_name, model, cost_usd, tokens_in, tokens_out, created_at 
FROM agent_runs 
ORDER BY created_at DESC 
LIMIT 5;
-- Should show rows from the food_parse and/or meal_suggest calls in Step 10
```

### Step 12 — Monitor for 30 minutes

- **Vercel runtime logs**: Watch for 5xx errors, unhandled rejections
- **Supabase Dashboard**: Query rate, active connections, error count
- **agent_runs**: Rows appearing for new calls
- Check specifically:
  - No "relation does not exist" errors (would mean missing migration)
  - No "ANTHROPIC_API_KEY not configured" (would mean env var missing)
  - No infinite redirect loops on /dashboard

### Step 13 — Cleanup (only after monitoring window passes)

```bash
# Remove deprecated env vars from Vercel (if any):
# vercel env rm TROPHE_ADMIN_EMAILS production  # (if it was ever set)

# Update audit doc
# Update TODO-NEXT.md
# Commit: "docs: v0.3-overhaul cutover complete"
```

---

## Rollback Procedure

**Decision tree**: If any smoke test fails AND you can't diagnose within 10 minutes → rollback.

### Quick rollback (< 2 minutes)

```bash
# 1. Revert Vercel to previous deployment
vercel rollback

# 2. Remove new env vars (so old code doesn't try to use them)
vercel env rm DATABASE_URL production
vercel env rm DIRECT_URL production
```

The old `main` branch code doesn't use `DATABASE_URL` (it uses Supabase JS client directly), so removing these vars is safe.

### Full rollback (includes schema)

If migrations were applied and you need to fully revert:

```bash
# 1. Quick rollback (above)
# 2. Restore DB from Step 0 backup
# This undoes: enum changes, new tables, role coercion, foods data
```

**WARNING**: Full rollback loses any data written to new tables during the monitoring window (agent_runs, organizations, etc.). Since these tables are new and have no user-facing data yet, this is acceptable.

### Rollback does NOT affect

- Existing user data (food_log, water_log, profiles, etc.) — migrations are additive
- Auth sessions — users were already logged out by the cutover; rolling back just means they stay logged out until they log in again (to the old client-side auth)
- Supabase extensions (vector, pg_trgm) — harmless to leave enabled

---

## Comms Plan

### Testers to notify

All 11 profiles in production. Key contacts:
- Daniel (self) — d.reyesusma@gmail.com
- Nikos, Kavdas, Michael, Daniela, Alex (active testers)

### T-7 days: Draft message

> Hi [name], we're shipping a major Trophe update on Saturday May [17/24].
> 
> After the update, you'll need to log in again — your existing session
> will be cleared. Same URL (trophe-mu.vercel.app), same credentials.
> 
> What's new: more accurate food tracking, better meal suggestions,
> and improved security. If anything looks wrong after the update,
> message me immediately.

### T-24 hours: Send message

Send via the channel each tester uses (WhatsApp/Telegram/email).

### T+0 (deploy complete): Confirmation

> Update is live! Please log in again at trophe-mu.vercel.app.
> Let me know if you run into any issues.

### If rollback needed:

> We rolled back the update due to a technical issue. No action needed
> on your end — the app is working as before. We'll try again next
> weekend.

---

## Monitoring (T+0 to T+24 hours)

### First 30 minutes (active monitoring)

| Check | How | Expected |
|-------|-----|----------|
| Error rate | Vercel Dashboard > Deployments > Runtime logs | 0 errors |
| Auth gate | `curl -sI .../dashboard` | 307 redirect |
| Meal suggest | POST to /api/ai/meal-suggest | Real suggestions, not fallbacks |
| Cost tracking | `SELECT count(*) FROM agent_runs` | Rows appearing |
| Food parse accuracy | Log "200g feta" | ~530 kcal |
| 401 rate | Vercel logs grep "401" | Near zero (only expected from expired tokens) |

### Hours 1–24 (passive monitoring)

- Check Vercel error logs at T+2h, T+6h, T+24h
- Check Supabase Dashboard DB size (should be well under 500MB free limit)
- Check tester messages for bug reports
- Verify Langfuse traces are appearing (if Cloudflare tunnel is set up)

### Specific failure modes to watch for

1. **"relation does not exist"** — Migration didn't apply fully. Check `drizzle.__drizzle_migrations` for gaps.
2. **Infinite redirect loop on /dashboard** — Middleware cookie issue. Check `proxy.ts` → `middleware.ts` rename was applied.
3. **All meal suggestions are fallbacks** — `ANTHROPIC_API_KEY` not set or Haiku rate-limited.
4. **Food parse returns 0 calories** — Foods table empty. Run seed (Step 6).
5. **`agent_runs` writes silently failing** — `DATABASE_URL` not set or pointing to wrong DB. Check Vercel env.

---

## Open Questions

Resolve these before T-7 days. Each is a research or code item.

| # | Question | How to resolve | Status |
|---|----------|----------------|--------|
| 1 | What is the exact hash format for seeding `__drizzle_migrations`? | Read `drizzle/meta/_journal.json` locally, test with a preview DB | OPEN |
| 2 | Does `drizzle-kit migrate` skip 0002 gracefully when it fails, or does it halt the entire batch? | Test locally: make 0002 fail intentionally, see if 0003–0006 still apply | OPEN |
| 3 | Merge to main vs branch deploy? | Decision: merge is cleaner, branch deploy allows main as rollback | OPEN |
| 4 | Does the `profiles.role` ALTER in 0001 require a table lock? | Test: run 0001 against a copy of production data, measure lock duration | OPEN |
| 5 | Supabase connection strings: do we use the Session pooler or Transaction pooler? | `db/client.ts` uses `pg.Pool` (node-postgres) — Transaction mode is safe. Confirm `prepare: false` is not needed for pg Pool. | OPEN |
| 6 | Foods seed: pg_dump Option A or re-run ingest Option B? | Option A is faster (2 min vs 10 min) but requires Mac Mini accessible during cutover. Decision needed. | OPEN |
| 7 | Should gap #3 (session check on meal-suggest) be fixed before or after cutover? | Before is safer (prevents cost-abuse from day one). 10-minute fix. | OPEN |
| 8 | What's the actual Vercel deployment ID for the current production deploy? | `vercel ls --prod` — needed for rollback command | OPEN |
| 9 | Does the `proxy.ts` → `middleware.ts` rename require any other changes? | Check: `next.config.ts` for middleware config, `tsconfig.json` paths | OPEN |
| 10 | Is Daniel's auth.users row already on production Supabase? | `SELECT id, email FROM auth.users WHERE email = 'd.reyesusma@gmail.com'` — needed for 0002 profiles upsert to find the FK | OPEN |

---

## Risk Register

| # | Risk | Severity | Likelihood | Mitigation |
|---|------|----------|------------|------------|
| 1 | Migration fails partway through, leaves DB in inconsistent state | HIGH | LOW | Step 0 backup. Test full migration sequence against a Supabase branch/preview first. |
| 2 | `DATABASE_URL` not set or wrong format → every Drizzle query fails | HIGH | LOW | Smoke test (Step 9) catches immediately. Quick rollback available. |
| 3 | Testers can't log in after cutover (cookie domain mismatch, etc.) | MEDIUM | MEDIUM | Comms include "if login fails, try clearing cookies and using this magic link: ___". Test login flow in preview deploy first. |
| 4 | `agent_runs` writes silently fail in production | LOW | MEDIUM | Monitor in first 30 minutes. Fire-and-forget pattern means user-facing features still work. Fix post-cutover. |
| 5 | Food parse accuracy drops because foods table is empty or missing embeddings | HIGH | LOW | Step 6 seeds data. Step 10 tester verification catches this. |
| 6 | Gemini 2.0 shutdown happens before cutover (before June 1) | MEDIUM | LOW | Meal suggest already migrated to Haiku 4.5 on v0.3. Only affects production main if cutover is delayed past June 1. |
| 7 | Supabase free tier DB size exceeded by foods data + embeddings | MEDIUM | LOW | 7,918 foods × ~4KB vectors = ~32MB. Current DB ~2MB. Total ~34MB, well under 500MB limit. |
| 8 | Role coercion (`both` → `coach`) breaks a tester's workflow | LOW | LOW | Only 4 profiles affected. Daniel gets `super_admin` via 0002. Others become `coach` which is their actual role. |

---

## Appendix: Production Supabase State (as of 2026-05-02)

### Tables (20 existing)

| Table | Rows | RLS |
|-------|------|-----|
| profiles | 11 | yes |
| food_log | 224 | yes |
| water_log | 121 | yes |
| api_usage_log | 113 | yes |
| custom_foods | 40 | yes |
| exercises | 115 | yes |
| food_database | 136 | yes |
| workout_sessions | 16 | yes |
| workout_sets | 48 | yes |
| habits | 10 | yes |
| habit_checkins | 10 | yes |
| client_profiles | 10 | yes |
| client_habits | 9 | yes |
| measurements | 3 | yes |
| coach_notes | 2 | yes |
| form_analyses | 0 | yes |
| workout_templates | 0 | yes |
| client_supplements | 0 | yes |
| supplement_protocols | 0 | yes |
| supplement_log | 0 | yes |

### Role distribution

| Role | Count |
|------|-------|
| both | 4 (→ coerced to coach by 0001) |
| client | 6 |
| coach | 1 |

### Extensions installed

- pgcrypto 1.3

### Extensions needed (not installed)

- vector (pgvector) — required by migration 0004
- pg_trgm — required by migration 0004

### Drizzle journal

Not present. Must be seeded before `drizzle-kit migrate`.
