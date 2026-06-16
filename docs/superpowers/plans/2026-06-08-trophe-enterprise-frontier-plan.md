# Trophē Enterprise Frontier Implementation Plan

> **HISTORICAL (planned 2026-06-08) — SUPERSEDED.** This is a point-in-time plan. The "Current Verified Baseline" and benchmark numbers below reflect 2026-06-08 state and are stale. Notes: AI text = 100% DeepSeek V4 Flash (NO Gemini; Anthropic is vision-only) — ignore the "Anthropic, Gemini" tech-stack and "Use Gemini…/Anthropic tool use" task lines. The ~43% multilingual eval is obsolete (now 549-set ~90% / 700-set 76.7% / macro-MAPE 16.0%). WP0–WP3 are DONE + LIVE; WP4–WP7 pending. For current state see docs/audits/remediation-status-2026-06-15.md and docs/audits/enterprise-readiness-2026-06-13.md.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Trophē from a deployed, hardened product to an evidence-backed enterprise B2B nutrition platform with frontier-grade nutrition accuracy, tenant isolation, AI quality, compliance execution, and production operations.

**Architecture:** Keep Supabase Postgres/Auth/RLS/pgvector as the transactional and permission-aware source of truth. Treat nutrition as a provenance-first deterministic system: language model extraction may identify foods and portions, but authoritative databases, reviewed recipes, unit conversions, plausibility checks, and confidence routing determine nutrition values. Treat “100/100” as a release score earned only when every measurable gate below passes.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres/Auth/Storage/pgvector, Drizzle, Anthropic, Gemini, Voyage, Langfuse, Vitest, Playwright, Stripe Billing, Vercel.

---

## Current Verified Baseline

- `main` is deployed to `https://trophe.app`.
- Production Supabase contains governed AI runtime, RAG, memory, privacy requests, organization budgets, and durable rate-limit tables.
- Typecheck, lint, production build, and 254 tests pass.
- Production canary and DB verification pass.
- Recipe-analyze and coach-insight live evals pass 6/6.
- Authenticated client E2E passes; coach/admin E2E credentials are not configured.
- The multilingual Greek/Colombian production nutrition eval is approximately 43%, which is the largest product-quality blocker.
- Privacy request intake exists, but fulfillment automation does not.
- Organization lifecycle, billing, plan enforcement, restore drill, load testing, and 30-day SLO evidence are incomplete.

## Definition of 100/100

| Domain | Required release evidence |
|---|---|
| Nutrition safety | Zero implausible values; every result has provenance, confidence, food state, and portion basis |
| Nutrition quality | ≥95% deterministic/base-food accuracy, ≥90% composite-meal accuracy, ≥90% multilingual end-to-end accuracy on ≥150 reviewed cases |
| AI quality | Every live AI task has versioned evals, thresholds, groundedness/no-answer tests, and rollback policy |
| Multi-tenancy | Cross-tenant isolation tests pass for every commercial, RAG, memory, cost, audit, and export surface |
| Security | Zero high/critical findings; OWASP API and LLM threat-model controls verified |
| Compliance | Export, deletion, restriction, consent withdrawal, retention, audit, DPA/subprocessor records, and incident workflow verified |
| B2B commercial | Self-service org provisioning, invitations, plan limits, Stripe test subscriptions, invoices, and usage views pass E2E |
| Reliability | Restore drill passes; staging load test passes; 99.9% availability measured for 30 days |
| Cost | 100% AI calls attributed to org/user/task/model; provider reconciliation and anomaly alerts pass |
| Delivery | Main CI, authenticated E2E, migration verification, canary, rollback, and documentation gates are mandatory |

## Program 1: Frontier Nutrition Engine

### Task 1: Establish a reviewed nutrition benchmark

**Files:**
- Create: `agents/evals/datasets/nutrition-enterprise-v1.json`
- Create: `agents/evals/nutrition-release-gate.ts`
- Create: `tests/agents/nutrition-release-gate.test.ts`
- Modify: `package.json`

- [ ] Define at least 150 reviewed cases: 50 Greek, 40 Colombian/Latin, 40 English/USDA, 20 adversarial and ambiguity cases.
- [ ] Store expected food identity, state, portion grams/range, nutrient ranges, accepted source classes, and whether clarification is required.
- [ ] Separate metrics for identification, portion accuracy, calories, macros, composites, and abstention.
- [ ] Make `npm run evals:nutrition` fail below: 95% base foods, 90% composites, 90% multilingual, 100% safety/abstention.
- [ ] Commit benchmark changes separately from engine changes so benchmark drift is reviewable.

