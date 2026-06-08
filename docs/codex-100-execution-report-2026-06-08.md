# Trophē 100/100 — Codex Execution Report

> **Generated:** 2026-06-08
> **For:** Codex agent execution
> **Source plan:** `docs/superpowers/plans/2026-06-08-trophe-enterprise-frontier-plan.md`
> **Current branch:** `main` at `2a01bc0`
> **Production:** `trophe.app` — deployed, 260 tests passing

---

## EXECUTIVE SUMMARY

Trophē is at **72/100** honestly scored. The architecture is frontier-grade (governed runtime, Letta-style memory, permission-aware RAG, DietAI24 food parse pipeline). But three categories of gaps prevent claiming 100:

1. **Nutrition accuracy: 43% → needs ≥90%** — Greek/Colombian eval fails on composite dishes, vague quantities, code-switch, and missing food DB coverage
2. **AI quality: no eval coverage for RAG, memory, photo** — can't prove these work
3. **B2B commercial: no org lifecycle, no billing, no privacy fulfillment** — schemas exist but no API routes

The enterprise frontier plan (19 tasks across 5 programs) is the roadmap. This report translates it into sequenced, independently verifiable execution phases with exact file paths, commands, and acceptance criteria.

---

## CURRENT STATE — What's TRUE

### Infrastructure (verified)
- 25 migrations applied through `0018_durable_rate_limits.sql`
- 260 tests passing (26 files, 25 skipped DB-dependent ranking tests)
- Typecheck, lint, build: clean
- Production deployed at `trophe.app`

### Working Systems
| System | Status | Evidence |
|---|---|---|
| Governed AI runtime | ✅ Live | `agents/runtime/execute.ts` — all AI calls go through `executeAiTask()` |
| Food parse v4 | ✅ Live | `agents/food-parse/index.v4.ts` — DietAI24 pipeline with recipe cache priority |
| RAG (hybrid search) | ✅ Live | `agents/rag/retrieve.ts` — BM25 + vector, permission-aware SQL function |
| Memory read/write | ✅ Live | `agents/memory/read.ts` + `write.ts` — 3-stage kNN, fire-and-forget write |
| Conversation route | ✅ Live | `app/api/ai/conversation/route.ts` — memory + RAG + coaching + citations |
| Org budgets | ✅ Live | `agents/runtime/org-budget.ts` — daily/monthly limits, kill switch |
| Durable rate limiting | ✅ Live | `lib/durable-rate-limit.ts` — DB-backed, survives cold starts |
| Audit log | ✅ Live | `db/schema/audit_log.ts` — append-only, super-admin RLS |
| Consents/GDPR tables | ✅ Live | `db/schema/consents.ts` — purpose/version tracking |
| Data requests | ✅ Live | `app/api/privacy/requests/route.ts` — intake only |
| Security headers | ✅ Live | `middleware.ts` — X-Frame, X-Content-Type, etc. |
| Enterprise invariants | ✅ Live | `tests/enterprise/invariants.test.ts` — 18 structural tests |
| Safety barrier | ✅ Live | `index.v4.ts:536-548` — plausibility checks before returning results |
| Schema repair | ✅ Live | `index.v4.ts:348-365` — one retry on malformed LLM JSON |

### Measured Failures
| Metric | Value | Target |
|---|---|---|
| Greek/Colombian eval pass rate | **43.3%** (13/30 baseline) | ≥90% |
| Greek cases passing | **~47%** (7/15) | ≥90% |
| Colombian cases passing | **~40%** (6/15) | ≥90% |
| RAG eval cases | **0** | ≥20 |
| Memory eval cases | **0** | ≥15 |
| Photo eval cases | **0** | ≥10 |
| Nikos golden (latest run) | **SKIPPED** (auth token issue) | 10/10 |
| Authenticated E2E | **8 skipped** | All passing |

