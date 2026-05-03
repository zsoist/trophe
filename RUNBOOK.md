# Runbook

Operational playbooks for Trophē. Designed for one-person on-call (Daniel), during 10-20 user testing phase. Each scenario: detect → diagnose → fix → verify.

## Dashboards + logs

- **Vercel**: https://vercel.com/2p6y54z6w9-4465s-projects/trophe — deployments, function logs, analytics
- **Supabase**: https://supabase.com/dashboard/project/iwbpzwmidzvpiofnqexd — DB, auth, logs
- **GitHub Actions**: https://github.com/zsoist/trophe/actions — CI runs
- **Production**: https://trophe.app
- **AI cost/observability**: `agent_runs` is canonical; `api_usage_log` is legacy compatibility only
- **Local DB doctor**: `npm run db:doctor` verifies OrbStack, Docker, Supabase CLI, and local stack status

## Canonical local DB

- Runtime: OrbStack Docker
- Stack manager: Supabase CLI
- DB URL: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Bootstrap: `npm run db:bootstrap`
- Verification artifacts: `artifacts/db/*`

Legacy `open_brain_postgres` on `127.0.0.1:5433` is a temporary bridge only.

## Common scenarios

### 1. Site is down (500 / 502 / timeout)

**Detect**: user report, or `curl -sI https://trophe.app` → non-200.

**Diagnose**:
```bash
# Check Vercel deployment status
vercel ls --prod | head -3

# Fetch function logs for the last hour
vercel logs trophe.app --since 1h

# Is Supabase up?
curl -sI https://iwbpzwmidzvpiofnqexd.supabase.co/rest/v1/ | head -1
```

**Fix**:
- If last deploy is the problem → Vercel dashboard → Deployments → previous deployment → **Promote to Production**
- If Supabase is down → check https://status.supabase.com ; wait or failover read-only page (not built yet)
- If env var missing → Vercel → Settings → Environment Variables → add/fix → redeploy

**Verify**: `npm run canary:prod`; then load `/dashboard` in browser.

### 2. Auth broken / users can't log in

**Detect**: user reports "login doesn't work" or "kicked back to login".

**Diagnose**:
```bash
# Any recent auth-related errors?
vercel logs --since 1h | grep -iE "auth|supabase"

# Supabase Auth service status
curl -s https://iwbpzwmidzvpiofnqexd.supabase.co/auth/v1/settings | head -20
```

Common causes:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` rotated in Supabase but not updated in Vercel env
- CSP blocking `https://iwbpzwmidzvpiofnqexd.supabase.co` — check `next.config.ts` (pitfall: wildcard breaks mobile)
- Client-side role guard redirect loop — check `profile.role` value on the affected user

**Fix**:
- Verify both Supabase keys in Vercel match current values in Supabase dashboard → API settings
- Check CSP in `next.config.ts` uses explicit project domain
- If single user: query `profiles` table → confirm `role` matches expected value
- If all users: rotate anon key + redeploy

**Verify**: log in as test account (`daniel@reyes.com` / `trophe2026!`); should land on `/coach`.

### 3. LLM route returning 429 / 502 / timeout

**Detect**: user reports "food parse broken", or `agent_runs` shows recent non-200 `raw_status` rows.

**Diagnose**:
```bash
# Recent API usage log from Supabase SQL editor
SELECT task_name, provider, model, raw_status, error_message, cost_usd, latency_ms, created_at
FROM agent_runs
WHERE created_at > now() - interval '1 hour'
ORDER BY created_at DESC
LIMIT 50;
```

Common causes:
- **Anthropic rate limit (429)**: surge of requests exceeded 50 RPM for Haiku 4.5 (default)
- **Anthropic API key expired/rotated (401)**: check `error_message`
- **Prompt cache miss causing latency spike**: expected behavior after 5-min idle; not an error
- **Timeout from Next.js function**: Vercel free-tier hobby = 10s; Pro = 60s

**Fix**:
- 429: rate-limit clients more aggressively via `lib/api-guard.ts` (drop from 20 to 10 req/min); contact Anthropic if persistent
- 401: rotate key in Anthropic console → update Vercel env → redeploy
- Timeout: inspect the specific call's token count; if prompt grew too large, trim the food reference in `lib/food-units.ts`