### Task 2: Add provenance and food-state contracts

**Files:**
- Modify: `db/schema/foods.ts`
- Modify: `db/schema/dish_recipes.ts`
- Create: `db/schema/nutrition_reviews.ts`
- Create: `drizzle/0019_nutrition_provenance.sql`
- Modify: `agents/food-parse/index.v4.ts`
- Test: `tests/agents/nutrition-provenance.test.ts`

- [ ] Add source dataset/version, source URL/ID, analytical/label/estimated method, edible portion basis, food state, review status, reviewer, review date, and uncertainty fields.
- [ ] Require every returned nutrition item to include source class, source ID, confidence, portion basis, and state.
- [ ] Reject unpublished or unreviewed estimated recipes from high-confidence output.
- [ ] Add audit events for nutrition review and override actions.

### Task 3: Replace free-form extraction with structured provider output

**Files:**
- Modify: `agents/runtime/providers/text.ts`
- Create: `agents/runtime/providers/structured.ts`
- Modify: `agents/food-parse/index.v4.ts`
- Modify: `agents/food-parse/decompose.ts`
- Test: `tests/agents/food-parse-structured-output.test.ts`

- [ ] Define a strict Zod schema for food identity, localized name, quantity, unit, qualifier, food state, and ambiguity.
- [ ] Use Gemini response schema/tool output for food parse and Anthropic tool use for decomposition.
- [ ] Remove regex JSON extraction from production paths.
- [ ] Retry one transient/invalid structured response, then ask for clarification or fail safely.
- [ ] Add code-switch, malformed output, and partial-response regression tests.

### Task 4: Implement portion and unit ontology

**Files:**
- Create: `agents/food-parse/portion-ontology.ts`
- Modify: `agents/food-parse/lookup.ts`
- Modify: `agents/food-parse/index.v4.ts`
- Create: `drizzle/0020_multilingual_portion_ontology.sql`
- Test: `tests/agents/portion-ontology.test.ts`

- [ ] Normalize metric mass/volume before any recipe or default-serving lookup.
- [ ] Add Greek, Spanish, and English units, abbreviations, vague quantifiers, and food-specific serving ranges.
- [ ] Track whether a conversion is authoritative, reviewed, inferred, or ambiguous.
- [ ] Ask a clarification question when portion uncertainty materially changes calories/macros beyond configured thresholds.
- [ ] Enforce mass balance and Atwater plausibility checks before returning results.

### Task 5: Build reviewed regional food and recipe coverage

**Files:**
- Create: `scripts/ingest/greek-reviewed-foods.ts`
- Create: `scripts/ingest/colombian-reviewed-foods.ts`
- Create: `scripts/ingest/reviewed-recipes.ts`
- Create: `drizzle/0021_reviewed_regional_nutrition.sql`
- Test: `tests/agents/regional-food-coverage.test.ts`

- [ ] License-check HelTH/HHF before ingestion; do not scrape or ship restricted data.
- [ ] Prefer USDA Foundation/FNDDS/SR for generic foods and reviewed regional sources for traditional recipes.
- [ ] Seed aliases, state qualifiers, and reviewed food-specific portions.
- [ ] Replace blanket ingredient fallback estimates with clarification or explicit low-confidence estimation.
- [ ] Require dual-source or expert review for flagship regional recipes used in high-confidence results.

### Task 6: Improve retrieval and ambiguity routing

**Files:**
- Modify: `agents/food-parse/lookup.ts`
- Create: `agents/food-parse/confidence.ts`
- Create: `agents/food-parse/clarification.ts`
- Test: `tests/agents/food-confidence-routing.test.ts`

- [ ] Rank exact aliases, food state, regional match, reviewed quality, and portion availability ahead of vector similarity.
- [ ] Penalize frozen/processed/branded variants when the request implies a generic fresh food.
- [ ] Return clarification choices for low-margin top candidates or materially different portions.
- [ ] Never silently substitute an unrelated recipe cache hit.

## Program 2: AI/RAG Quality and Safety

### Task 7: Add complete AI eval registry

