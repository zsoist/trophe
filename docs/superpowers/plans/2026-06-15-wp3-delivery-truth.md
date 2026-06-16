# WP3 Delivery Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make required repository checks mean the release evidence actually ran instead of silently skipping or weakening gates.

**Architecture:** WP3 is split into branch-enforceable gates and operator-owned repository settings. Branch-enforceable gates live as Vitest tests plus CI workflow hardening; operator-owned branch protection/ruleset settings are documented as a release checklist because they cannot be reliably enforced by files alone.

**Tech Stack:** GitHub Actions, Vitest, TypeScript, Next.js, Vercel, Dependabot, CODEOWNERS.

---

### Task 1: Add Delivery Governance Static Gate

**Files:**
- Create: `tests/enterprise/delivery-governance.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/nightly-eval.yml`
- Modify: `.github/workflows/provider-smoke.yml`
- Modify: `.github/CODEOWNERS`
- Modify: `.github/dependabot.yml`
- Modify: `vitest.config.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/enterprise/delivery-governance.test.ts` with assertions that required CI cannot allow skipped evals, cannot use permissive food readiness thresholds, has coverage thresholds, pins third-party Actions by SHA, covers high-risk paths in CODEOWNERS, and enables security updates in Dependabot.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: FAIL on current mutable Actions tags, `ALLOW_SKIPPED_EVALS`, permissive food thresholds, missing coverage thresholds, and incomplete governance metadata.

- [ ] **Step 3: Harden minimal config**

Update workflows and config to satisfy the test without changing prod settings: remove skipped-eval escape hatches from required CI, require all eval suites, set non-zero food readiness thresholds, add coverage thresholds, pin Actions to full commit SHAs, and expand CODEOWNERS/dependabot metadata.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add .github vitest.config.ts tests/enterprise/delivery-governance.test.ts docs/superpowers/plans/2026-06-15-wp3-delivery-truth.md && git commit -m "WP3 add delivery truth governance gate"`

### Task 2: Make Eval Skips Fail Loud

**Files:**
- Modify: `agents/evals/run-all.ts`
- Test: `tests/enterprise/delivery-governance.test.ts`

- [ ] **Step 1: Write failing static assertion**

Add an assertion that `agents/evals/run-all.ts` recognizes `EVAL_REQUIRE_ALL_SUITES` and exits non-zero when any required suite skips.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: FAIL because `EVAL_REQUIRE_ALL_SUITES` is absent.

- [ ] **Step 3: Implement minimal eval-runner behavior**

Add `const requireAllSuites = process.env.EVAL_REQUIRE_ALL_SUITES === '1';` and, after printing the summary, exit `1` when `requireAllSuites` and any suite is skipped.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add agents/evals/run-all.ts tests/enterprise/delivery-governance.test.ts && git commit -m "WP3 make required eval skips fail loud"`

### Task 3: Document Operator-Owned Delivery Controls

**Files:**
- Create: `docs/ops/wp3-delivery-truth.md`
- Modify: `.github/pull_request_template.md`
- Test: `tests/enterprise/delivery-governance.test.ts`

- [ ] **Step 1: Write failing static assertion**

Assert that the operator runbook names the non-file controls: protected `main`, required PR, required checks, review, conversation resolution, force-push/deletion block, Dependabot security updates, Actions allowlist, Vercel preview protection, and public-repo posture.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: FAIL because the WP3 operator runbook does not exist.

- [ ] **Step 3: Add the runbook and PR checklist**

Create `docs/ops/wp3-delivery-truth.md` and add the release-evidence checklist to `.github/pull_request_template.md`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add docs/ops/wp3-delivery-truth.md .github/pull_request_template.md tests/enterprise/delivery-governance.test.ts && git commit -m "WP3 document delivery truth operator gates"`

### Task 4: Full Verification

**Files:**
- No new files.

- [ ] **Step 1: Run focused governance tests**

Run: `npm test -- tests/enterprise/delivery-governance.test.ts tests/enterprise/invariants.test.ts tests/trust/public-claims.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static gates**

Run: `npm run typecheck && npm run lint -- --no-cache`

Expected: PASS with no lint errors.

- [ ] **Step 3: Run build**

Run: `npm run build`

Expected: PASS. Restore generated `public/sw.js` if it changes.

- [ ] **Step 4: Push PR branch**

Run: `git push -u origin remediation/wp3-delivery-truth`

Expected: branch pushed for independent review. No merge, prod migration, or deploy.
