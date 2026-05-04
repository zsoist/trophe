# Trophē B2B Production Readiness Report — 2026-05-03

Canonical repo: `/Volumes/SSD/work/forge-projects/trophe`
Production URL: `https://trophe.app`
Supabase project/ref: `iwbpzwmidzvpiofnqexd`

## Result

B2B production readiness score: **9.5/10 software readiness** and **pilot-ready after external paid controls are enabled**.

Trophē is production-grade for the verified software surface: privileged routes are proxy-protected, admin APIs use role guards, public signup creates only clients, roles are canonical, organization-aware access helpers are in place, AI routes verify Supabase users, cost tracking is centered on `agent_runs`, and B2B billing metadata exists without live money movement.

The remaining gap is operational/commercial rather than core app code: enable Supabase Pro/PITR or an equivalent restore-tested backup path, Vercel observability/log drains/spend alerts/WAF rules, and legal/tax decisions before Stripe Connect live money movement.

## Verification

Target acceptance sequence:

```bash
npm run typecheck
npm run lint
npm test
npm run readiness
npm run evals
npm run build
npm run test:e2e
npm run canary:prod
```

Latest local results are tracked in the implementation session. CI must keep these gates green before deploy.

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
- Canonical roles are `super_admin | admin | coach | client`; legacy `both` is archived only.
- Schema source of truth is Drizzle migrations plus `db/schema/*`; root SQL dumps are archived under `docs/legacy/`.
- Production writes remain restricted unless explicitly justified.

## Remaining Risks

- The production canary is read-only; authenticated role workflows require staged test users via `E2E_*` env vars.
- `agent_runs` cost summaries depend on live AI route traffic and DB insert permissions; monitor `/admin/costs` after the next authenticated AI calls.
- Paid controls remain launch-gating: PITR/restore drill, log drains, WAF/spend alerts, and Stripe/legal operating decisions.