### Failing Greek Cases (consistent across both baseline runs)
```
gr-04: γιαούρτι με μέλι και καρύδια — composite, vague quantity
gr-05: 1 σουβλάκι κοτόπουλο με πίτα — composite dish, recipe cache should hit but macro ranges wrong
gr-07: μια χούφτα ελιές — "handful" unit, olive type not specified
gr-09: 1 χωριάτικη σαλάτα — composite, recipe calibration
gr-12: πρωινό: 2 αυγά τηγανητά με 30γρ φέτα και 1 ντομάτα — multi-item breakfast
gr-13: I had 2 eggs με φέτα — code-switch EN/EL
gr-14: μερικά αμύγδαλα — "some" = vague quantifier
```

### Failing Colombian Cases
```
co-02: 1 arepa con queso — resolves to wrong arepa variant
co-06: 1 bandeja paisa — composite, macro ranges
co-07: ajiaco santafereño — composite soup
co-09: sancocho de gallina — composite soup
co-10: 1 vaso de jugo de lulo — serving size
co-11: 2 empanadas de carne — portion × 2
co-12: 1 patacón con suero — composite
co-13: I had un protein shake con banana — code-switch EN/ES
co-15: una changua bogotana — composite breakfast soup
```

---

## EXECUTION PHASES

### PHASE 1: NUTRITION ACCURACY (Target: 43% → 90%+)

**Priority: CRITICAL — This is the single largest gap**

#### Task 1.1: Seed Greek Base Foods in `foods` Table

**Problem:** Colombian foods exist in BOTH `food_database` table (migration 0016) AND `dish_recipes` (migration 0012). Greek foods are ONLY in `dish_recipes`. The primary `lookupFood()` in `agents/food-parse/lookup.ts` queries the `foods` table first — Greek base ingredients (feta, Greek yogurt, olives, pita bread, phyllo, tzatziki components) are missing.

**Files to create:**
- `drizzle/0019_seed_greek_food_database.sql`

**Requirements:**
- 50+ Greek staple foods with macros sourced from USDA FDC (cross-reference HelTH published values)
- Include `name_el` column with proper Greek names for alias matching
- Foods: feta (various types), strained yogurt, Kalamata/Throumba olives, pita bread, phyllo dough, halloumi, graviera, kefalotiri, taramosalata base, tzatziki base, Greek coffee, frappe base, dakos bread, koulouri, bougatsa dough, loukoumades, revithada components
- Include `data_quality` classification: `lab_verified` for HelTH-sourced, `label` for branded
- Include `source` as `helth` or `usda` (schema already supports both)
- Format: match exactly the structure of `0016_seed_bogota_colombian_food_database.sql`

**Verification:**
```bash
# After applying migration:
npx drizzle-kit push
# Then verify:
psql $DATABASE_URL -c "SELECT count(*) FROM food_database WHERE source = 'seed' AND category = 'greek';"
# Expected: ≥50
```

#### Task 1.2: Add Greek Food Aliases

**Problem:** `food_aliases` table exists (`db/schema/food_aliases.ts`) but has minimal Greek entries. When a user types "ντομάτα" the alias lookup should resolve to the canonical tomato food_id.

**Files to create:**
- `drizzle/0020_seed_greek_aliases.sql`

**Requirements:**
- 100+ Greek colloquial name → food_id mappings
- Cover: vegetables (ντομάτα, αγγούρι, κρεμμύδι, πιπεριά, μελιτζάνα, κολοκύθι), proteins (κοτόπουλο, χοιρινό, μοσχάρι, αρνί, ψάρι), dairy (φέτα, γιαούρτι, γάλα, τυρί), grains (ψωμί, ρύζι, μακαρόνια), fruits (μήλο, πορτοκάλι, μπανάνα, σταφύλι)
- Include common misspellings and abbreviations
- Lang column: `el`

#### Task 1.3: Add Greek Unit Conversions

**Problem:** Greek units are documented in the food parse prompt (`agents/prompts/food-parse.v4.md`) but `food_unit_conversions` table lacks Greek-specific entries. The prompt tells the LLM what units mean, but the DB doesn't have the conversion factor for deterministic calculation.

**Files to create:**
- `drizzle/0021_seed_greek_unit_conversions.sql`