**Verify**: manual curl against `/api/food/parse` with a trivial input; confirm 200 + parsed items.

### 4. Data loss — accidental DELETE or bad UPDATE

**Detect**: user reports missing food log entries; `coach_notes` disappeared; `client_profiles` reset.

**With Supabase Pro + PITR** (scheduled Sunday):
```bash
# Via Supabase dashboard → Settings → Database → Point-in-time Recovery
# 1. Select timestamp just before the incident (granularity: 1 second)
# 2. Restore to a new database branch (non-destructive)
# 3. Compare rows between branches
# 4. Copy affected rows back to main
```

**Without Pro** (pre-upgrade state):
- No automated backup on Free tier
- Recovery = manual replay from Vercel function logs if the write came through an API route
- Prevention: take a `supabase db dump -f backup.sql` before any bulk migration

**Verify**: query the restored rows; confirm user can see them in the app.

### 5. Deploy failed / stuck

**Detect**: GitHub Actions red, or `vercel ls --prod` shows last deploy `ERROR` or `BUILDING` for >10 min.

**Diagnose**:
```bash
# Recent CI runs
gh run list --branch main --limit 5

# View the failure
gh run view --log-failed
```

Common causes:
- Typecheck fails on a recent commit (should have been caught locally — why wasn't it?)
- Lint introduces a new error via our ESLint rule on a newly added file
- Vercel build OOM (rare, Next 16 ~2GB budget)

**Fix**:
- Typecheck: reproduce locally with `npm run typecheck`, fix, commit
- Lint: `npm run lint` shows the offender; either fix or add a `// eslint-disable-next-line` with justification
- OOM: simplify the offending component or split into smaller files

**Verify**: `gh run list --limit 1` → green; `vercel ls --prod | head -3` → `Ready`.

### 6. Someone logged something sensitive (password, API key, PII in a commit)

**Action immediately**:
1. **Rotate the exposed secret** at its source (Anthropic/Supabase/etc.) — git history scrub is secondary
2. Update Vercel env with new key → redeploy
3. If PII: notify affected user(s); capture incident in `docs/incidents/YYYY-MM-DD.md`
4. Rewrite history only if essential (forces collaborators to rebase): `git filter-repo --path <file> --invert-paths`
5. `git push --force` (ONLY with explicit agreement, ONLY to a private repo)

### 7. Michael or tester reports a bug

1. Reproduce locally with their account credentials (if shareable) or against a test account
2. Check `agent_runs` for LLM-related bugs
3. Check browser console (ask them to screenshot) — for client-side errors
4. File on the tracker (today: ROADMAP.md "known issues" section); fix + deploy; notify them when shipped

### 8. Prompt quality regression (new food-parse output is worse)

**Detect**: Promptfoo evals fail in CI (once wired in Wave B), OR user reports worse accuracy

**Diagnose**:
```bash
# Diff the prompt against last known-good version
git log --oneline agents/prompts/food-parse.v3.md
git diff <last-good-commit> agents/prompts/food-parse.v3.md
```

**Fix**:
- Bump version: copy `food-parse.v3.md` → `food-parse.v4.md`, revert the regression
- Update the import in `agents/food-parse/index.ts`
- Ship the fix; keep v3 file for audit trail

**Verify**: run Promptfoo locally against the golden set; scores recovered.

## Weekly operational tasks

- [ ] Review `agent_runs` cost sum — confirm < $2/week/coach
- [ ] Spot-check Vercel function error rate (should be <1% of requests)
- [ ] Check Supabase storage usage (Free tier = 500MB)
- [ ] Run `npm audit` — triage new high/critical advisories
- [ ] Review Michael/tester feedback queue; add to ROADMAP

## Monthly operational tasks

- [ ] Rotate Anthropic + Supabase keys (recommended every 90 days)
- [ ] Archive legacy `api_usage_log` only if compatibility retention requires it
- [ ] `npm outdated` — review dependency updates; bump patch/minor freely, plan major
- [ ] Re-run `/cso` comprehensive security audit
