# Trophe 100/100 Production and B2B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Trophe from the verified 80/100 baseline to a measurable 100/100 production and B2B launch gate, with live permission-aware RAG, unified AI execution, exact cost governance, reliable operations, and current documentation.

**Architecture:** Keep Supabase Postgres, Auth, RLS, and pgvector as the transactional source of truth. Route every model call through one server-only AI execution layer that handles policy selection, structured output, persistence, tracing, retries, usage reconciliation, budgets, and fallbacks. Expose RAG through tenant-aware retrieval functions and a persisted conversation/coach-insight product surface.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase Postgres/Auth/pgvector, Drizzle, Anthropic, Gemini, Voyage, Langfuse, Vitest, Playwright, GitHub Actions, Vercel.

---

## Definition of 100/100

Trophe reaches 100 only when every gate below is evidenced:

| Gate | Required evidence |
|---|---|
| Product | Five external coaches complete onboarding and weekly client review without operator DB intervention |
| Security | Zero high/critical findings; all tenant and RAG permission tests pass |
| Reliability | 99.9% measured API availability over 30 days; restore drill passes |
| AI quality | Every live AI task has versioned evals and a passing release threshold |
| Cost | 100% of model calls persisted with provider-reported usage and organization attribution |
| Testing | At least 60% lines overall, 85% on auth/tenant/AI-cost/RAG code, all authenticated E2E running |
| B2B | Organization provisioning, billing test mode, data export/deletion, audit trail, and legal documents ready |
| Operations | Staging, production canary, alerts, runbooks, backups, and rollback exercises verified |
| Documentation | Current source-of-truth docs generated; stale docs archived or removed |

## Program Sequence

### Program 0: Stabilize and Deploy the Reviewed Baseline

**Files:**
- Modify: `drizzle/0009_canonical_schema_reconciliation.sql`
- Modify: `.github/workflows/ci.yml`
- Modify: `DEPLOYMENT.md`
- Test: `tests/enterprise/invariants.test.ts`

- [ ] Create a review branch from `main` and commit the current reviewed changes without unrelated local artifacts.
- [ ] Run `npm run db:bootstrap`, `npm run verify`, `npm run test:e2e`, and `npm run readiness:integrations`.
- [ ] Apply migrations through the Supabase session pooler and run `npm run db:verify` against production.
- [ ] Deploy to Vercel production and verify the production canary, auth redirect regression, Spike health response, and food search.
- [ ] Run a fresh GitHub CI build and require green status before beginning Program 1.

**Acceptance:** Current fixes are deployed, production is verified, and main CI is green.

### Program 1: Build the Unified AI Execution Layer

**Files:**
- Create: `agents/runtime/types.ts`
- Create: `agents/runtime/execute.ts`
- Create: `agents/runtime/providers/{anthropic,google,voyage}.ts`
- Create: `agents/runtime/cost.ts`
- Create: `agents/runtime/budget.ts`
- Create: `agents/runtime/persistence.ts`
- Modify: `agents/router/policies.ts`
- Modify: all live AI routes under `app/api/ai/` and `app/api/food/`
- Modify: `db/schema/agent_runs.ts`
- Test: `tests/agents/runtime/*.test.ts`

- [ ] Extend `agent_runs` with `organization_id`, `generation_id`, `request_id`, `prompt_version`, `provider_generation_id`, `status`, `fallback_from`, `actual_cost_usd`, `estimated_cost_usd`, `reasoning_tokens`, and `cached_tokens`.
- [ ] Create a generation record before every provider call with status `pending`.
- [ ] Implement one `executeAiTask()` contract that validates input, checks budget, selects policy, invokes provider, validates structured output, persists usage/output/error, and emits Langfuse metadata.
- [ ] Replace route-level direct provider `fetch()` calls with `executeAiTask()`.
- [ ] Make provider usage authoritative; use pricing estimates only when providers do not return cost.
- [ ] Add retry rules only for transient errors, with idempotency keys and bounded provider fallback.
- [ ] Add prompt/model/version hashes so every result is reproducible and comparable.
- [ ] Add redaction rules before prompts or outputs reach Langfuse.
- [ ] Add per-task timeout, max input size, max tokens, cost ceiling, and fallback behavior to policies.
- [ ] Add contract tests that prove every live AI route creates exactly one completed or failed generation record.

**Acceptance:** No live route calls a model outside the runtime; every call has a durable generation ID and exact organization/user/task attribution.

### Program 2: Make RAG and Memory Fully Live