**Requirements:**
- Greek units: φλιτζάνι/φλ (cup = 240ml), κουταλιά/κ.σ. (tbsp = 15ml), κουταλάκι/κ.τ. (tsp = 5ml), χούφτα (handful = 30g), παλάμη (palm = 120g), φέτα (slice — food-specific), κομμάτι (piece — food-specific), ποτήρι (glass = 250ml)
- Vague quantifier defaults: λίγο (a little = 15g), μερικά/μερικές (some = context-dependent), αρκετό (enough = 100g)
- Source: `kavdas` for reviewed, `coach` for estimated

#### Task 1.4: Fix Decompose Fallback

**Problem:** In `agents/food-parse/decompose.ts:299-314`, when a composite dish ingredient isn't in the DB, the code uses a blanket `200 kcal/100g` estimate. This is catastrophically wrong for:
- Pita bread (75 kcal/100g) — overestimates by 2.7x
- Tzatziki (56 kcal/100g) — overestimates by 3.6x
- Olive oil (884 kcal/100g) — underestimates by 4.4x

**File to modify:** `agents/food-parse/decompose.ts`

**Fix:** Replace lines 299-314 with category-aware defaults:
```typescript
// Category-aware fallback estimates (kcal/100g)
const CATEGORY_DEFAULTS: Record<string, { kcal: number; protein: number; carbs: number; fat: number; fiber: number }> = {
  vegetable: { kcal: 35, protein: 2, carbs: 6, fat: 0.5, fiber: 2 },
  fruit: { kcal: 60, protein: 0.8, carbs: 14, fat: 0.3, fiber: 2 },
  grain: { kcal: 130, protein: 4, carbs: 25, fat: 1.5, fiber: 2 },
  protein: { kcal: 200, protein: 25, carbs: 0, fat: 10, fiber: 0 },
  dairy: { kcal: 150, protein: 8, carbs: 5, fat: 10, fiber: 0 },
  fat_oil: { kcal: 700, protein: 0, carbs: 0, fat: 78, fiber: 0 },
  sauce_condiment: { kcal: 80, protein: 1, carbs: 8, fat: 4, fiber: 0.5 },
  bread_dough: { kcal: 250, protein: 8, carbs: 45, fat: 3, fiber: 3 },
  generic: { kcal: 150, protein: 6, carbs: 18, fat: 6, fiber: 2 },
};
```
- Add a food category classifier function that maps ingredient names to categories
- Use category defaults instead of blanket 200 kcal

**Test:** `tests/agents/food-parse.accuracy.test.ts` — add cases verifying category-aware fallback

#### Task 1.5: Structured Output (Replace Regex JSON Extraction)

**Problem:** `extractV4JSON()` in `agents/food-parse/index.v4.ts:58` uses regex to find JSON in free-form LLM text. This causes:
- Parse failures when LLM wraps JSON in explanation text
- Nondeterministic failures on code-switch inputs (gr-13 passes sometimes, fails sometimes)
- The schema-repair retry (line 348-365) is a band-aid

**Files to modify:**
- `agents/clients/google.ts` — add `response_schema` support for Gemini
- `agents/clients/anthropic.ts` — add `tool_use` structured output support
- `agents/runtime/providers/text.ts` → create `agents/runtime/providers/structured.ts`
- `agents/food-parse/index.v4.ts` — use structured provider instead of `extractV4JSON`

**Requirements:**
- Define Zod schema for V4LLMOutput: `{ items: Array<{ raw_text, food_name, name_localized, quantity, unit, qualifier?, confidence, recognized }> }`
- Use Gemini's `response_schema` for food_parse task (already uses Gemini Flash)
- Use Anthropic's `tool_use` for decompose (uses Gemini Flash too, but should have fallback)
- Remove `extractV4JSON` from production path (keep as test utility)
- Keep schema-repair retry as belt-and-suspenders

**Verification:**
```bash
npx vitest run tests/agents/food-parse-structured-output.test.ts
# All cases must produce valid parsed JSON without regex extraction
```

#### Task 1.6: Expand Eval to 150+ Cases

**Problem:** Current eval has 10 (Nikos) + 30 (Greek/Colombian) = 40 cases. Need ≥150 for enterprise confidence.

**Files to create:**
- `agents/evals/datasets/nutrition-enterprise-v1.json`

