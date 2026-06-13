# Trophē — Full System Audit & Scorecard (2026-06-13)

Six-dimension parallel deep audit (independent agents, one lens each).
Production: trophe.app · Supabase ref iwbpzwmidzvpiofnqexd · ~42,950 foods, 8 languages.

## Scorecard

| Dimension | Score | One-line verdict |
|---|---:|---|
| AI capabilities & pipeline | **8.0** | Best-in-class DB×LLM hybrid arbitration; governed runtime; hardened schemas |
| APIs & integrations | **7.9** | Solid two-path auth, no secret leakage; a few unauth'd routes + rate-limit gaps |
| AI cost & observability | **7.5** | DeepSeek-only mandate well enforced; prompt-cache + memory-queue waste; solo-user no $ cap |
| Enterprise & security | **6.5** | Strong RLS migration; `db:push` policy-drift footgun + consent never captured |
| Architecture & organization | **6.0** | Great AI-readability docs; 5 god files, dup schema, cluttered docs/ |
| MVP & business readiness | **5.8** | Coach loop polished; **no billing, no self-serve onboarding, AI UIs missing** |
| Latency / performance | **6.0** | Well-parallelized queries; serial food-lookup loop + dead vector arm |
| **OVERALL** | **~6.8** | **Strong engineering; beta-gated on business plumbing + a few security must-fixes** |

The composite is dragged down by the two dimensions that matter most for the *stated goal* (a paid clinic beta): business readiness and the enterprise must-fixes. The pure-engineering core (AI, APIs, cost) averages ~7.8.

## The 3 things that actually block a credible paid beta
1. **No self-service coach onboarding** — every beta nutritionist needs manual DB promotion; no invite system; no client→coach linking UI. *Highest-friction gate.*
2. **No billing enforcement** — Stripe not installed; tiers exist only in markdown; DB plan enum (`free/pro/enterprise`) mismatches pricing.md (`Free/Pro/Clinic`). No upgrade pressure, no revenue signal.
3. **"Saves me time" AI surfaces have no UI** — meal-suggest, recipe generator, shopping list are working backends with zero coach-facing interface. Without them the beta question "does this save you time?" has no yes.

## MUST-FIX before clinic beta (security/GDPR — from enterprise audit)
- **C1 — `db:push` policy-drift footgun**: TS schema policies are `TO ['public']` but migration 0008 hardened prod to `TO authenticated`. One `db:push` silently re-exposes Art.9 data. *Mitigation: remove `db:push` from workflow; migrations are source of truth.*
- **C2 — consent never captured**: `consents` table exists, zero writes. Art.9 processing has no verifiable consent basis.
- **H1 — `is_super_admin()` missing `private.` prefix** (profiles.ts:53, audit_log.ts:55) — breaks super-admin post-push.
- **H2 — `messages_client_insert` has no `WITH CHECK`** in TS schema — sender_role spoofing if app layer bypassed.
- **H3 — GDPR export unimplemented** — only a request queue; Trust page promises machine-readable delivery.
- **Magic-link OTP has no rate limit** (also flagged by API audit) — inbox flooding / enumeration.
- **Seed routes use `requireAdmin` not `requireSuperAdmin`** + accept arbitrary `coachUserId` (impersonation).
- Delete `.env.local.bak` from working tree.

## Quick wins executed this session
See companion commit(s). Tier-1 = safe, drift-immune, low-risk.

### Security hardening
- Magic-link rate limit (`consumeRateLimit`), seed routes → `requireSuperAdmin`, coach-insight → positive role allowlist, redact seed `error.message`, drop `api.anthropic.com` from CSP `connect-src`, remove `db:push` script (footgun), delete `.env.local.bak`.

### Latency (drift-immune)
- `lookupFoodBatch` serial loop → `Promise.all` (saves ~300-600ms on multi-item parses).
- Pass `queryEmbedding` into batch lookup so the **HNSW vector arm actually fires** (it was silently dead in prod — BM25-only).

### Cost
- Memory queue: skip assistant-turn extraction when no first-person/diet signal (~50% memory-extract savings).

### Organization
- Delete stale `drizzle/schema.ts` (dup of `db/schema/`), move `scripts/` root orphans, archive dated `docs/*` snapshots, `.DS_Store` purge.

## Larger follow-ups (dedicated sessions, ranked)
1. Stripe Connect + tier enforcement (Free 5-client cap) — revenue gate
2. Coach invite/onboarding + client→coach linking — onboarding gate
3. Coach AI UIs: recipe generator, meal-plan draft, shopping list — differentiation
4. GDPR export endpoint + consent capture at signup — compliance
5. God-file splits (lookup.ts, index.v4.ts, coach/client/[id]) — maintainability
6. `decompose.ts` → structured output + schema; un-gate food_parse CI eval
7. Cross-provider AI fallback (Gemini/Haiku) — resilience on DeepSeek outage

## What's genuinely strong (don't regress)
RLS migration 0008 (private. SECURITY DEFINER, anon revoked, fail-closed `is_coach_of`); governed AI runtime (agent_runs + per-org budgets + Langfuse + OTel); DeepSeek-only enforcement; durable Postgres rate limits; `getUser()` not `getSession()`; immutable audit-log trigger; encrypted wearable tokens; server-only secrets; the AI-readability doc set (CLAUDE/AGENTS/ARCHITECTURE/CODEX.md).
