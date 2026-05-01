# Deployment

Production on **Vercel** + **Supabase** (project `iwbpzwmidzvpiofnqexd`). Local dev uses `open_brain_postgres` Docker. Branch `v0.3-overhaul` is the active development branch; `main` is production.

_Last updated: 2026-05-01 (v0.3-overhaul)_

---

## Environment variables

Set in **Vercel → Project Settings → Environment Variables** (Production scope). Local: copy `.env.local.example` → `.env.local`.

| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Prod + local | `https://iwbpzwmidzvpiofnqexd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Prod + local | Client-side key (RLS-bound, safe) |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod only | Server-only full-DB access. **NEVER `NEXT_PUBLIC_`** |
| `DATABASE_URL` | Local only | `postgresql://brain_user:...@127.0.0.1:5433/trophe_dev` |
| `ANTHROPIC_API_KEY` | Prod + local | Haiku 4.5 + Sonnet 4.6 |
| `GEMINI_API_KEY` | Prod + local | Gemini 2.5 Flash |
| `VOYAGE_API_KEY` | Prod + local | Voyage v4 embeddings |
| `LANGFUSE_PUBLIC_KEY` | Local | Langfuse tracing (dev only) |
| `LANGFUSE_SECRET_KEY` | Local | Langfuse tracing (dev only) |
| `LANGFUSE_HOST` | Local | `http://127.0.0.1:3002` |
| `USDA_API_KEY` | Optional | Food search. Falls back to `DEMO_KEY` (30 req/hr). |
| `SPIKE_API_KEY` | Phase 6 | Spike wearable API |
| `SPIKE_WEBHOOK_SECRET` | Phase 6 | HMAC webhook verification |
| `TROPHE_ADMIN_EMAILS` | Legacy | Replaced by role enum in Phase 1. Keep for compat. |

---

## Local dev setup

```bash
# 1. Install dependencies
npm install

# 2. Local env
cp .env.local.example .env.local
# Fill in keys from ~/.local/secrets/{anthropic,providers,voyage}.env + Supabase dashboard

# 3. Local DB (open_brain_postgres Docker must be running)
npm run db:bootstrap    # createdb + apply migrations + seed
# or manually:
psql -h 127.0.0.1 -p 5433 -U brain_user -c "CREATE DATABASE trophe_dev"
npm run db:migrate

# Note: use 127.0.0.1 NOT localhost — macOS resolves localhost to ::1 first

# 4. Start dev server
npm run dev             # http://localhost:3000

# 5. Optional: Drizzle Studio
npm run db:studio       # http://localhost:4983
```

---

## Deploy workflow

```bash
# Always: local verification first
npm run typecheck       # 0 errors required
npm run lint            # 0 errors required
npm test                # all Vitest suites green
npm run build           # clean production build

# Push to preview (auto-deploys via Vercel)
git push origin v0.3-overhaul

# Production deploy (max 3 per session)
git push origin v0.3-overhaul
vercel --yes --prod
```

**Critical**: always `vercel --yes --prod`. Env vars are Production-scope only in Vercel; preview deploys fail without `--prod`.

**Deploy budget**: max 3 production deploys per session. Local preview + preview branch catch most issues.

**Git identity** (required for Vercel to accept commits):
```bash
git config user.name "zsoist"
git config user.email "zsoist@users.noreply.github.com"
```

---

## Drizzle migrations (v0.3)

```bash
# After changing db/schema/*.ts files:
npm run db:generate     # generates new SQL migration in drizzle/
npm run db:migrate      # applies pending migrations to local DB

# For production (Phase 9 cutover only):
npm run db:migrate      # against DATABASE_URL pointing at Vultr/Supabase
```

Migration files live in `drizzle/`. Current migrations:
- `0000_complex_johnny_blaze.sql` — initial schema
- `0001_tearful_machine_man.sql` — organizations + roles
- `0002_role_backfill.sql` — seeds Daniel as super_admin
- `0003…0006` — subsequent schema additions