**Requirements (from plan Task 1):**
- 50 Greek cases: base foods (15), composites (15), vague quantities (5), code-switch (5), bakery/street food (5), seafood (5)
- 40 Colombian/Latin cases: base foods (10), composites (15), street food (5), beverages (5), code-switch (5)
- 40 English/USDA cases: baseline (20), branded (10), portions (10)
- 20 adversarial cases: empty input (3), emoji-only (2), extremely long (2), contradictory (3), impossible (3), injection attempts (3), boundary (4)

**Each case must include:**
```json
{
  "id": "gr-comp-01",
  "input": "1 μερίδα μουσακά",
  "language": "el",
  "category": "composite_recipe",
  "expect_item_count": 1,
  "expect_total": {
    "calories": { "min": 350, "max": 550 },
    "protein_g": { "min": 15, "max": 30 },
    "carbs_g": { "min": 20, "max": 40 },
    "fat_g": { "min": 18, "max": 35 }
  },
  "expect_safety": true,
  "expect_source": ["local_db", "ai_estimate"],
  "notes": "Standard taverna portion ~350g. Macros from HHF published data."
}
```

**Acceptance gate:**
```bash
npm run evals:nutrition
# Must show: overall ≥90%, safety 100%, multilingual ≥90%, composite ≥90%
```

#### Task 1.7: Recalibrate Existing Benchmark Ranges

**Problem:** Some failing cases in the baseline have overly narrow or incorrect expected ranges. Codex already fixed some (commits `7328048`, `eb41f1d`), but the baseline file still has issues.

**File:** `agents/evals/food-parse-greek-colombian-golden.json`

**Action:** For each of the 17 failing cases, verify expected ranges against:
1. USDA FDC composition data
2. HHF published Greek recipe macros (PubMed 28731641)
3. Colombian Food Composition Tables (ICBF)
4. The actual values our pipeline returns (from `/tmp/eval-greek-colombian*.json` reports)

If the pipeline value is correct and the expected range is wrong, widen the range.
If the pipeline value is wrong, fix the pipeline (Tasks 1.1-1.5 above).

---

### PHASE 2: AI QUALITY & EVAL COVERAGE

**Depends on:** Phase 1 (nutrition accuracy must be ≥85% before starting this)

#### Task 2.1: RAG Eval Golden Set

**Files to create:**
- `agents/evals/datasets/rag-enterprise-v1.json`
- `agents/evals/run-rag-eval.ts`
- `tests/agents/rag-eval.test.ts`

**Requirements (from plan Task 7):**
- 20+ cases covering:
  - **Permission tests (5):** User A queries → must NOT see User B's knowledge chunks. Test with `requesterId` ≠ document `userId`.
  - **Relevance tests (5):** Query text → expected chunk ranked in top 3. Verify `hybrid_search_knowledge` returns correct documents.
  - **Citation tests (5):** Returned chunks must have correct `documentId`, `source`, `documentTitle`.
  - **No-answer tests (5):** Query about unknown topic → empty or very low score results.
  - **Groundedness tests (5):** Coach response grounded in returned RAG context, not hallucinated.

**File:** Create `agents/evals/datasets/rag-enterprise-v1.json`

**Verification:**
```bash
npm run evals:rag
# All 20+ cases must pass
```

#### Task 2.2: Memory Eval Golden Set

**Files to create:**
- `agents/evals/datasets/memory-enterprise-v1.json`
- `agents/evals/run-memory-eval.ts`
- `tests/agents/memory-eval.test.ts`

**Requirements (from plan Task 7):**
- 15+ cases covering:
  - **Write tests (5):** Conversation turn → verify correct fact extraction (fact_text, fact_type, scope, confidence)
  - **Read tests (5):** Query → verify relevant memory retrieved + priority ordering (allergy > goal > preference)
  - **Supersedence tests (5):** New contradicting fact → old fact must be marked `active: false`

**Critical fix needed:** `agents/memory/write.ts` does NOT check for contradictions before inserting. Add supersedence logic:
```typescript
// Before inserting new fact, check for existing contradicting facts
const existingFacts = await db.select().from(memoryChunks)
  .where(and(
    eq(memoryChunks.userId, userId),
    eq(memoryChunks.factType, newFact.factType),
    eq(memoryChunks.active, true),
    // Same topic/subject detection
  ));
// If contradiction detected, mark old fact as superseded
```

