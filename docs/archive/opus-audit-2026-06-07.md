# Trophē Opus Deep Audit — 2026-06-07

> Independent adversarial review of Codex session output by Claude Opus.
> Scope: all 66 files changed on `codex/trophe-100-execution` (4 commits, +18,389 / -560 lines).
> Three parallel audit agents ran: Security/RLS, AI Runtime, Production/Vercel.

## Composite Score: 8.0 / 10

| Dimension              | Score | Weight | Notes                                              |
|------------------------|-------|--------|----------------------------------------------------|
| Security & RLS         | 9/10  | 25%    | Full row-level isolation, open redirect blocked     |
| AI Runtime Architecture| 8/10  | 20%    | Clean governed layer, cost tracking gap             |
| Production Stability   | 8/10  | 20%    | Live, functional, all endpoints responding          |
| Test Coverage          | 7/10  | 15%    | 218 pass, but new runtime has only 4 tests          |
| Deployment Hygiene     | 7/10  | 10%    | 4 preview deploys failing, branch not merged        |
| Documentation          | 8/10  | 10%    | Plans + review doc created, some gaps               |

---

## What Codex Did Well

- **RLS hardened on all 34 public tables** with proper `USING` / `WITH CHECK` on every policy
- **`(SELECT auth.uid())`** pattern avoids per-row re-evaluation — performance-aware
- **Cross-user food-log access fixed** — `assertCanAccessClient` gates reads, `ctx.user!.id` hardcoded on writes
- **Open redirect blocked** via `safeRedirectPath` (covers `//`, `\`, non-`/` prefixes)
- **Spike OAuth state** signed with HMAC-SHA256, 10-min TTL, constant-time comparison
- **Signup rollback cleanup** — deletes auth user if profile creation fails
- **Governed AI runtime** (`executeAiTask`) composes budget, tracing, persistence, timeout
- **All API keys from `process.env`**, prompts redacted in Langfuse traces
- **Next.js upgraded** 16.2.4 → 16.2.7
- **Exposed credentials removed** from CLAUDE.md, RUNBOOK.md, seed scripts
- **212+ tests passing**, including food-parse accuracy gate

---

## Critical Fixes Required (P0)

### 1. `cacheWriteTokens` missing from cost estimation
**File:** `agents/runtime/cost.ts`
**Problem:** `estimateUsageCost` only counts `cacheReadTokens`. Cache-write tokens are ~25% more expensive than standard input tokens for Anthropic. This means cost dashboards undercount by up to 25% on cached-system routes (recipe, coach, meal-suggest).
**Fix:** Add `cacheWriteTokens` to the cost calculation. Something like:
```typescript
const cacheWriteCost = (usage.cacheWriteTokens ?? 0) * pricing.cacheWritePerToken;
return inputCost + outputCost + cacheReadCost + cacheWriteCost;
```
**Impact:** B2B cost dashboards will show incorrect (lower) numbers without this.

### 2. `failGeneration` error swallowing
**File:** `agents/runtime/execute.ts`
**Problem:** In the catch block, `failGeneration` is `await`-ed. If the DB is down, `failGeneration` throws and the original API error is swallowed — you lose the real error.
**Fix:**
```typescript
await failGeneration(runId, error).catch(() => {});
```
**Impact:** Without this, a DB outage during an AI call hides the real error from logs.

### 3. `embed` provider label mismatch
**File:** `agents/router/policies.ts`
**Problem:** The `embed` policy lists `provider: 'openai'` but the actual provider is Voyage AI (`voyage-4`). Cosmetic, but confuses cost dashboards and audit logs.
**Fix:** Change to `provider: 'voyage'`.

---

## High Priority Fixes (P1)

### 4. Investigate failing preview deploys
**Problem:** 4 of 7 recent Vercel preview deploys are in Error state. Likely caused by missing branch-scoped Supabase environment variables.
**Action:** Check Vercel build logs for the failed previews. Ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for preview environments, or add build-time fallbacks.

### 5. Add `/api/health` endpoint
**Problem:** No general health check exists. Uptime Kuma and external monitors have nothing to ping. The only health route is Spike-specific.
**Action:** Create `app/api/health/route.ts` that returns:
```json
{
  "status": "ok",
  "version": "<from package.json>",
  "timestamp": "<ISO>",
  "db": "<connected|error>"
}
```
Include a lightweight DB ping (`SELECT 1`) to catch connection issues. Do NOT expose internal details (no table counts, no env vars, no user counts).

### 6. Add integration tests for `executeAiTask`
**Problem:** The governed runtime only has 4 unit tests covering budget and cost estimation. Zero integration tests for the main `executeAiTask` flow. Zero tests for the conversation route.
**Action:** Add tests covering:
- Happy path: mock provider returns result, verify persistence writes, cost logged
- Budget exceeded: verify rejection before API call
- Timeout: verify abort signal fires and generation marked failed
- Provider error: verify `failGeneration` called, error propagated
- Conversation route: auth required, input validation, response shape

### 7. Document operational table INSERT policy design
**Problem:** `agent_runs`, `api_usage_log`, `agent_conversation`, `raw_captures` have SELECT-only policies for authenticated users. Inserts happen via service role. This is intentional but undocumented — a future developer may "fix" this by adding INSERT policies that weaken the security model.
**Action:** Add a comment block in `0008_harden_rls_and_supabase_integration.sql` or a dedicated `docs/rls-design.md` explaining: "Operational tables are write-via-service-role only. Authenticated users can read their own rows but never insert directly. This prevents clients from spoofing agent runs or API usage records."

---

## Medium Priority (P2)

### 8. In-memory rate limiter on signup
**File:** `app/api/auth/signup/route.ts`
**Problem:** The rate limiter uses an in-memory `Map`. In serverless (Vercel), each cold start gets a fresh Map — the rate limit resets every time a new instance spins up. Under load, this offers minimal protection.
**Options:**
- Accept as-is for v0.3 (Supabase auth has its own rate limits)
- Move to Vercel KV or Upstash Redis for persistent rate limiting
- Add `X-Forwarded-For` based limiting at the Vercel edge (simpler)

### 9. Merge branch to main
**Problem:** `codex/trophe-100-execution` has 4 commits not on main. The production deploy came from this branch directly. If someone deploys from main, all Codex fixes disappear.
**Action:** Create PR, review, merge. Then delete the branch.

### 10. `meal-suggest` silent fallback
**File:** `app/api/ai/meal-suggest/route.ts`
**Problem:** On any error (including auth failures), the route returns a fallback suggestion array instead of an error. This masks real issues in production — you'll never see auth failures in monitoring.
**Fix:** Only fall back on AI provider errors. Propagate auth and validation errors normally.

### 11. Missing `scripts/seed-daniel-15day.ts`
**Problem:** Untracked file that causes typecheck/build failure when referenced. Either commit it or remove the reference.

---

## Low Priority / Nice-to-Have (P3)

### 12. Tab-encoded redirect edge case
`safeRedirectPath` doesn't block `/%09/evil.com`. Extremely unlikely to exploit in Next.js (the framework normalizes these), but adding a `decodeURIComponent` check before validation would close it.

### 13. `food_log.calories` type change
Migration 0009 changes `food_log.calories` from integer to `real`. Existing integer data converts cleanly, but downstream code that does strict equality checks on calorie values may break due to floating-point representation.

### 14. Add Langfuse trace linking
The runtime redacts prompts in traces. Consider adding a `traceUrl` field to the `agent_runs` table so engineers can jump from a DB record directly to the Langfuse trace for debugging.

---

## Execution Order for Codex

```
Phase 1 — Critical fixes (est. 15 min)
  [ ] Fix cacheWriteTokens in agents/runtime/cost.ts
  [ ] Add .catch guard on failGeneration in agents/runtime/execute.ts
  [ ] Fix embed provider label in agents/router/policies.ts
  [ ] Run tests to verify no regressions

Phase 2 — Production hygiene (est. 20 min)
  [ ] Add /api/health endpoint
  [ ] Investigate and fix preview deploy failures
  [ ] Commit or remove scripts/seed-daniel-15day.ts
  [ ] Merge codex/trophe-100-execution to main via PR

Phase 3 — Test coverage (est. 25 min)
  [ ] Add executeAiTask integration tests (5 scenarios)
  [ ] Add conversation route tests (auth, validation, response)
  [ ] Add meal-suggest error propagation test

Phase 4 — Hardening (est. 15 min)
  [ ] Document RLS operational table design
  [ ] Fix meal-suggest silent fallback
  [ ] Evaluate persistent rate limiting (Upstash vs accept-as-is)

Phase 5 — Polish (est. 10 min)
  [ ] Add decodeURIComponent to safeRedirectPath
  [ ] Add Langfuse traceUrl to agent_runs schema
  [ ] Update docs: regenerate after all fixes
```

---

## Context for Codex

- **Branch:** `codex/trophe-100-execution` (currently checked out)
- **Production URL:** trophe.app (Vercel)
- **Supabase project:** iwbpzwmidzvpiofnqexd
- **Test command:** `npm test`
- **Build command:** `npx next build`
- **Trophē is production-critical** — 5 active testers, real nutrition data. Zero-break policy: preview deploy → smoke test → prod promotion.
- **Do NOT combine auth changes with other changes** — separate PRs for auth-touching files.
- **API keys:** all from env vars, never hardcode. `.env` files are gitignored.
- **Cost tracking accuracy is a B2B requirement** — paying organizations will see these numbers.

---

*Audit performed by Claude Opus 4.6. Three independent agents: Security/RLS, AI Runtime, Production/Vercel. Total audit time: ~40 seconds.*
