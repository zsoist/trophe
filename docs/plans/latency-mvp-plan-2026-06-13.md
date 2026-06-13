# Plan: Latency 6.5→9+ and MVP/Business 6.0→9+

Research-grounded (3 web sweeps + code profiling). Each item tagged **[impact · effort]**.
Sources: docs research briefs; code reality from this repo (2026-06-13).

---

## TRACK A — LATENCY (6.5 → 9+). Target: p95 7s→<2.5s, perceived <1.5s

**Code reality:** single DeepSeek call dominates (2-7s). `thinking:disabled` ✓ already.
NOT done: streaming, region pinning, prefix-cache maximization, max_tokens cap, fast-path bypass.
RAG-before-LLM is a TRUE serial dep (LLM prompt consumes RAG context) — make it cheaper, don't "parallelize".

### A1 — Parameter wins (do first, A/B each) [high · trivial]
- **Front-load the static prompt** so DeepSeek prefix-cache hits: all reference tables/few-shots/persona
  first, byte-identical across calls; dynamic text (user input, RAG context) ONLY in the last user message.
  Target >80% `prompt_cache_hit_tokens`. (Cache hit skips prefill → 50-85% TTFT cut.)
- **Cap `max_tokens`** to ~150 (tool-call JSON needs <120); **temperature 0**. Each output token ≈12ms.
- Verify via benchmark p50/p95 + cache-hit logs. Risk: reordering/cap could shift output → A/B gate.

### A2 — Streaming + region + pooling [high perceived · low] 
- **Stream the parse response** (ReadableStream/SSE) so first fields render ~1.1s vs 7s spinner. Biggest *felt* win.
- **Pin Vercel function region to the Supabase region** (`vercel.json` regions) — kills cross-region RTT on every DB hop.
- **Supavisor transaction pooler** (port 6543, `?pgbouncer=true`) — burst protection (fixes c=10 failures), warm conns.
- `waitUntil()` for non-blocking writes (agent_runs, telemetry) so the response returns first.

### A3 — Structural [high · medium]
- **Fast DB-bypass path**: exact/high-confidence DB match BEFORE the LLM for unambiguous inputs
  ("100g chicken breast", "banana") → return <200ms, no LLM. ~big fraction of inputs.
- **Semantic cache** (`food_parse_cache` table, reuse pgvector): cache (input embedding → result),
  cosine ≥0.95 → return ~20ms. Food logging has high input repetition.
- **Slim fast-path prompt** (≤500 tok) for the common single-food path; full 7k prompt only for ambiguous/multi-item.
- **p-limit + backoff/jitter** on DeepSeek calls for burst resilience.

**Score path:** A1+A2 → ~8.0 (p95 <3s, perceived <1.5s). A3 → 9+ (p95 <2s, many sub-200ms hits).

---

## TRACK B — MVP/BUSINESS (6.0 → 9+). The 3 beta blockers, in dependency order

**Code reality:** Stripe NOT installed; org enum `free/pro/enterprise` ≠ pricing `Free/Pro/Clinic`; ZERO plan-gating.
Signup forces `role=client`; comment references "the invite path" that DOESN'T EXIST; no client→coach linking.

### B1 — Coach onboarding + invites (THE #1 beta blocker) [high · medium] — DO FIRST
Without this, every beta nutritionist needs manual DB promotion. Screens (P0):
- **Invite-code coach signup** `/signup?code=` → role=coach auto-assigned (fixes forced-client gap). `beta_invite_codes` table w/ cohort metadata.
- **DPA acceptance** at coach signup (GDPR Art. 28, coach = controller) → consent_log.
- **Coach→client invite** `/clients/invite` (email + magic-link 7-day JWT → `/activate?token=`), client activation w/ **Art. 9 two-step granular consent**.
- **Onboarding checklist** widget (invite client → review log → send meal plan = activation event).
- P1: shareable `/join/[coach]` link (WhatsApp/IG), claim-existing-client flow, `/settings/privacy/delete-account` (Art. 17).
- Instrument activation metrics (meal_plan_sent = primary). Aha = first meal plan sent (<30min TTV).

### B2 — Billing: subscriptions then commission [high · large] — needs YOUR decisions
- **Fix the plan enum** `free/pro/enterprise` → `free/pro/clinic` (migration) to match pricing.md.
- **Stripe subscriptions** (`npm i stripe`): Products/Prices (Free/Pro €29/Clinic €99 + annual), Checkout + Billing Portal,
  webhook route (RAW body, signature verify, idempotency via `stripe_events`), service-role writes, 14-day trial.
- **Plan-limit enforcement**: `enforceClientLimit()` on client creation (Free ≤5) + DB-trigger safety net.
- **Stripe Tax** `automatic_tax:true` + `tax_id_collection` → auto 24% Greek VAT / EU reverse-charge; inclusive B2C pricing.
- **Stripe Connect (Express)** for the 8% booking commission: destination charges + `application_fee_amount`,
  embedded onboarding, `bookings` table w/ computed `platform_fee_cents`, nightly reconciliation.
- ⚠️ **myDATA landmine**: Greek B2B e-invoicing mandatory Oct 2026; Stripe does NOT report to AADE; €1,500/txn fine.
  Needs a separate myDATA integration (Flick.network or AADE REST) before Greek go-live. **Decision needed.**

### B3 — Coach AI UIs (the "saves me time" differentiators) [high · medium]
Backends EXIST (meal-suggest, recipe-analyze) with ZERO UI:
- Recipe generator UI (coach), meal-plan draft generator (targets+intake → 7-day editable draft), AI shopping list from week plan.
- Fix `ClientComparison` hardcoded placeholder macros (real food_log query).

**Score path:** B1 → ~7.0 (beta-onboardable). B2 → ~8.5 (revenue live). B3 → 9+ (differentiated).

---

## Decisions needed from you (gate B2)
1. **Stripe account + Connect enablement** (test mode first) — I can't create it.
2. **myDATA approach** — integrate now (Flick/AADE) vs defer past beta (beta may be free → no invoices yet)?
3. **Pricing confirmation** — Free 5-client / Pro €29 / Clinic €99 / 8% commission — final or validate with cohort first?
4. **EU entity / VAT-OSS registration** status (affects Stripe Tax config).

## Recommended execution order
1. **A1+A2 latency** (low-risk, A/B-gated, immediate UX win) — I can start now.
2. **B1 onboarding** (unblocks the beta; no external deps) — I can start now.
3. **A3 latency structural** — after A1/A2 measured.
4. **B2 billing** — after your 4 decisions; beta can run free-tier first (B1 alone enables the beta).
5. **B3 AI UIs** — parallel with B2.

Note: beta does NOT need billing — B1 alone makes it onboardable. Billing (B2) is for monetization, can follow the beta.