#### Task 2.3: Memory Write Durability

**Problem:** Memory writes use `after()` callback — fire-and-forget. If the write fails, facts are silently lost. No retry, no dead letter queue.

**Files (from plan Task 8):**
- Create: `db/schema/ai_jobs.ts`
- Create: `drizzle/0022_ai_jobs.sql`
- Modify: `app/api/ai/conversation/route.ts`

**Requirements:**
- Replace fire-and-forget `after()` with persisted job queue
- Jobs have states: `pending` → `processing` → `completed` | `failed` | `dead_letter`
- Bounded retries (3 max)
- Failed jobs visible in admin dashboard
- Track generation ID and cost per job

#### Task 2.4: Photo Analyze Eval

**Files to create:**
- `agents/evals/datasets/photo-enterprise-v1.json`
- `agents/evals/run-photo-eval.ts`

**Requirements:**
- 10+ cases with test food images
- Verify: item identification, portion estimation, macro accuracy
- Test: memory/RAG integration (photo analysis should know user's dietary goals)

#### Task 2.5: Citation in Coaching Prompt

**Problem:** `app/api/ai/conversation/route.ts` returns citation IDs in the JSON response, but the `SYSTEM_PROMPT` (line 21-23) doesn't instruct the model to reference knowledge sources.

**Fix:** Update SYSTEM_PROMPT to include:
```
When your response uses information from the knowledge context below, reference the source by its citation ID.
When you reference a user's memory (preference, allergy, goal), acknowledge it naturally.
```

---

### PHASE 3: B2B COMMERCIAL & COMPLIANCE

**Depends on:** Phase 2 (AI quality must have eval coverage before B2B features add complexity)

#### Task 3.1: Organization Lifecycle API

**Files (from plan Task 10):**
- Create: `db/schema/invitations.ts`
- Create: `app/api/organizations/route.ts` (POST: create, GET: list)
- Create: `app/api/organizations/[orgId]/route.ts` (GET, PATCH, DELETE)
- Create: `app/api/organizations/[orgId]/members/route.ts` (GET, POST, DELETE)
- Create: `app/api/invitations/route.ts` (POST: invite, GET: pending)
- Create: `app/api/invitations/[invitationId]/route.ts` (POST: accept, DELETE: revoke)
- Create: `drizzle/0023_organization_lifecycle.sql`
- Create: `e2e/b2b-organization-lifecycle.spec.ts`

**Requirements:**
- Create org, invite member (by email), accept invitation, revoke invitation
- Remove member, suspend org, transfer ownership, delete org
- Enforce roles: owner, admin, coach, member
- Plan limits enforced server-side (max members, max AI calls, max storage)
- Audit every privileged action to `audit_log`
- E2E test proving org isolation (User in Org A can't access Org B data)

#### Task 3.2: Stripe SaaS Billing

**Files (from plan Task 11):**
- Create: `db/schema/subscriptions.ts`
- Create: `app/api/billing/checkout/route.ts`
- Create: `app/api/billing/portal/route.ts`
- Create: `app/api/billing/webhooks/route.ts`
- Create: `drizzle/0024_subscriptions.sql`
- Create: `e2e/billing-test-mode.spec.ts`

**Requirements:**
- Stripe test-mode checkout flow
- Customer portal for self-service plan management
- Webhook handlers: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`
- Plan → entitlements mapping (coach seats, client slots, AI budget, storage)
- Server-side enforcement of plan limits
- Audit billing and entitlement changes
- Idempotent webhook processing

#### Task 3.3: Privacy Request Fulfillment

**Problem:** `app/api/privacy/requests/route.ts` handles intake but no fulfillment.

**Files (from plan Task 12):**
- Create: `app/api/privacy/process/route.ts`
- Create: `lib/privacy/export.ts`
- Create: `lib/privacy/delete.ts`
- Create: `lib/privacy/retention.ts`
- Create: `tests/privacy/fulfillment.test.ts`

**Requirements:**
- **Export:** Gather all user data (profile, food_logs, conversations, memories, knowledge, wearable data) → JSON/CSV → encrypted zip → presigned Supabase Storage URL → notify user → audit trail
- **Deletion:** Cascade-safe deletion respecting foreign keys → verify with count queries → audit trail
- **Correction:** Update user data with old/new audit event
- **Restriction:** Flag user data as restricted (processing paused) → audit trail
- **Due dates:** 30-day GDPR clock, automated alerts when approaching deadline
- **Consent withdrawal:** Mark consent as withdrawn, cascade effects on data processing

#### Task 3.4: HIPAA Scope Decision

**File (from plan Task 13):**
- Create: `docs/compliance/hipaa-scope-decision.md`

**Action:** Document explicit decision:
- If selling to US healthcare: require BAAs from Supabase, Anthropic, Google, Vercel, Voyage AI
- If not: document prohibited use, add product controls preventing PHI handling claims

---

### PHASE 4: PRODUCTION OPERATIONS & SECURITY

**Depends on:** Phase 3 (commercial features must work before load testing)

#### Task 4.1: Staging Environment

**Files (from plan Task 14):**
- Create: `.github/workflows/staging.yml`
- Create: `scripts/ops/backup-production.sh`
- Create: `scripts/ops/restore-drill.sh`

**Requirements:**
- Separate Vercel project for staging (linked to `staging` branch)
- Separate Supabase project for staging
- Restore drill: backup prod → restore to staging → verify schema + data + app health
- Record restore time and evidence
- Document in RUNBOOK.md

#### Task 4.2: SLOs, Alerts, Load Tests

**Files (from plan Task 15):**
- Create: `docs/slo.md`
- Create: `scripts/ops/load-test.js`
- Create: `scripts/ops/reconcile-ai-costs.ts`

**Requirements:**
- Define SLOs: 99.9% availability, p95 food parse <5s, p95 conversation <8s, 100% safety
- Load test staging: 50 concurrent users, 200 food parse calls, verify rate limiting and plan enforcement
- AI cost reconciliation: compare `agent_runs` totals with provider billing dashboards
- Alert on: safety rejection spikes, cost anomalies, privacy request deadlines, provider failures

#### Task 4.3: Security Verification

**Files (from plan Task 16):**
- Create: `docs/threat-model-platform.md`
- Create: `tests/security/tenant-isolation.test.ts`

**Requirements:**
- Run Supabase Security Advisor, resolve actionable findings
- OWASP API risks: test BOLA (object-level auth), BFLA (function-level auth), rate limiting, SSRF prevention
- Tenant isolation integration tests: prove User A/Org A can't access User B/Org B data across all surfaces (food_logs, conversations, memories, knowledge, agent_runs, audit_log)
- Secret scanning in CI
- Dependency audit: resolve or document npm advisories

---

### PHASE 5: PRODUCT PROOF & DOCUMENTATION

**Depends on:** Phases 1-4 all passing their gates

#### Task 5.1: Authenticated E2E Coverage

**Files (from plan Task 17):**
- Create: `e2e/nutrition-clarification.spec.ts`
- Create: `e2e/privacy-fulfillment.spec.ts`
- Modify: `e2e/authenticated-role-flows.spec.ts`

**Requirements:**
- Provision E2E accounts: client, coach, admin, super_admin
- All role flows pass in CI
- Coverage: ≥60% overall, ≥85% on auth, tenant, nutrition safety, AI runtime, RAG, billing, privacy modules

#### Task 5.2: Admin Dashboard Enhancements

**File to modify:** `app/api/admin/costs/route.ts`

**Missing fields (identified in deep audit):**
- `byOrganization` — cost breakdown per org
- `topUsers` — highest-cost users with task breakdown
- `modelBreakdown` — per-model spend, cache hit ratio, latency percentiles
- `p50/p99 latency` — from agent_runs data

#### Task 5.3: Documentation Reset

**Files (from plan Task 19):**
- Update: `README.md` — current architecture, not stale claims
- Update: `DEPLOYMENT.md` — current deployment process
- Update: `RUNBOOK.md` — incident response, rollback, key rotation
- Update: `SECURITY.md` — current security controls
- Create: `docs/enterprise-readiness.md` — evidence packet for B2B sales
- Archive: stale audit documents that contradict current state

---

## EXECUTION ORDER & CHECKPOINTS

```
CHECKPOINT 1: Nutrition Accuracy (Tasks 1.1-1.7)
├── Gate: npm run evals:nutrition → ≥90% overall, 100% safety, ≥90% multilingual
├── Gate: Greek/Colombian 30-case eval → ≥85% (up from 43%)
└── Gate: 260+ tests still passing, build clean

CHECKPOINT 2: AI Quality (Tasks 2.1-2.5)
├── Gate: RAG eval → 20/20 cases passing
├── Gate: Memory eval → 15/15 cases passing
├── Gate: Memory supersedence → contradictions detected and resolved
└── Gate: All live AI tasks have eval coverage

CHECKPOINT 3: B2B Commercial (Tasks 3.1-3.4)
├── Gate: Org lifecycle E2E → create/invite/accept/remove all pass
├── Gate: Stripe test-mode → checkout/portal/webhook all pass
├── Gate: Privacy fulfillment → export/delete/restrict all pass with audit trail
└── Gate: HIPAA scope documented

CHECKPOINT 4: Operations (Tasks 4.1-4.3)
├── Gate: Restore drill passes with documented RTO
├── Gate: Load test passes at 50 concurrent users
├── Gate: Tenant isolation integration tests pass
└── Gate: Zero high/critical security findings

CHECKPOINT 5: Product Proof (Tasks 5.1-5.3)
├── Gate: Authenticated E2E all passing in CI
├── Gate: Admin dashboard shows org/model/latency breakdowns
├── Gate: Documentation current and evidence-backed
└── Gate: 5 design partners onboarded (manual, post-deploy)
```

---

## CRITICAL PATHS & DEPENDENCIES

```
Task 1.1 (Greek foods DB) ──┐
Task 1.2 (Greek aliases)  ──┼── Task 1.6 (Expand eval) ── Task 1.7 (Recalibrate)
Task 1.3 (Greek units)    ──┘                                    │
Task 1.4 (Decompose fix)  ─────────────────────────────────────────┘
Task 1.5 (Structured output) ── independent, high impact

Task 2.1 (RAG eval)     ──┐
Task 2.2 (Memory eval)  ──┼── Checkpoint 2 gate
Task 2.3 (Memory durable)─┘
Task 2.4 (Photo eval)   ── independent
Task 2.5 (Citation)     ── independent

Task 3.1 (Org lifecycle)   ── Task 3.2 (Stripe billing)
Task 3.3 (Privacy fulfill) ── independent
Task 3.4 (HIPAA scope)    ── independent, document-only

Task 4.1 (Staging)  ── Task 4.2 (SLOs/load test)
Task 4.3 (Security) ── independent
```

---

## COMMANDS REFERENCE

```bash
# Run all unit tests
npx vitest run

# Run food parse accuracy tests specifically
npx vitest run tests/agents/food-parse.accuracy.test.ts

# Run enterprise invariant tests
npx vitest run tests/enterprise/invariants.test.ts

# Run nutrition release gate test
npx vitest run tests/agents/nutrition-release-gate.test.ts

# Run production Greek/Colombian eval (needs EVAL_AUTH_TOKEN)
EVAL_AUTH_TOKEN=<token> npx tsx scripts/eval/run-greek-colombian-prod.ts

# Run all evals (needs auth)
EVAL_AUTH_TOKEN=<token> npm run evals

# Apply new migration
npx drizzle-kit push

# Type check
npx tsc --noEmit

# Lint
npx next lint

# Build
npm run build

# Deploy preview
vercel --yes

# Deploy production (after preview verification)
vercel --prod --yes
```

---

## HONEST SCORING PROJECTION

| Milestone | Score | Evidence |
|---|---|---|
| Current (post-Codex deploy) | 72/100 | 43% nutrition eval, no RAG/memory eval, no B2B lifecycle |
| After Phase 1 (nutrition) | 82/100 | ≥90% nutrition eval, structured output, Greek coverage |
| After Phase 2 (AI quality) | 88/100 | RAG + memory + photo evals all passing, durable memory |
| After Phase 3 (B2B) | 93/100 | Org lifecycle, billing, privacy fulfillment all E2E |
| After Phase 4 (operations) | 96/100 | Staging, load test, security verification, restore drill |
| After Phase 5 (proof) | 98/100 | Full E2E, documentation, admin dashboard complete |
| 100/100 | 100/100 | 5 design partners + 30-day 99.9% availability soak |

**Note:** 100/100 requires 30 days of production soak data. It cannot be achieved in a single session.

---

## FILE INDEX (Quick Reference)

### Must Create
| File | Phase | Purpose |
|---|---|---|
| `drizzle/0019_seed_greek_food_database.sql` | 1.1 | 50+ Greek staple foods |
| `drizzle/0020_seed_greek_aliases.sql` | 1.2 | 100+ Greek name → food_id |
| `drizzle/0021_seed_greek_unit_conversions.sql` | 1.3 | Greek units + vague quantifiers |
| `agents/runtime/providers/structured.ts` | 1.5 | Structured output provider |
| `agents/evals/datasets/nutrition-enterprise-v1.json` | 1.6 | 150+ nutrition eval cases |
| `agents/evals/datasets/rag-enterprise-v1.json` | 2.1 | 20+ RAG eval cases |
| `agents/evals/datasets/memory-enterprise-v1.json` | 2.2 | 15+ memory eval cases |
| `agents/evals/run-rag-eval.ts` | 2.1 | RAG eval runner |
| `agents/evals/run-memory-eval.ts` | 2.2 | Memory eval runner |
| `agents/food-parse/confidence.ts` | 1.6 | Confidence routing logic |
| `db/schema/invitations.ts` | 3.1 | Org invitation schema |
| `db/schema/subscriptions.ts` | 3.2 | Stripe subscription schema |
| `db/schema/ai_jobs.ts` | 2.3 | Durable AI job queue |
| `lib/privacy/export.ts` | 3.3 | GDPR data export |
| `lib/privacy/delete.ts` | 3.3 | GDPR data deletion |

### Must Modify
| File | Phase | What to Change |
|---|---|---|
| `agents/food-parse/decompose.ts` | 1.4 | Category-aware fallback (not 200 kcal blanket) |
| `agents/food-parse/index.v4.ts` | 1.5 | Use structured provider, remove extractV4JSON |
| `agents/clients/google.ts` | 1.5 | Add response_schema support |
| `agents/clients/anthropic.ts` | 1.5 | Add tool_use structured output |
| `agents/memory/write.ts` | 2.2 | Add contradiction/supersedence detection |
| `app/api/ai/conversation/route.ts` | 2.3/2.5 | Durable jobs + citation prompt |
| `app/api/admin/costs/route.ts` | 5.2 | Add org/model/latency breakdowns |
| `agents/evals/food-parse-greek-colombian-golden.json` | 1.7 | Recalibrate ranges |

---

## NOTES FOR CODEX

1. **Do NOT combine auth changes with any other change.** Auth flow changes get their own preview cycle.
2. **Do NOT deploy without local preview first.** Max 3 Vercel deploys per session.
3. **Run `npx vitest run` after every significant change.** Current: 260 passing, 0 failing.
4. **The 43% eval baseline is the north star.** Every commit should improve this number.
5. **Greek food macros must come from authoritative sources.** USDA FDC or HelTH published data. Do NOT use LLM-generated nutrition values in seed data.
6. **Check HelTH/HHF license before ingestion.** If restricted, use USDA FDC only and note the limitation.
7. **Commit benchmark changes separately from engine changes.** So benchmark drift is reviewable.
8. **The conversation route at `app/api/ai/conversation/route.ts` is the most mature pipeline.** Use it as the reference for how memory + RAG + coaching should work.
9. **Production is live at trophe.app with real users.** Zero-risk changes only. Preview → smoke test → prod.
10. **Start with Phase 1 tasks 1.1-1.4 (data seeding + decompose fix).** These are highest impact-to-effort ratio.