**Files:**
- Create: `db/schema/knowledge_documents.ts`
- Create: `db/schema/knowledge_chunks.ts`
- Create: `agents/rag/retrieve.ts`
- Create: `agents/rag/ingest.ts`
- Create: `agents/rag/context.ts`
- Create: `app/api/ai/coach-insight/route.ts`
- Create: `app/api/ai/conversation/route.ts`
- Modify: `agents/memory/read.ts`
- Modify: `agents/memory/write.ts`
- Modify: `db/schema/memory_chunks.ts`
- Modify: `app/coach/client/[id]/memory/page.tsx`
- Test: `tests/agents/rag/*.test.ts`
- Test: `tests/db/rag-rls.test.ts`

- [ ] Add organization-aware documents and chunks with source, version, checksum, classification, consent basis, retention date, FTS column, and embedding.
- [ ] Create RLS policies that enforce user, coach assignment, and organization boundaries during retrieval.
- [ ] Implement a Postgres hybrid-search RPC using keyword search, vector search, and reciprocal-rank fusion.
- [ ] Add HNSW cosine indexes matching Voyage embedding dimensions and query operators.
- [ ] Add ingestion jobs with deterministic chunking, content hashing, re-embedding, tombstones, and retry status.
- [ ] Upgrade memory retrieval to filter session and agent scopes correctly; currently those optional filters are incomplete.
- [ ] Validate extracted memory facts with Zod before database writes.
- [ ] Add citations to every RAG-generated response, including chunk IDs and source timestamps.
- [ ] Build the live coach-insight endpoint using client data, coach blocks, memory, and approved knowledge documents.
- [ ] Build a persisted conversation endpoint that reads RAG context before generation and writes memories asynchronously after successful turns.
- [ ] Add retrieval evals: permission isolation, citation correctness, context relevance, answer groundedness, and no-answer behavior.

**Acceptance:** RAG is used by live coach insight and conversation flows, every answer is cited, and cross-tenant retrieval tests prove isolation.

### Program 3: Establish AI Quality, Efficiency, and Cost Governance

**Files:**
- Create: `agents/evals/datasets/`
- Create: `agents/evals/release-gate.ts`
- Create: `scripts/ops/reconcile-ai-costs.ts`
- Create: `scripts/ops/check-ai-budgets.ts`
- Modify: `app/api/admin/costs/route.ts`
- Modify: `app/admin/costs/page.tsx`
- Modify: `.github/workflows/ci.yml`
- Test: `tests/agents/evals/*.test.ts`

- [ ] Define eval datasets and release thresholds for every live task: parsing, recipes, meal suggestions, photo analysis, coach insights, memory extraction, and RAG answers.
- [ ] Track quality, latency, tokens, actual cost, cache hit rate, fallback rate, and failure rate by prompt version/model/org.
- [ ] Add shadow evaluation for model or prompt changes before promoting policies.
- [ ] Add a policy registry with `active`, `candidate`, and `rollback` versions.
- [ ] Add organization and user monthly budgets, request ceilings, and graceful degraded behavior.
- [ ] Reconcile `agent_runs` daily against provider or gateway usage where available.
- [ ] Add alerts for spend anomalies, missing usage records, high fallback rate, and quality regression.
- [ ] Add semantic/prompt caching only for non-personal deterministic tasks; never cache tenant-sensitive answers across users.
- [ ] Evaluate Vercel AI Gateway in staging for unified routing, provider fallbacks, usage lookup, and zero-data-retention. Adopt only if it improves measured reliability and cost visibility without weakening data controls.
- [ ] Block releases when eval thresholds, cost ceilings, or usage-persistence invariants fail.

**Acceptance:** AI changes are promoted through measured evals; 100% of calls are cost-attributed; budgets prevent runaway spend.

### Program 4: Finish B2B Multi-Tenancy and Commercial Readiness

**Files:**
- Create: `db/schema/subscriptions.ts`
- Create: `db/schema/invitations.ts`
- Create: `db/schema/consents.ts`
- Create: `db/schema/data_requests.ts`
- Create: `app/api/billing/`
- Create: `app/api/organizations/`
- Create: `app/admin/audit/`
- Modify: `lib/auth/tenant-access.ts`
- Modify: `app/admin/orgs/page.tsx`
- Test: `tests/db/organization-isolation.test.ts`
- Test: `e2e/b2b-role-flows.spec.ts`

