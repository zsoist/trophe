# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate in-scope P0/P1 security defects and add regression guards for AI routes, secrets, error redaction, and production-mutation boundaries.

**Architecture:** Static repository invariants catch unsafe source patterns, route contract tests exercise authorization and redaction, and live production checks remain read-only. Findings are evidence-cited and sanity-checked before fixes.

**Tech Stack:** Vitest 4, Next.js route handlers, Supabase SSR auth, repository source scanners.

## Global Constraints

- Provider spend is USD $0.00.
- Production is read-only.
- No database migrations, production mutations, merge, or deployment.
- Do not print or persist environment-variable values.
- Fix P0/P1 findings test-first; report lower-severity findings separately.

---

### Task 1: Build an authoritative AI-route security inventory

**Files:**
- Create: `tests/enterprise/ai-route-security.test.ts`
- Create: `lib/security/ai-route-inventory.ts`

**Interfaces:**
- Produces: `discoverAiRouteFiles(root): string[]`
- Produces: `analyzeAiRouteSource(source): AiRouteSecurityFinding[]`

- [ ] **Step 1: Write failing invariant tests**

Discover route files containing `executeAiTask`, `invokeStructuredProvider`,
`invokeTextProvider`, `callAnthropicMessages`, or `invokeOpenAiStructured`.
Assert every discovered public route awaits `guardAiRoute(request)` before the
provider call and obtains user identity from the guard result.

- [ ] **Step 2: Prove red or establish the current baseline**

```bash
npx vitest run tests/enterprise/ai-route-security.test.ts --reporter=verbose
```

If all routes already comply, the new invariant is still the deliverable.

- [ ] **Step 3: Implement the source analyzer**

Return findings with `file`, `rule`, and `line`. Rules are:

```ts
type AiRouteSecurityRule =
  | 'missing-guard'
  | 'guard-not-awaited'
  | 'provider-before-guard'
  | 'unverified-user-id';
```

- [ ] **Step 4: Fix any discovered route violation**

Use the shared `guardAiRoute`; do not decode JWTs or add route-local auth logic.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/enterprise/ai-route-security.test.ts tests/lib/api-guard.test.ts --reporter=verbose
git add lib/security/ai-route-inventory.ts tests/enterprise/ai-route-security.test.ts app/api
git commit -m "test(security): enforce AI route authorization"
```

### Task 2: Guard server-only secrets and dangerous source patterns

**Files:**
- Modify: `tests/enterprise/invariants.test.ts`
- Create: `scripts/ci/check-secret-surface.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run guard:secret-surface`

- [ ] **Step 1: Add failing source-surface assertions**

Scan `app`, `components`, `lib`, and `agents`. Assert:

- no `NEXT_PUBLIC_OPENAI`, `NEXT_PUBLIC_ANTHROPIC`, or
  `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`;
- provider keys do not appear in `'use client'` modules;
- only `app/layout.tsx` contains `dangerouslySetInnerHTML`;
- application Supabase calls do not use `.single()`;
- provider URLs do not occur in client modules.

- [ ] **Step 2: Implement the CLI guard**

Print file and rule only. Never print a matching source line because it could
contain a secret.

- [ ] **Step 3: Add the package script**

```json
"guard:secret-surface": "node scripts/ci/check-secret-surface.mjs"
```

- [ ] **Step 4: Run and fix real violations**

```bash
npm run guard:secret-surface
npx vitest run tests/enterprise/invariants.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add tests/enterprise/invariants.test.ts scripts/ci/check-secret-surface.mjs package.json
git commit -m "test(security): guard server-only secret surfaces"
```

### Task 3: Enforce error and telemetry redaction

**Files:**
- Modify: `agents/runtime/provider-error.ts`
- Modify: `agents/runtime/persistence.ts`
- Modify: `tests/agents/provider-error.test.ts`
- Modify: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: allowlisted provider failure metadata
- Rejects: prompt, system prompt, response body, stack, key, email, and raw user ID

- [ ] **Step 1: Add sentinel leakage tests**

Create an error containing sentinels in `message`, `stack`, `body`, `prompt`,
`email`, and `apiKey`. Assert `providerErrorTelemetry` and persistence arguments
contain none of them. Preserve only status, bounded code/type/request ID, usage,
latency, and provider generation ID.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/agents/provider-error.test.ts tests/agents/runtime-execute.test.ts -t "redact" --reporter=verbose
```

- [ ] **Step 3: Implement allowlist-only serialization**

Do not serialize unknown error objects. Keep all diagnostic strings at or below
120 characters and reject control characters.

- [ ] **Step 4: Verify**

```bash
npx vitest run tests/agents/provider-error.test.ts tests/agents/runtime-execute.test.ts --reporter=verbose
```

- [ ] **Step 5: Commit**

```bash
git add agents/runtime/provider-error.ts agents/runtime/persistence.ts tests/agents/provider-error.test.ts tests/agents/runtime-execute.test.ts
git commit -m "fix(security): redact provider failure telemetry"
```

### Task 4: Prevent accidental production mutation from tooling

**Files:**
- Create: `scripts/safety/require-production-write-approval.ts`
- Create: `tests/enterprise/production-write-guard.test.ts`
- Modify: `scripts/debug/smoke-erasure.ts`
- Modify: `scripts/data/seed-demo-coach-roster.ts`

**Interfaces:**
- Produces: `requireProductionWriteApproval({ operation, targetHost })`
- Opt-in: `TROPHE_ALLOW_PRODUCTION_WRITE=<operation>`

- [ ] **Step 1: Write failing guard tests**

Assert production Supabase host plus missing opt-in throws. Assert localhost and
`127.0.0.1` are allowed. Assert a mismatched operation opt-in still throws.

- [ ] **Step 2: Prove red**

```bash
npx vitest run tests/enterprise/production-write-guard.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement the exact-operation guard**

The thrown error includes operation and hostname only. It never includes URL
credentials, keys, SQL, or payloads.

- [ ] **Step 4: Wire the two production-capable tools**

Call the guard immediately before creating a service-role client or issuing a
write in `smoke-erasure.ts` and `seed-demo-coach-roster.ts`. Read-only canary
and reporting scripts remain unaffected.

- [ ] **Step 5: Verify**

```bash
npx vitest run tests/enterprise/production-write-guard.test.ts tests/enterprise/delivery-governance.test.ts --reporter=verbose
```

- [ ] **Step 6: Commit**

```bash
git add scripts/safety tests/enterprise/production-write-guard.test.ts scripts
git commit -m "feat(security): require explicit production-write approval"
```

### Task 5: Security audit and final evidence

**Files:**
- Create: `artifacts/quality/security-audit-2026-07-25.md`

- [ ] **Step 1: Run all security guards**

```bash
npm run guard:secret-surface
npm run guard:eval-identity
npm run guard:golden-tolerances
npx vitest run tests/auth tests/lib/api-guard.test.ts tests/enterprise tests/privacy tests/spike --reporter=verbose
```

- [ ] **Step 2: Perform read-only production header checks**

Check `/`, `/login`, `/trust`, and one unauthenticated protected route for CSP,
HSTS, frame protection, content-type protection, redirect behavior, and cache
headers. Do not submit forms or authenticate.

- [ ] **Step 3: Sanity-check P0/P1 findings**

For each initial P0/P1, reproduce it through a second independent signal before
fixing or reporting it. Add a “Corrections after sanity checks” section.

- [ ] **Step 4: Commit**

```bash
git add artifacts/quality/security-audit-2026-07-25.md
git commit -m "docs(security): record hardened security posture"
```
