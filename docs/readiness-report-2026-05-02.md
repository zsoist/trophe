# Trophē Production Readiness Report — 2026-05-02

Canonical repo: `/Volumes/SSD/work/forge-projects/trophe`
Production URL: `https://trophe.app`
Supabase project/ref: `iwbpzwmidzvpiofnqexd`

## Result

Production readiness score: **9.5/10**.

Trophē is production-grade for the verified surface: local checks are green, deterministic food parsing is 27/27, AI routes verify Supabase users, Next.js 16 uses `proxy.ts`, cost tracking is centered on `agent_runs`, and the read-only production canary passes.

The remaining 0.5 is branch governance: `main` is still the GitHub default branch while `v0.3-overhaul` remains the temporary production truth. After this report's verification sequence stays green in CI, merge `v0.3-overhaul` into `main` and configure Vercel production to deploy from `main`.

## Verification

Commands run on 2026-05-02:

```bash
npm run typecheck
npm run lint
npm test
npm run readiness
npm run build
npm run test:e2e
npm run canary:prod
```

Results:
- `typecheck`: pass
- `lint`: pass
- `npm test`: 9 files passed, 123 tests passed, 3 skipped
- `readiness`: pass
- `build`: pass; no Next.js middleware deprecation warning
- `test:e2e`: 8 passed
- `canary:prod`: pass

Live read-only checks:
- `GET https://trophe.app/`: HTTP 200, Vercel, HSTS present, CSP has no `unsafe-eval`
- `GET https://trophe.app/login`: HTTP 200
- `GET https://trophe.app/dashboard`: HTTP 307 to `/login?redirectTo=%2Fdashboard`
- Anonymous `POST /api/ai/meal-suggest`: HTTP 401

## Current Truth

- `agent_runs` is the canonical AI cost/observability table.
- `api_usage_log` is legacy compatibility only.
- AI routes must use async `guardAiRoute()` and the verified Supabase `userId`.
- `proxy.ts` is the active Next.js 16 proxy file.
- Production writes remain restricted unless explicitly justified.

## Remaining Risks

- Branch/deploy governance is not fully normalized until `v0.3-overhaul` is merged to `main` and Vercel production follows `main`.
- The production canary is read-only; it verifies headers, redirects, platform, and anonymous AI auth, not authenticated user workflows.
- `agent_runs` cost summaries depend on live AI route traffic and DB insert permissions; monitor `/admin/costs` after the next authenticated AI calls.