- [ ] Define organization lifecycle: create, invite, accept, remove, suspend, transfer ownership, and delete.
- [ ] Enforce organization IDs on all commercial, AI-cost, audit, and knowledge records.
- [ ] Add organization-scoped roles instead of relying only on global profile roles.
- [ ] Add immutable audit events for privileged reads, exports, role changes, billing actions, and AI policy changes.
- [ ] Implement Stripe test-mode subscriptions for Trophe SaaS billing before considering Stripe Connect marketplace flows.
- [ ] Enforce plan limits server-side for coaches, clients, storage, AI spend, and premium features.
- [ ] Implement customer-visible usage, invoices, plan status, and upgrade/downgrade paths.
- [ ] Implement GDPR-style export, deletion, retention, consent, and processor records.
- [ ] Produce legal launch checklist: Terms, Privacy Policy, DPA, AI disclaimer, nutrition/medical disclaimer, subprocessors, and incident contacts.
- [ ] Run five-coach design-partner onboarding and record blockers as launch-gate issues.

**Acceptance:** A new organization can subscribe in test mode, invite coaches, manage clients, see usage, export/delete data, and remain isolated from every other organization.

### Program 5: Production Operations, Security, and Scale

**Files:**
- Create: `scripts/ops/backup-production.sh`
- Create: `scripts/ops/restore-drill.sh`
- Create: `scripts/ops/load-test.js`
- Create: `.github/workflows/backup.yml`
- Create: `.github/workflows/staging.yml`
- Modify: `vercel.json`
- Modify: `SECURITY.md`
- Modify: `RUNBOOK.md`

- [ ] Upgrade Supabase to a non-pausing production plan before paid B2B usage.
- [ ] Enable and verify backups; define RPO/RTO and perform a restore-to-new-project drill.
- [ ] Enable SSL enforcement, network restrictions where compatible, MFA enforcement, and multiple Supabase owners.
- [ ] Add staging with separate Supabase and Vercel environments.
- [ ] Replace in-memory rate limits with a distributed limiter and organization-aware quotas.
- [ ] Add Vercel WAF/rate rules for signup, auth, AI, seed, admin, and webhook endpoints.
- [ ] Add runtime log and trace drains with PII redaction.
- [ ] Add SLOs and alerts for API availability, p95 latency, error rate, DB saturation, auth failures, model failures, and spend.
- [ ] Load test staging with realistic client, coach, and AI traffic.
- [ ] Configure authenticated E2E credentials and execute all role flows in CI.
- [ ] Raise coverage gates progressively to 60% overall and 85% on critical modules.
- [ ] Perform incident, rollback, key-rotation, and restore tabletop exercises.

**Acceptance:** Restore drill, load test, security checklist, authenticated E2E, and operational alerts pass before a paid customer is onboarded.

### Program 6: Documentation Reset and Sales Enablement

Execute the companion plan:

`docs/superpowers/plans/2026-06-07-documentation-reset-plan.md`

**Acceptance:** Every active document is current, generated where possible, linked from `README.md`, and stale material is archived or removed.

## Research-Backed Decisions

- Keep hot, relational, permission-aware RAG in Supabase pgvector. Supabase recommends pgvector for transactional and relational vector workloads, with RLS applied during retrieval.
- Use hybrid search with keyword + vector retrieval and reciprocal-rank fusion, rather than semantic-only retrieval.
- Do not move to Supabase Vector Buckets yet; they are public alpha and intended for millions of vectors or archival tiers.
- Require backups and restore drills. Supabase explicitly recommends logical exports for free projects and provides daily backups on paid plans.
- Evaluate, but do not blindly adopt, Vercel AI Gateway. It offers provider fallback, budgets, usage lookup, cost visibility, and ZDR routing, but Trophe must keep its own durable `agent_runs` ledger.

## Final Release Checklist

- [ ] Programs 0-6 accepted
- [ ] All migration, security, unit, integration, eval, and E2E gates green
- [ ] Production restore and rollback drills passed
- [ ] Five design partners complete success criteria
- [ ] Legal and billing launch checklist signed off
- [ ] Final engineering review scores every category at its defined target

## Sources

- [Supabase Production Checklist](https://supabase.com/docs/guides/platform/going-into-prod/)
- [Supabase Hybrid Search](https://supabase.com/docs/guides/ai/hybrid-search)
- [Supabase RAG with Permissions](https://supabase.com/docs/guides/ai/rag-with-permissions)
- [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
- [Vercel AI Gateway](https://vercel.com/docs/ai-gateway/)
- [Vercel AI Gateway Usage and Billing](https://vercel.com/docs/ai-gateway/capabilities/usage)
- [Vercel AI Gateway Zero Data Retention](https://vercel.com/docs/ai-gateway/zdr)
