# Deployment

Production hosts on **Vercel**. Database + auth + storage on **Supabase** (project `iwbpzwmidzvpiofnqexd`). Domain `trophe-mu.vercel.app`.

## Environment variables

All set in **Vercel → Project Settings → Environment Variables** (Production scope). See `.env.local.example` for local development.

| Variable | Required | Where | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | prod + local | Supabase project URL (`https://iwbpzwmidzvpiofnqexd.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | prod + local | Client-side Supabase key (RLS-bound, safe to ship) |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | prod + local | Server-only; used by `/api/auth/signup` + `/admin/*` guard. **NEVER** prefix with `NEXT_PUBLIC_`. |
| `ANTHROPIC_API_KEY` | yes | prod + local | Haiku 4.5 for food-parse, recipe-analyze, photo |
| `GEMINI_API_KEY` | yes | prod + local | Gemini 2.0 Flash for meal suggestions |
| `USDA_API_KEY` | optional | prod + local | Food search. Falls back to `DEMO_KEY` (30 req/hr) |
| `TROPHE_ADMIN_EMAILS` | optional | prod | Comma-separated allowlist for `/admin/*`. Default: `daniel@reyes.com` |

Local dev: copy `.env.local.example` → `.env.local`, fill in. Never commit `.env.local`.

## Deploy workflow

```bash
# Local preview first (unlimited, free)
npm run dev
# Browser: http://localhost:3000

# Full verification before production
npm run typecheck   # 0 errors
npm run lint        # 0 errors (warnings OK)
npm test            # green
npm run build       # clean production build

# Ship to production
git push origin main
vercel --yes --prod
```

**Deploy budget**: max 3 production deploys per session. Prefer local preview for iteration.

Vercel auto-builds on push to `main` (preview deployments for feature branches). Explicit `vercel --yes --prod` produces a new production deployment and promotes it to `trophe-mu.vercel.app`.

## CI (GitHub Actions)

`.github/workflows/ci.yml` runs on every PR and push to `main`:
1. Install dependencies (Node 20, `npm ci`)
2. Typecheck (`tsc --noEmit`)
3. Lint (`eslint`)
4. Unit tests (`vitest run`)

10-minute timeout. Concurrency group cancels in-progress runs when a new commit arrives on the same ref.

Scheduled additions (v0.2):
- Promptfoo evals on any `agents/prompts/**` change
- Playwright E2E against Vercel preview deploy
- `supabase db diff` dry-run

## Database migrations

**Today (pre-v0.2)**: migrations applied manually via Supabase SQL editor. No runner, no history.

**Scheduled Sunday**: move to `supabase/migrations/*.sql` applied via `supabase db push` in CI. Requires Supabase CLI locally (`supabase start` for local dev DB).

## Rollback

### Application code
```bash
# Revert last commit locally
git revert HEAD
git push origin main
# Or: roll back via Vercel dashboard → Deployments → older deploy → "Promote to Production"
```

Vercel preserves all prior deployments indefinitely. Rolling back = selecting an older deployment and clicking promote. Takes ~30 seconds to propagate.

### Database
**Today**: no automated backup on Supabase Free tier. Recovery = manual replay from `CHANGELOG.md` + last known-good SQL snapshot.

**After Supabase Pro upgrade ($25/mo, scheduled Sunday)**: daily automated backups + 7-day PITR (point-in-time recovery). Any accidental DELETE/UPDATE can be restored to the exact second. See `RUNBOOK.md → Data loss` for the procedure.

## Supabase CLI (local development)

```bash
brew install supabase/tap/supabase
supabase login
supabase link --project-ref iwbpzwmidzvpiofnqexd

# Pull current schema
supabase db dump -f schema.sql

# Run local instance for integration tests
supabase start
supabase db reset    # apply migrations + seed
```

## Pre-deploy checklist

- [ ] `npm run typecheck` green
- [ ] `npm run lint` zero errors
- [ ] `npm test` all passing
- [ ] Local preview at `http://localhost:3000` exercised on key flows
- [ ] Mobile viewport 390×844 verified on changed screens
- [ ] No `.env` secrets in diff (`git diff --staged | grep -E 'sk-|key='`)
- [ ] CHANGELOG updated if user-visible
- [ ] Commit message explains the "why"

## Post-deploy verification

1. Curl the homepage: `curl -sI https://trophe-mu.vercel.app | head -1` → `HTTP/2 200`
2. Load an auth-gated page in browser: `/dashboard` should redirect to `/login` if not logged in, render if logged in
3. Smoke test one API route (logged in): `POST /api/food/parse` with a trivial input
4. Check Vercel dashboard → deployment → Function logs for 5xx errors

## Known deploy gotchas

- **CSP wildcard breaks Supabase on mobile**: use the explicit project domain (`https://iwbpzwmidzvpiofnqexd.supabase.co`) in `next.config.ts`, NOT `*.supabase.co`. Mobile browsers don't normalize the wildcard.
- **Service role key must not be `NEXT_PUBLIC_`**: prefixed env vars are inlined at build time into the client bundle. Service role = full DB access.
- **Vercel preview deploys use Production env vars by default** unless you scope to "Preview". If a preview is calling prod services, scope env vars deliberately.
- **Next.js 16 breaking changes**: see `AGENTS.md` for AI agent guidance about reading node_modules docs before writing code.