**Files:**
- Create: `agents/evals/registry.ts`
- Create: `agents/evals/datasets/{rag,memory,photo,meal-suggest,conversation}.json`
- Create: `agents/evals/release-gate.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Register every live task with quality, latency, cost, safety, and groundedness thresholds.
- [ ] Add RAG relevance, citation, permission, groundedness, and no-answer cases.
- [ ] Add memory write/read/supersedence/contradiction cases.
- [ ] Add photo-calibration and meal-suggestion allergy/preference cases.
- [ ] Block policy/model/prompt promotion when any task threshold regresses.

### Task 8: Make asynchronous AI work durable

**Files:**
- Create: `db/schema/ai_jobs.ts`
- Create: `drizzle/0022_ai_jobs.sql`
- Create: `agents/jobs/worker.ts`
- Modify: `app/api/ai/conversation/route.ts`
- Test: `tests/agents/ai-jobs.test.ts`

- [ ] Replace fire-and-forget memory writes with persisted idempotent jobs.
- [ ] Add bounded retries, dead-letter status, operator replay, and failure alerts.
- [ ] Implement contradiction detection and memory supersedence.
- [ ] Track job cost and generation IDs.

### Task 9: Harden AI privacy and security

**Files:**
- Create: `docs/threat-model-ai.md`
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/rag/context.ts`
- Test: `tests/security/ai-threat-model.test.ts`

- [ ] Apply NIST AI RMF and OWASP LLM/API controls to prompt injection, sensitive disclosure, excessive agency, resource consumption, and unsafe upstream data.
- [ ] Enforce tenant-aware prompt/context redaction and no cross-tenant caching.
- [ ] Evaluate Vercel AI Gateway in staging only; adopt ZDR routing and usage reconciliation only if data controls and latency improve.
- [ ] Add prompt-injection and poisoned-document test suites.

## Program 3: B2B Commercial and Compliance

### Task 10: Complete organization lifecycle

**Files:**
- Create: `db/schema/invitations.ts`
- Create: `app/api/organizations/`
- Create: `app/api/invitations/`
- Create: `drizzle/0023_organization_lifecycle.sql`
- Test: `e2e/b2b-organization-lifecycle.spec.ts`

- [ ] Implement create, invite, accept, revoke, remove, suspend, transfer ownership, and delete.
- [ ] Enforce organization roles and plan limits server-side.
- [ ] Audit every privileged organization action.
- [ ] Prove organization isolation with live DB integration tests.

### Task 11: Implement Stripe SaaS billing

**Files:**
- Create: `db/schema/subscriptions.ts`
- Create: `app/api/billing/`
- Create: `app/admin/billing/`
- Create: `drizzle/0024_subscriptions.sql`
- Test: `e2e/billing-test-mode.spec.ts`

- [ ] Implement Stripe test-mode checkout, portal, webhooks, entitlements, and idempotency.
- [ ] Map plans to coach/client/storage/AI limits and enforce them server-side.
- [ ] Display subscription, invoices, usage, and limits to organization admins.
- [ ] Audit billing and entitlement changes.

### Task 12: Fulfill privacy requests

**Files:**
- Create: `app/api/privacy/process/route.ts`
- Create: `lib/privacy/export.ts`
- Create: `lib/privacy/delete.ts`
- Create: `lib/privacy/retention.ts`
- Test: `tests/privacy/fulfillment.test.ts`

- [ ] Export all user-owned data into an encrypted, expiring artifact with an audited access link.
- [ ] Implement deletion/anonymization respecting legal retention and referential integrity.
- [ ] Implement restriction and correction workflows.
- [ ] Add due-date alerts, operator queue, completion evidence, and immutable audit events.
- [ ] Publish DPA, privacy policy, AI/nutrition disclaimer, subprocessors, incident contact, and retention schedule.

### Task 13: Decide HIPAA market scope

**Files:**
- Create: `docs/compliance/hipaa-scope-decision.md`
- Create: `docs/compliance/vendor-baa-matrix.md`

- [ ] Decide whether Trophē will sell to HIPAA covered entities/business associates.
- [ ] If yes, require BAAs and verified eligible plans for every cloud/model/subprocessor handling PHI.
- [ ] If no, document prohibited use, sales qualification, and product controls preventing unsupported claims.

## Program 4: Production Operations and Security

### Task 14: Establish staging, backups, and restore evidence

**Files:**
- Create: `.github/workflows/staging.yml`
- Create: `.github/workflows/backup.yml`
- Create: `scripts/ops/backup-production.sh`
- Create: `scripts/ops/restore-drill.sh`
- Modify: `RUNBOOK.md`

- [ ] Create isolated staging Vercel and Supabase environments.
- [ ] Confirm Supabase production plan, backups, and PITR/RPO/RTO requirements.
- [ ] Produce encrypted off-site logical backups in addition to provider backups.
- [ ] Restore into a separate project and run schema/data/application verification.
- [ ] Record restore time and evidence; repeat quarterly.

### Task 15: Add SLOs, alerts, load tests, and reconciliation