**Note**: `supabase-schema.sql` and `supabase-workout-schema.sql` in the repo root are **DEPRECATED** — kept as reference only. Drizzle migrations are the source of truth for v0.3+.

---

## CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR and push:

1. `npm ci` (Node 20)
2. `tsc --noEmit` — typecheck
3. `eslint` — lint
4. `vitest run` — unit + integration tests
5. Includes: RLS test suite (100% gate), role-gate suite (100% gate), food-parse accuracy (≥95% gate)

10-minute timeout. Concurrency group cancels in-progress runs on same ref.

---

## Rollback

### Application code
```bash
# Option A: Vercel dashboard (fastest, ~30s)
# Deployments → older deploy → "Promote to Production"

# Option B: git revert
git revert HEAD
git push origin v0.3-overhaul
vercel --yes --prod
```

### Database
**v0.3 (Drizzle)**: rollback to a prior migration:
```bash
# Drizzle doesn't have built-in down-migration yet.
# Manual: restore from Supabase Pro backup (PITR) or re-apply SQL.
```

**Production Supabase free tier**: no automated backups. Recovery = manual replay.
**Supabase Pro** ($25/mo): 7-day PITR. Operator decision: upgrade when >10 paying coaches.

---

## Pre-deploy checklist

- [ ] `npm run typecheck` — 0 errors
- [ ] `npm run lint` — 0 errors
- [ ] `npm test` — all passing
- [ ] `npm run build` — clean build
- [ ] Local preview at `http://localhost:3000` tested on changed flows
- [ ] Mobile viewport 390×844 verified on changed screens
- [ ] No secrets in diff: `git diff --staged | grep -E '(sk-ant-|sbp_|AIza|pa-)'`
- [ ] CHANGELOG.md updated if user-visible change
- [ ] No new `bg-stone-9xx` on themed surfaces (ESLint catches most)

---

## Post-deploy verification

```bash
# 1. Homepage returns 200
curl -sI https://trophe-mu.vercel.app | head -1   # HTTP/2 200

# 2. Security headers present
curl -sI https://trophe-mu.vercel.app | grep -E "(X-Frame|Content-Security)"

# 3. Auth redirect works
# Load /dashboard without session → should redirect to /login

# 4. API smoke test (authenticated)
# POST /api/food/parse {"input":"100g chicken"} → structured food items

# 5. Vercel function logs
# Vercel dashboard → deployment → Function logs → watch for 5xx
```

---

## Known deploy gotchas

| Gotcha | Fix |
|--------|-----|
| Preview builds fail | Env vars are Production-only. Use `--prod` or scope vars to Preview branch. |
| CSP wildcard breaks Supabase on mobile | Use explicit `https://iwbpzwmidzvpiofnqexd.supabase.co` in `next.config.ts`, NOT `*.supabase.co` |
| `NEXT_PUBLIC_` service role key | Prefixed vars are inlined into client bundle at build time. Service role = full DB access. Never prefix it. |
| `localhost` vs `127.0.0.1` for local DB | macOS resolves `localhost` to `::1`; Docker only binds IPv4. Use `127.0.0.1` in `DATABASE_URL`. |
| Vercel preserves all deployments | Rollback = promote older deployment. Don't `git revert` + redeploy when promote is faster. |

---

## Phase 9 production cutover (when triggered)

Currently deferred. Trigger condition: >500 active users OR >5GB Postgres footprint OR need 99.9% SLA.

```bash
# When operator approves:
# 1. Provision Vultr HF VPS ($12/mo) with pgvector
# 2. pg_dump trophe_dev → restore on Vultr trophe_prod
# 3. Update Vercel DATABASE_URL → Vultr connection string
# 4. npm run db:migrate against trophe_prod
# 5. Dual-write window (both DBs active, 24hr verification)
# 6. DNS cut (TTL ≤300s during window)
# 7. Rollback: toggle DATABASE_URL back to Supabase
```
