# Trophē Enterprise Audit — June 12, 2026

> **HISTORICAL SNAPSHOT (2026-06-12) — SUPERSEDED.** Point-in-time audit; counts and scores are stale. Current state (2026-06-15): 55 public tables / 57 Drizzle migrations / 42,952 foods; engineering ~8.1/10, enterprise readiness ~5.2/10. See canonical trackers `docs/audits/remediation-status-2026-06-15.md` (WP status + scorecard) and `docs/audits/enterprise-readiness-2026-06-13.md` (path-to-100).

Four parallel audits (architecture/organization, security/RLS, quality/testing,
enterprise-readiness research vs market bar). Scores 0-10.

## Scorecard

| Dimension | Score | One-liner |
|---|---|---|
| **Architecture & organization** | **7.6** | Clear layers, agents exemplary; debt = legacy `food_database`, page-level DB access, 5 files >1,000 lines |
| — Directory coherence | 8 | app/agents/lib/db clean; seeds scattered |
| — Module boundaries | 7 | 78 direct supabase calls in pages vs tRPC; agents governed ✓ |
| — Dead code | 7 | food_database table unused, prompt v3-v6 relics, mediapipe dep likely dead |
| — Schema organization | 8 | 33 schema files 1:1 with DB, phase-annotated *(June 12 snapshot; STALE — DB now has 55 public tables / 57 Drizzle migrations as of 2026-06-15)* |
| — Dependency hygiene | 8 | pinned, no unused except @mediapipe/tasks-vision |
| **Security** | **8.0** | Access control strong; gaps were validation consistency + 2 rate limits (FIXED same day) |
| — RLS coverage | 9 | force-enabled everywhere; new tables (messages/meal plans/intake) properly scoped |
| — API auth | 9 | every mutation authed; no unauthenticated writes found |
| — Secrets | 9 | no hardcoded prod secrets; eval-tester UUIDs bypass rate limit (documented) |
| — Input validation | 6→8 | zod gaps closed for client/message, signup, recipe-analyze (2026-06-12) |
| — Service-role usage | 8 | all call sites auth-first |
| — Headers/rate limits | 7→8 | signup in-memory limiter → durable; message spam vector closed |
| **Quality & testing** | **7.5** | Agent/LLM rigor above typical; UI features under-tested |
| — Coverage shape | 7 | 46 test files; messaging/meal-plan/intake/coach pages untested |
| — CI pipeline | 8 | eval gates + release gates rare at this stage; no coverage threshold/SCA/secret scan |
| — Error handling | 7 | no empty catches; `catch { return null }` silently degrades RAG/memory |
| — TS strictness | 8 | strict, zero `as any`; 12 `as unknown as` |
| — Observability | 6 | Langfuse on core agents; RAG/memory unspanned; no push alerting |
| — Lint | 9 | 0 errors, 6 warnings |
| **Enterprise readiness (market bar)** | **5.5** | Product ahead, paperwork behind — typical pre-beta gap *(June 12 market-bar sub-score; SUPERSEDED — real-B2B enterprise readiness was ~4.8/10 on 2026-06-13 and ~5.2/10 on 2026-06-15 after WP0-WP3 re-scoring)* |

**Overall: 7.2 / 10** — production-grade core, enterprise-paperwork gap.

> **Scores superseded.** The composite 7.2 above is a June 12 snapshot. As of 2026-06-15: engineering-quality ~8.1/10; real-B2B enterprise readiness ~5.2/10 (WP0-WP3 cleared zero Tier-0 binary blocker, so not yet clinic-signable). See `docs/audits/remediation-status-2026-06-15.md`.

## Market-bar findings (EU health SaaS, Greek launch)
Nutrition logs = **GDPR Art. 9 special-category data**; clinics are controllers, Trophē
is processor. At <100-customer scale, **GDPR artifacts beat certifications** (SOC 2/ISO
27001 only gate larger deals). Competitors (Nutrium, Practice Better) lead with GDPR
pages, not SOC 2.

### MUST before beta
1. **Signable Art. 28 DPA + sub-processor list** (Vercel, Supabase, DeepSeek ⚠ disclose
   inference location, Voyage, Langfuse)
2. **Supabase Pro for automated backups/PITR** — Free tier has none; indefensible for Art. 9 data
3. **Data export + verified deletion** end-to-end (privacy API exists; close the loop)
4. Explicit-consent capture for end clients (consents table exists; wire the UI)
5. Retention policy + 72h breach-notification runbook

### SHOULD (weeks, not days)
TOTP 2FA · audit-log coverage of data access · public Trust/GDPR page (EL+EN) ·
status page · 99.9% SLA language · white-label branding

### Fixed during this audit (same day)
- `client/message`: zod (max 2000 chars) + durable rate limit 30/15min
- `signup`: in-memory Map limiter → durable `consumeRateLimit` 5/h + zod (password ≥8)
- `recipe-analyze`: zod schema (max 30k chars, language enum)

## Ranked backlog (next)
1. Tests for messaging + meal-plan + intake flows (highest-traffic untested features)
2. CI: vitest --coverage thresholds + `npm audit --audit-level=high` + gitleaks
3. DPA document + sub-processor list + Trust page (unblocks beta sales)
4. Supabase Pro upgrade (backups) — account action, 5 minutes
5. Langfuse spans on RAG/memory + alerting webhook (Telegram) for canary/eval failures
6. Split `lookup.ts` (1,792 lines) into retrieval/units/fallback modules
7. Remove `food_database` legacy table + prompt v3-v6 relics + mediapipe dep check
8. Migrate page-level supabase calls to tRPC progressively (start dashboard/page.tsx)