**Files:**
- Create: `docs/slo.md`
- Create: `scripts/ops/load-test.js`
- Create: `scripts/ops/reconcile-ai-costs.ts`
- Create: `scripts/ops/check-alerts.ts`
- Modify: `vercel.json`

- [ ] Define availability, latency, error, nutrition-quality, AI-quality, cost, and queue-lag SLOs.
- [ ] Alert on burn rate, provider failures, DB saturation, missing cost attribution, privacy deadlines, and nutrition safety rejection spikes.
- [ ] Load test staging with realistic client/coach/AI traffic and prove plan-limit/rate-limit behavior.
- [ ] Reconcile provider/gateway usage against `agent_runs` daily.
- [ ] Complete rollback, incident, key-rotation, and provider-outage exercises.

### Task 16: Complete security verification

**Files:**
- Create: `docs/threat-model-platform.md`
- Create: `tests/security/tenant-isolation.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Run Supabase Security and Performance Advisors and resolve actionable findings.
- [ ] Test OWASP API risks: object/function authorization, resource consumption, sensitive flows, SSRF, misconfiguration, inventory, and unsafe upstream APIs.
- [ ] Add secret scanning, dependency policy, SAST, migration lint, and RLS verification to CI.
- [ ] Require MFA and least privilege for production operators.

## Program 5: Product Proof and Documentation

### Task 17: Complete authenticated E2E and coverage

**Files:**
- Modify: `e2e/authenticated-role-flows.spec.ts`
- Create: `e2e/nutrition-clarification.spec.ts`
- Create: `e2e/privacy-fulfillment.spec.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Provision dedicated client, coach, admin, and super-admin E2E accounts.
- [ ] Run all role, organization, billing, privacy, RAG, and nutrition flows in CI.
- [ ] Reach 60% overall line coverage and 85% on auth, tenant, nutrition safety, AI runtime, RAG, billing, and privacy modules.

### Task 18: Run design-partner and soak gates

**Files:**
- Create: `docs/launch/design-partner-scorecard.md`
- Create: `docs/launch/production-soak-report.md`

- [ ] Onboard five external coaching organizations without direct DB intervention.
- [ ] Measure onboarding completion, weekly review completion, nutrition corrections, support incidents, and willingness to pay.
- [ ] Complete a 30-day production soak with ≥99.9% measured availability and no unresolved severity-one incidents.
- [ ] Do not claim 100/100 before both gates pass.

### Task 19: Reset documentation and sales evidence

**Files:**
- Modify: `README.md`
- Modify: `DEPLOYMENT.md`
- Modify: `RUNBOOK.md`
- Modify: `SECURITY.md`
- Create: `docs/enterprise-readiness.md`
- Archive: stale audit/plan documents after extracting still-valid findings

- [ ] Generate a current architecture map, data-flow map, RLS matrix, AI task registry, nutrition provenance policy, and operational ownership matrix.
- [ ] Remove or archive stale claims that contradict deployed state.
- [ ] Produce an enterprise security/compliance packet with verified evidence and explicit limitations.

## Execution Order and Checkpoints

1. **Nutrition safety checkpoint:** Tasks 1-6; release only when safety is 100% and multilingual quality is ≥90%.
2. **AI quality checkpoint:** Tasks 7-9; release only when every live task has passing evals and rollback policy.
3. **Commercial checkpoint:** Tasks 10-13; release only when full B2B lifecycle and compliance fulfillment pass E2E.
4. **Operations checkpoint:** Tasks 14-16; release only after restore/load/security exercises pass.
5. **Market-proof checkpoint:** Tasks 17-19; award 100/100 only after authenticated CI, five design partners, and 30-day soak.

## Research Basis

- USDA FoodData Central distinguishes data types and warns that portion weights are unique to their source data type; use authoritative composition plus source-specific edible portions.
- FAO/INFOODS requires harmonized food matching, unit conversion, data quality evaluation, and pre-publication checks.
- Supabase production guidance requires RLS, Security/Performance Advisors, load testing, backups, and PITR where lower RPO is required.
- Vercel AI Gateway offers usage lookup, observability, and enforceable ZDR routing; it remains an optional staging evaluation, not a replacement for Trophē's ledger.
- OWASP API Security emphasizes authorization, resource consumption, sensitive business flows, SSRF, misconfiguration, inventory, and unsafe upstream API consumption.
- NIST AI RMF Generative AI Profile provides the governance basis for AI risk identification, measurement, management, and monitoring.
- HHS guidance requires a BAA when a cloud/software provider handles PHI on behalf of a covered entity or business associate; Trophē must make an explicit market-scope decision before claiming HIPAA readiness.

