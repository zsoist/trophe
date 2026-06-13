# Trophe Full Engineering Review

Date: 2026-06-07

## Score

**Overall: 80/100**

| Area | Score | Evidence |
|---|---:|---|
| Product structure | 84 | Clear client, coach, admin, nutrition, AI, and wearable domains |
| Architecture | 80 | Strong domain split and central auth/router boundaries; migration history had drift |
| Security | 88 | RLS on every public table, explicit policies, role gates, CSP, signed webhooks and OAuth state |
| Supabase and data | 86 | Production verified with 0 RLS-disabled tables and 0 unsafe policies; canonical reconciliation added |
| API reliability | 78 | Input guards and fallbacks are common; distributed in-memory rate limits remain weak |
| Testing | 62 | 208 unit/integration tests and public E2E pass; measured line coverage is 19.5% |
| CI/CD and operations | 72 | Strong CI pipeline and canary; latest recorded CI failed and production is 35 days old |
| Dependencies | 82 | No high-severity production audit findings; moderate transitive PostCSS advisory remains |
| Documentation | 88 | Extensive architecture, security, deployment, runbook, and roadmap documentation |

## Fixed During Review

- Added canonical `dish_recipes` schema export and an idempotent reconciliation migration.
- Corrected the invalid GIN text index and added fresh-database RLS policies.
- Closed auth callback and magic-link open redirects.
- Added cleanup when public signup partially fails after creating a Supabase Auth user.
- Replaced forgeable Spike OAuth state with an HMAC-signed, expiring token.
- Removed secret-name disclosure from the public Spike health endpoint.
- Added regression and repository invariants for these defects.

## Verification

- Local database bootstrap and schema verification: pass
- Public production canary: pass
- Unit/integration tests: 208 pass, 25 skip
- Public Playwright flows: 8 pass
- Authenticated Playwright flows: 8 skip without E2E credentials
- Typecheck, lint, readiness, production build: pass
- Production dependency audit: no high-severity findings

## Priority Backlog

1. Raise coverage on auth routes, AI routes, tRPC mutations, and wearable token flows to at least 60%.
2. Configure managed E2E client, coach, and admin credentials in CI so authenticated flows run.
3. Deploy the reviewed changes and apply migration `0009_canonical_schema_reconciliation`.
4. Move manually applied seed/data SQL files out of `drizzle/` so only journaled migrations live there.
5. Replace in-memory signup and AI rate limits with a distributed limiter.
6. Upgrade the deprecated Next.js `middleware.ts` convention to `proxy.ts`.
7. Run a fresh GitHub CI build after deployment; the latest recorded run is failed.

## Integration Status

- **Database**: Supabase Postgres is canonical for production and local development. OpenBrain is not used by runtime code.
- **AI providers**: Anthropic, Gemini, Voyage, and Langfuse variables exist in Vercel production. Values are encrypted and were not printed during review.
- **RAG/memory**: pgvector retrieval, Voyage embeddings, memory extraction, and supersedence code exist. The capability is not fully live because no production chat route currently calls the memory read/write pipeline.
- **Apple Watch / Spike**: intentionally on hold. Production does not have `SPIKE_CLIENT_ID`, `SPIKE_CLIENT_SECRET`, `SPIKE_WEBHOOK_SECRET`, or `WEARABLE_ENCRYPT_KEY`.
- **Browser QA**: Playwright Chromium installed locally; public desktop and mobile flows pass.

### AI Capability Matrix

| Capability | Status |
|---|---|
| Food parsing | Live, Gemini-backed with deterministic DB lookup |
| Recipe analysis | Live, Anthropic-backed |
| Meal suggestions | Live, Anthropic tool-use output |
| Photo nutrition estimate | Live, Anthropic vision with conservative confidence cap |
| Memory extraction | Implemented, not wired to a live conversation route |
| RAG memory retrieval | Implemented with pgvector + Voyage, not wired to a live conversation route |
| Coach insight | Policy defined; no live route found during review |
| Langfuse observability | Production variables configured |
