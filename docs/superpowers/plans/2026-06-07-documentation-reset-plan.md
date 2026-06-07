# Trophe Documentation Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Trophe's overlapping and stale documentation with a small, current, verifiable documentation system for builders, operators, buyers, and auditors.

**Architecture:** Maintain one source-of-truth document per concern, generate inventories from code where practical, and archive historical plans separately from active operational truth. CI checks links, dates, environment names, routes, schema exports, and contradictions.

**Tech Stack:** Markdown, TypeScript documentation checks, GitHub Actions, repository metadata.

---

### Task 1: Inventory and Classify Every Document

**Files:**
- Create: `docs/DOCUMENTATION-INVENTORY.md`
- Create: `scripts/docs/inventory.ts`
- Test: `tests/docs/inventory.test.ts`

- [ ] Generate a list of every Markdown/PDF/design artifact with owner, audience, status, last-updated date, and replacement document.
- [ ] Classify each as `active`, `generated`, `historical`, `sales`, or `delete`.
- [ ] Fail CI when an active document lacks an owner or last-reviewed date.

### Task 2: Establish Active Source-of-Truth Documents

**Files:**
- Rewrite: `README.md`
- Rewrite: `ARCHITECTURE.md`
- Rewrite: `SECURITY.md`
- Rewrite: `DEPLOYMENT.md`
- Rewrite: `RUNBOOK.md`
- Rewrite: `BUSINESS.md`
- Rewrite: `ROADMAP.md`
- Create: `docs/AI-PLATFORM.md`
- Create: `docs/RAG.md`
- Create: `docs/B2B-READINESS.md`
- Create: `docs/COMPLIANCE.md`
- Create: `docs/SLOS.md`

- [ ] Make `README.md` the short navigation and onboarding entry point.
- [ ] Make `ARCHITECTURE.md` reflect only deployed and actively planned architecture.
- [ ] Document exact AI runtime, RAG retrieval, model policy, eval, cost, and data-retention behavior.
- [ ] Document B2B tenancy, billing, role, audit, export, deletion, and legal readiness.
- [ ] Replace checkbox-history roadmaps with a current Now/Next/Later roadmap.

### Task 3: Archive or Remove Stale Material

**Files:**
- Move historical docs to: `docs/archive/YYYY-MM/`
- Delete or archive: `TODO-NEXT.md`, old state/readiness reports, completed cutover plans, obsolete design handoffs, and duplicate agent descriptions.

- [ ] Preserve audit-relevant historical records under `docs/archive/`.
- [ ] Remove historical documents from active navigation and instructions.
- [ ] Delete generated reports that can be recreated and contain no audit value.
- [ ] Replace references to OpenBrain, old branches, old ports, old models, and nonexistent routes.

### Task 4: Generate Documentation from Code

**Files:**
- Create: `scripts/docs/generate-schema.ts`
- Create: `scripts/docs/generate-routes.ts`
- Create: `scripts/docs/generate-ai-policies.ts`
- Create: `docs/generated/`
- Modify: `package.json`

- [ ] Generate table/schema inventory from `db/schema/index.ts`.
- [ ] Generate route and auth-guard inventory from `app/api/`.
- [ ] Generate AI task/model/prompt/eval inventory from `agents/router/policies.ts`.
- [ ] Generate environment-variable inventory without values.
- [ ] Add `npm run docs:generate` and require a clean diff after generation in CI.

### Task 5: Add Documentation Quality Gates

**Files:**
- Create: `scripts/docs/verify.ts`
- Create: `tests/docs/verify.test.ts`
- Modify: `.github/workflows/ci.yml`

- [ ] Fail on broken internal links, stale active-doc review dates, contradictory database sources, unknown env variables, and references to deleted routes/files.
- [ ] Fail when AI policies, schema tables, or environment variables change without regenerated docs.
- [ ] Add a release checklist requiring documentation generation and review.

### Task 6: Create B2B Sales and Trust Materials

**Files:**
- Create: `docs/sales/PRODUCT-BRIEF.md`
- Create: `docs/sales/SECURITY-OVERVIEW.md`
- Create: `docs/sales/AI-TRANSPARENCY.md`
- Create: `docs/sales/IMPLEMENTATION-GUIDE.md`
- Create: `docs/sales/DESIGN-PARTNER-PROGRAM.md`

- [ ] Explain outcomes, workflows, data controls, AI limitations, support model, onboarding, and pricing assumptions without internal implementation noise.
- [ ] Create a buyer-facing security questionnaire response pack.
- [ ] Create a design-partner onboarding and feedback program with measurable success criteria.

### Task 7: Final Documentation Verification

- [ ] Run `npm run docs:generate`.
- [ ] Run `npm run docs:verify`.
- [ ] Run `npm run verify`.
- [ ] Confirm every active document is linked from `README.md`.
- [ ] Confirm all historical docs are clearly marked and isolated.

**Acceptance:** Active docs contain no known stale facts, generated inventories match code, CI prevents drift, and sales/trust materials are buyer-ready.
