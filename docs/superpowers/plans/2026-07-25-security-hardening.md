# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the validated AI cost-governance, secret-surface, telemetry-redaction, production-tooling, dependency, and privileged-import defects without spending provider money or mutating production.

**Architecture:** Repository discovery creates authoritative inventories for AI routes, workflows, service-role mutators, API error surfaces, and privileged imports so new entry points cannot silently escape policy. Verified membership and durable rate limits protect the request boundary, while a local-tested database reservation ledger serializes worst-case AI spend before any provider attempt and reconciles it afterward. Shared redaction and mutation-approval modules make safe behavior the default instead of relying on individual call sites.

**Tech Stack:** TypeScript 5, Next.js 16 App Router, Vitest 4, Drizzle ORM/PostgreSQL, Supabase SSR, Node.js repository scanners, GitHub Actions.

## Global Constraints

- Paid AI/provider spend is exactly USD `$0.00` during implementation and verification.
- All provider tests use injected offline transports or fixtures. Never set `TROPHE_ALLOW_PAID_AI=1` while executing this plan.
- Production is read-only and unauthenticated. Do not invoke a production AI route, production provider smoke, eval runner, service-role script, or production database RPC.
- A new migration and its RPCs may be generated, applied, and concurrency-tested only on the repository's existing local Supabase PostgreSQL URL `postgresql://postgres:postgres@127.0.0.1:54322/postgres`, as defined by `.env.local.example`, `supabase/config.toml`, and `scripts/test/require-database.mjs`.
- Do not apply migrations to a linked/remote Supabase project, run `db:push`, deploy, merge, or mutate production. Committed runtime code must continue to treat the production schema as unchanged until a separately approved migration/deploy workflow occurs.
- Do not print, persist, or compare credential values. Tests use fixed placeholders and report only file, rule, operation ID, and hostname/project reference.
- Every defect is fixed test-first: add a focused failing regression, observe the expected failure, make the minimum implementation change, then run the focused and adjacent suites.
- File inventories are discovery-driven. A task is incomplete if its inventory tool finds an unclassified route, workflow, mutator, error surface, or privileged import.
- Direct paid-tool implementation belongs to Task 6 of `docs/superpowers/plans/2026-07-25-ai-runtime-offline-harness.md`. This plan must not duplicate that implementation; Task 8 requires its `guard:paid-ai-tools` contract before security completion.
- Preserve unrelated worktree changes. Stage and commit only the files named by the current task.

---

## Planned File Map

- `lib/security/ai-route-inventory.ts`: discover AI HTTP entry points and report missing auth, limiter, role, and organization-boundary invariants.
- `lib/security/api-guard.ts`: shared verified-user, durable-rate-limit, and optional role allowlist boundary.
- `agents/runtime/org-budget.ts`: derive organization identity from verified membership; never trust a request UUID.
- `db/schema/ai_budget_reservations.ts`: Drizzle schema for pending and reconciled worst-case spend reservations.
- `agents/runtime/budget-reservation.ts`: reserve, settle, or conservatively retain per-attempt spend.
- `scripts/ci/check-workflow-security.mjs`: inspect every Actions workflow for job-wide provider secrets and credentials in URLs.
- `agents/runtime/provider-error.ts`: one allowlist-only provider failure representation.
- `agents/observability/safe-error.ts`: stable persistence, Langfuse, and log serialization.
- `scripts/ci/check-production-mutators.mjs`: inventory service-role/network mutators and require a declared operation boundary.
- `scripts/safety/require-production-write-approval.ts`: dry-run-first, exact-target, exact-operation write authorization.
- `lib/security/import-graph.ts`: prevent privileged modules from being reachable from client components without relying on the bare `server-only` package.
- `lib/security/server-runtime.ts`: portable runtime assertion usable by Next, Vitest, and `tsx`.
- `lib/http/internal-error.ts`: stable generic database/API failure responses.
- `docs/quality/security-audit-2026-07-25.md`: final evidence, remaining risk, and current-HEAD corrections.

### Task 1: Inventory every AI route and enforce verified tenant identity plus durable limiting

**Files:**
- Create: `lib/security/ai-route-inventory.ts`
- Create: `tests/enterprise/ai-route-security.test.ts`
- Create: `tests/agents/org-budget.test.ts`
- Create: `tests/api/shopping-list.test.ts`
- Modify: `lib/security/api-guard.ts`
- Modify: `agents/runtime/org-budget.ts`
- Modify: `app/api/ai/coach-insight/route.ts`
- Modify: `app/api/coach/shopping-list/route.ts`
- Modify if reported: any `app/api/**/route.ts` discovered by `discoverAiRouteFiles`
- Modify: `tests/lib/api-guard.test.ts`
- Modify: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: `discoverAiRouteFiles(root: string): Promise<string[]>`
- Produces: `analyzeAiRouteSource(file: string, source: string): AiRouteSecurityFinding[]`
- Produces: `guardAiRoute(request, { allowedRoles? }): Promise<AiRouteGuardResult>`
- Produces: `resolveAuthorizedOrganizationId({ userId, requestedOrganizationId }): Promise<string | undefined>`
- Invariant: every public AI route authenticates and consumes the durable limiter before reading tenant data or invoking a provider.
- Invariant: a caller-supplied organization UUID is only a selection hint; verified database membership is authoritative.

- [ ] **Step 1: Write the failing authoritative inventory test**

Discover `app/api/**/route.ts` files containing any of these paid-AI signals:

```ts
export const AI_ROUTE_SIGNALS = [
  'executeAiTask(',
  'invokeStructuredProvider(',
  'invokeTextProvider(',
  'callAnthropicMessages(',
  'invokeOpenAiStructured(',
  'GoogleGenAI',
] as const;

export type AiRouteSecurityRule =
  | 'missing-ai-guard'
  | 'guard-not-awaited'
  | 'tenant-read-before-guard'
  | 'provider-before-guard'
  | 'unverified-user-id'
  | 'missing-role-allowlist';
```

The test must assert that the discovery result contains the currently known
coach insight, conversation, meal suggestion, photo analysis, and shopping-list
routes, then assert `analyzeAiRouteSource` returns no findings. Do not make that
known list the inventory; it is only a regression floor.

- [ ] **Step 2: Run the inventory test and observe the shopping-list failure**

```bash
npx vitest run tests/enterprise/ai-route-security.test.ts --reporter=verbose
```

Expected: FAIL because `app/api/coach/shopping-list/route.ts` uses role auth
without the shared durable AI limiter.

- [ ] **Step 3: Implement the source inventory**

Use `node:fs/promises` and deterministic POSIX-relative paths. Ignore test
fixtures, `.next`, `node_modules`, worktrees, and comments when matching. Report
only:

```ts
export interface AiRouteSecurityFinding {
  file: string;
  line: number;
  rule: AiRouteSecurityRule;
}
```

Sort files and findings so local and CI output are identical.

- [ ] **Step 4: Write failing organization-identity tests**

In `tests/agents/org-budget.test.ts`, mock the Drizzle membership query and
assert:

```ts
await expect(resolveAuthorizedOrganizationId({
  userId: COACH_ID,
  requestedOrganizationId: VICTIM_ORG_ID,
})).rejects.toMatchObject({ name: 'OrganizationMembershipRequiredError' });

await expect(resolveAuthorizedOrganizationId({
  userId: COACH_ID,
  requestedOrganizationId: NONEXISTENT_ORG_ID,
})).rejects.toMatchObject({ name: 'OrganizationMembershipRequiredError' });

await expect(resolveAuthorizedOrganizationId({
  userId: COACH_ID,
  requestedOrganizationId: COACH_ORG_ID,
})).resolves.toBe(COACH_ORG_ID);
```

Also assert a requested organization with no verified `userId` is rejected,
while no requested organization resolves the user's actual membership.

- [ ] **Step 5: Prove the membership tests fail**

```bash
npx vitest run tests/agents/org-budget.test.ts tests/agents/runtime-execute.test.ts -t "organization" --reporter=verbose
```

Expected: FAIL because `resolveOrganizationId` currently returns a supplied UUID
before querying membership.

- [ ] **Step 6: Implement membership-derived organization identity**

Replace the trust-first branch with:

```ts
export async function resolveAuthorizedOrganizationId(input: {
  userId?: string;
  requestedOrganizationId?: string;
}): Promise<string | undefined>;
```

When `requestedOrganizationId` is present, query the exact
`organization_members(user_id, org_id)` tuple and throw the stable
`OrganizationMembershipRequiredError` if absent. When it is omitted, resolve
the user's membership. Do not fall back from a rejected requested organization
to a different organization. Pass only the resolved value to RAG, runtime
context, and `agent_runs`.

- [ ] **Step 7: Write failing durable-limiter and role tests for shopping-list**

Mock `guardAiRoute`, tenant access, and the provider transport. Assert anonymous
requests return 401, an exhausted durable limit returns 429, a client role
returns 403, and all three cases make zero tenant reads and zero provider calls.
Assert an allowed coach uses `guard.userId` for tenant and runtime context.

- [ ] **Step 8: Extend the shared guard and migrate shopping-list**

Use this portable interface:

```ts
type GuardAiRouteOptions = {
  allowedRoles?: readonly ('client' | 'coach' | 'admin' | 'super_admin')[];
};
```

After verified authentication and the durable `consumeRateLimit` call, load the
profile role only when `allowedRoles` is present. Return a stable 403 on a role
miss. Change shopping-list to:

```ts
const guard = await guardAiRoute(request, {
  allowedRoles: ['coach', 'admin', 'super_admin'],
});
if (!guard.ok) return guard.response;
```

Retain `canAccessClient`; remove duplicate request authentication through
`requireRole`. Ensure limiter bypass remains limited to the existing explicit
eval identity configuration.

- [ ] **Step 9: Verify and commit**

```bash
npx vitest run tests/enterprise/ai-route-security.test.ts tests/agents/org-budget.test.ts tests/lib/api-guard.test.ts tests/api/shopping-list.test.ts tests/agents/runtime-execute.test.ts --reporter=verbose
git add lib/security/ai-route-inventory.ts lib/security/api-guard.ts agents/runtime/org-budget.ts app/api/ai/coach-insight/route.ts app/api/coach/shopping-list/route.ts tests/enterprise/ai-route-security.test.ts tests/agents/org-budget.test.ts tests/lib/api-guard.test.ts tests/api/shopping-list.test.ts tests/agents/runtime-execute.test.ts
git diff --cached --name-only
git commit -m "fix(security): bind AI routes to verified tenant identity"
```

Expected: all focused tests pass, and the staged list contains only Task 1
files.

### Task 2: Atomically reserve and reconcile worst-case AI budget

**Files:**
- Create: `db/schema/ai_budget_reservations.ts`
- Modify: `db/schema/index.ts`
- Create: `drizzle/0060_ai_budget_reservations.sql` (the next unused ordinal at plan authoring; stop and choose the actual next unused ordinal if parallel work claims `0060`)
- Modify: `drizzle/meta/_journal.json` and generated snapshot only if `db:generate` changes them
- Create: `agents/runtime/budget-reservation.ts`
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/runtime/persistence.ts`
- Modify: `agents/runtime/org-budget.ts`
- Modify: `agents/router/pricing.ts`
- Create: `tests/agents/budget-reservation.test.ts`
- Create: `tests/db/ai-budget-reservation.test.ts`
- Modify: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: `estimateWorstCaseAttemptCostUsd(policy, prompt, systemPrompt): number`
- Produces: `reserveAiBudget(input): Promise<AiBudgetReservation>`
- Produces: `settleAiBudgetReservation({ reservationId, actualCostUsd }): Promise<void>`
- Produces: `retainWorstCaseReservation({ reservationId }): Promise<void>`
- Invariant: no provider attempt starts without a committed reservation.
- Invariant: missing organization budget rows fail closed.
- Invariant: a primary and fallback attempt reserve separately.

- [ ] **Step 1: Write failing unit tests for reservation ordering and cleanup**

Mock persistence, reservation functions, and provider invocation. Assert:

1. membership resolution occurs before reservation;
2. reservation occurs before `createGeneration` and before the provider;
3. a denied or missing budget row causes zero persistence and zero provider calls;
4. a transport failure before provider start releases the reservation;
5. a started provider with unknown usage retains the worst-case amount;
6. success settles to actual/estimated usage;
7. fallback obtains a separate reservation and cannot start if that reservation
   is denied.

- [ ] **Step 2: Prove the unit tests fail**

```bash
npx vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts -t "reservation|budget|fallback" --reporter=verbose
```

Expected: FAIL because the runtime currently performs a non-atomic aggregate
check and has no reservation lifecycle.

- [ ] **Step 3: Define the reservation schema**

Model one row per provider attempt:

```ts
type AiBudgetReservationStatus = 'pending' | 'settled' | 'released';

interface AiBudgetReservationRow {
  id: string;
  generationId: string;
  organizationId: string | null;
  userId: string;
  reservedCostUsd: string;
  actualCostUsd: string | null;
  status: AiBudgetReservationStatus;
  createdAt: Date;
  settledAt: Date | null;
}
```

Require a unique `generation_id`, foreign keys to organizations/profiles,
positive bounded amounts, status checks, and indexes for pending organization
and solo-user window sums. Enable RLS with no anon/authenticated policies.
Revoke all table/function access from `PUBLIC`, `anon`, and `authenticated`;
grant only the runtime's privileged database role.

- [ ] **Step 4: Generate and inspect the migration without applying it remotely**

```bash
npm run db:generate
git diff -- db/schema drizzle
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:migrate
```

Rename the generated migration to `0060_ai_budget_reservations.sql` and keep
`_journal.json` consistent. If `0060` exists at execution time, stop and use the
actual next unused ordinal instead of overwriting or combining migrations.
Before running the migration command, confirm the URL remains identical to all
three repository-local sources named in Global Constraints. Do not use
`db:push`, Supabase CLI linking, or a remote database URL. Applying this
migration locally does not authorize or imply production application.

- [ ] **Step 5: Add failing local PostgreSQL concurrency tests**

The local test must use uniquely named rows in the already-migrated local
database, clean them in `afterAll`, and exercise the real transaction/RPC
boundary:

```ts
const attempts = await Promise.allSettled(
  Array.from({ length: 20 }, (_, index) =>
    reserveForTest({ generationId: generationIds[index], worstCaseUsd: 0.40 }),
  ),
);
expect(attempts.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
```

Use a `$1.20` daily limit so exactly three reservations succeed. Add cases for
the monthly threshold, kill switch, absent budget row, victim/nonmember
organization, duplicate generation ID, solo-user daily cap, settlement reducing
the pending amount, and a retained unknown-cost failure continuing to count.

- [ ] **Step 6: Run the database test against local PostgreSQL only and observe red**

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -- --run tests/db/ai-budget-reservation.test.ts
```

Expected: FAIL because the table and atomic reservation operation do not exist.
If the exact local database is unavailable, start/bootstrap local PostgreSQL;
do not substitute a Supabase or production URL.

- [ ] **Step 7: Implement the atomic operation**

For an organization reservation, lock the exact budget row with
`SELECT ... FOR UPDATE`; absence is a stable denial. Re-verify exact membership
inside the same transaction, sum settled `agent_runs` plus pending reservations
for the day/month, conditionally insert, and commit. For a solo user, take a
transaction-scoped advisory lock derived from the user UUID before checking the
`$1.00` daily limit. Use parameterized SQL only.

Settled reservations stop contributing to the pending sum because the matching
`agent_runs` cost is authoritative. `released` is legal only when the transport
provably never started. A started failure without trusted usage remains charged
at the reserved worst case.

- [ ] **Step 8: Integrate reservation into each attempt**

Compute a conservative amount from the selected model pricing, estimated input
tokens, `policy.maxTokens`, and `policy.maxCostUsd`; unknown model pricing must
throw rather than return zero. Generate the attempt UUID, reserve, create the
generation, then start observability/provider work. Reconcile persistence and
reservation in one database transaction where possible. Preserve the request
deadline and ensure primary failure cannot reuse its reservation for fallback.

- [ ] **Step 9: Verify locally and commit**

```bash
npx vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts tests/agents/provider-error.test.ts --reporter=verbose
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -- --run tests/db/ai-budget-reservation.test.ts tests/db/rls.test.ts
git add db/schema/ai_budget_reservations.ts db/schema/index.ts agents/runtime/budget-reservation.ts agents/runtime/execute.ts agents/runtime/persistence.ts agents/runtime/org-budget.ts agents/router/pricing.ts tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts tests/db/ai-budget-reservation.test.ts
git diff --name-only -- drizzle | tee /tmp/trophe-ai-budget-migration-files.txt
git add --pathspec-from-file=/tmp/trophe-ai-budget-migration-files.txt
git diff --cached --name-only
git commit -m "feat(security): reserve AI budget atomically"
```

Stage only the generated migration, journal, and snapshot paths displayed by
the `git diff --name-only -- drizzle` review before committing. Expected: unit
and local concurrency tests pass. Do not apply or deploy the migration beyond
the exact repository-local database.

### Task 3: Remove CI provider secrets and prohibit credentials in workflow URLs

**Files:**
- Create: `scripts/ci/check-workflow-security.mjs`
- Create: `tests/enterprise/workflow-security.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/provider-smoke.yml`
- Modify: `package.json`

**Interfaces:**
- Produces: `discoverWorkflowFiles(root): string[]`
- Produces: `analyzeWorkflowSource(file, source): WorkflowSecurityFinding[]`
- Produces: `npm run guard:workflow-security`
- Invariant: pull-request/push verification receives no paid-provider secret.
- Invariant: credentials never occur in URLs or query strings.

- [ ] **Step 1: Write failing workflow-policy tests**

Discover every `.github/workflows/*.{yml,yaml}` file and scan the complete
source. Use these rule IDs:

```ts
type WorkflowSecurityRule =
  | 'provider-secret-in-pr-job'
  | 'credential-in-url'
  | 'google-key-not-in-header';
```

Assert the normal CI job does not expose `OPENAI_API_KEY`,
`ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, or
`VOYAGE_API_KEY` from `${{ secrets.* }}` at job or step scope. Assert no URL
template contains a key/token/secret query parameter. Assert Google provider
smoke uses the `x-goog-api-key` header.

- [ ] **Step 2: Prove the tests fail on both validated defects**

```bash
npx vitest run tests/enterprise/workflow-security.test.ts --reporter=verbose
```

Expected: FAIL on provider secrets in `.github/workflows/ci.yml` and
`?key=${process.env.GOOGLE_API_KEY}` in `provider-smoke.yml`.

- [ ] **Step 3: Implement the deterministic workflow scanner**

Export scanner functions from the `.mjs` module and make its CLI print only:

```text
.github/workflows/ci.yml:provider-secret-in-pr-job
.github/workflows/provider-smoke.yml:credential-in-url
```

Do not print matching source, expression values, environment values, or shell
context. The pull-request rule is based on the workflow trigger plus secret
references, not on whether fork PRs currently receive secrets.

- [ ] **Step 4: Remove secrets from base CI and correct Google authentication**

Delete all real provider secrets from the normal CI job; offline fixtures and
placeholder local Supabase values remain. In the protected manual provider
smoke, change the Google request to a key-free URL and:

```ts
headers: {
  'content-type': 'application/json',
  'x-goog-api-key': process.env.GOOGLE_API_KEY,
}
```

Keep the smoke workflow manual, production-environment protected, and outside
all verification commands in this plan.

- [ ] **Step 5: Add the guard script and verify**

Add:

```json
"guard:workflow-security": "node scripts/ci/check-workflow-security.mjs"
```

Then run:

```bash
npm run guard:workflow-security
npx vitest run tests/enterprise/workflow-security.test.ts tests/agents/provider-access.test.ts --reporter=verbose
```

Expected: both commands pass without contacting a provider.

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/provider-smoke.yml scripts/ci/check-workflow-security.mjs tests/enterprise/workflow-security.test.ts package.json
git diff --cached --name-only
git commit -m "fix(security): remove provider secrets from CI"
```

### Task 4: Centralize provider, persistence, Langfuse, and log redaction

**Files:**
- Create: `agents/observability/safe-error.ts`
- Modify: `agents/runtime/provider-error.ts`
- Modify: `agents/runtime/persistence.ts`
- Modify: `agents/observability/langfuse.ts`
- Modify: `agents/runtime/providers/openai.ts`
- Modify: `agents/runtime/providers/deepseek.ts`
- Modify: `agents/runtime/providers/voyage.ts`
- Modify: `agents/clients/google.ts`
- Modify if reported: AI route files with raw error logging discovered by `analyzeAiRouteSource`
- Create: `tests/agents/error-redaction-boundary.test.ts`
- Create: `tests/agents/langfuse-redaction.test.ts`
- Modify: `tests/agents/provider-error.test.ts`
- Modify: `tests/agents/runtime-execute.test.ts`
- Modify: `tests/enterprise/ai-route-security.test.ts`

**Interfaces:**
- Produces: `sanitizeProviderFailure(error: unknown): SafeProviderFailure`
- Produces: `safeAiErrorLog(surface: string, error: unknown): void`
- Produces: `safeStatusMessage(error: unknown): string`
- Rejects: raw provider body/message, prompt, system prompt, stack, URL query, key, email, health text, and arbitrary user IDs.

- [ ] **Step 1: Add one cross-sink sentinel regression**

Construct provider failures whose message, stack, response body, nested detail,
prompt, email, URL, and API-key fields each contain a distinct sentinel. Inject
them through OpenAI, DeepSeek, Google, Voyage, runtime failure persistence,
Langfuse generation completion, and an AI route log. Assert none of the
sentinels appears in:

- thrown public error messages;
- `agent_runs.errorMessage`;
- persistence metadata;
- Langfuse `statusMessage`;
- captured `console.error` arguments;
- API response bodies.

Assert stable status, allowlisted provider code/type/request ID, usage, latency,
and provider generation ID remain available.

- [ ] **Step 2: Prove leakage exists**

```bash
npx vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/agents/provider-error.test.ts -t "sentinel|redact" --reporter=verbose
```

Expected: FAIL because OpenAI/DeepSeek/Voyage/Google raw messages can currently
reach persistence or Langfuse.

- [ ] **Step 3: Define the only durable provider-failure shape**

```ts
export interface SafeProviderFailure {
  message: 'AI provider request failed';
  rawStatus?: number;
  code?: string;
  type?: string;
  requestId?: string;
  usage?: AiUsage;
  latencyMs?: number;
  providerGenerationId?: string;
}
```

Allowlist code/type values and bounded request/provider IDs. Reject control
characters and unknown properties. Unknown errors become the same stable
message with no metadata. Preserve Anthropic's existing generic-body behavior
as the reference implementation.

- [ ] **Step 4: Route every sink through the sanitizer**

Provider adapters must throw generic typed errors and never copy provider body
text into `Error.message`. `failGeneration` stores only
`SafeProviderFailure.message`; Langfuse receives `safeStatusMessage`; AI route
logs use `safeAiErrorLog(surface, error)`, which emits a fixed event name and
allowlisted low-cardinality metadata. Add `raw-error-log` to
`AiRouteSecurityRule` so future `console.error(..., error)` calls in discovered
AI routes fail the inventory test.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/agents/provider-error.test.ts tests/agents/runtime-execute.test.ts tests/enterprise/ai-route-security.test.ts --reporter=verbose
git add agents/observability/safe-error.ts agents/runtime/provider-error.ts agents/runtime/persistence.ts agents/observability/langfuse.ts agents/runtime/providers/openai.ts agents/runtime/providers/deepseek.ts agents/runtime/providers/voyage.ts agents/clients/google.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/agents/provider-error.test.ts tests/agents/runtime-execute.test.ts tests/enterprise/ai-route-security.test.ts
git diff --name-only -- app/api
git diff --cached --name-only
git commit -m "fix(security): redact AI failures across telemetry sinks"
```

Stage each route displayed by `git diff --name-only -- app/api` only after
confirming the Task 1 inventory reported it. Expected: all sentinels are absent
and every staged route was reported by the inventory before modification.

### Task 5: Put every service-role mutator behind a fail-closed production interlock

**Files:**
- Create: `scripts/ci/check-production-mutators.mjs`
- Create: `scripts/safety/require-production-write-approval.ts`
- Create: `tests/enterprise/production-write-guard.test.ts`
- Create: `tests/enterprise/production-mutator-inventory.test.ts`
- Modify: every mutating script discovered under `scripts/`
- Modify: `package.json`

**Interfaces:**
- Produces: `discoverProductionMutators(root): ProductionMutatorCandidate[]`
- Produces: `requireProductionWriteApproval(input): ProductionWriteDecision`
- Produces: `npm run guard:production-mutators`
- Approval: `--execute --target=<exact-ref>` plus `TROPHE_ALLOW_PRODUCTION_WRITE=<operation>:<exact-ref>`
- Default: dry-run with zero mutation calls.

- [ ] **Step 1: Build a failing mutator inventory**

Discover script files that reference service-role credentials, privileged
Supabase clients, direct database URLs, or mutating SQL/API verbs. Classify
write signals including `.insert(`, `.upsert(`, `.update(`, `.delete(`,
`auth.admin.createUser`, `auth.admin.deleteUser`, `INSERT`, `UPDATE`, `DELETE`,
`DROP`, `ALTER`, and production-route POST/PUT/PATCH/DELETE.

Each write-capable script must declare exactly one or more fixed operation IDs:

```ts
const PRODUCTION_WRITE_OPERATIONS = [
  'erasure-smoke',
] as const;
```

and import the shared approval module. Read-only candidates must carry a tested
`PRODUCTION_MUTATION_MODE = 'read-only'` marker and contain no write signal.
The inventory must initially surface at least `smoke-erasure.ts`, benchmark
batch2/3/4, and any additional current mutators; that list is a regression
floor, not the authoritative set.

- [ ] **Step 2: Prove the inventory and behavior tests fail**

```bash
npx vitest run tests/enterprise/production-write-guard.test.ts tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
```

Expected: FAIL because several service-role mutators auto-load `.env.local` and
write without a shared dry-run/exact-target boundary.

- [ ] **Step 3: Implement exact approval semantics**

Use:

```ts
export interface ProductionWriteApprovalInput {
  operation: string;
  targetUrl: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
}

export type ProductionWriteDecision =
  | { mode: 'dry-run'; targetRef: string }
  | { mode: 'execute'; targetRef: string };
```

Derive `targetRef` from `localhost`/`127.0.0.1` or the exact Supabase hostname;
reject URLs containing credentials. Without `--execute`, always return dry-run.
Execution requires `--target=<targetRef>` and the exact environment value
`<operation>:<targetRef>`; truthy values, another operation, another project,
or a missing target throw before client creation. Errors contain only the fixed
operation and target reference.

- [ ] **Step 4: Wire every inventory-discovered mutator**

For each reported script:

1. compute the decision before constructing a service-role client;
2. print a bounded operation/target/count plan in dry-run mode;
3. skip every network/database mutation unless `mode === 'execute'`;
4. require a separate fixed operation ID for logically distinct destructive
   actions;
5. preserve or add a deterministic cleanup/rollback manifest.

The test harness must inject fake clients/transports and prove production-shaped
configuration makes zero writes for missing, malformed, mismatched-operation,
and mismatched-target approvals. Do not run a real script against production.

- [ ] **Step 5: Add the static guard and verify**

Add:

```json
"guard:production-mutators": "node scripts/ci/check-production-mutators.mjs"
```

Run:

```bash
npm run guard:production-mutators
npx vitest run tests/enterprise/production-write-guard.test.ts tests/enterprise/production-mutator-inventory.test.ts tests/privacy --reporter=verbose
```

Expected: all discovered write-capable scripts declare operations, call the
shared interlock before privileged client construction, and are dry-run by
default.

- [ ] **Step 6: Commit only discovered mutators and guard files**

```bash
git add scripts/ci/check-production-mutators.mjs scripts/safety/require-production-write-approval.ts tests/enterprise/production-write-guard.test.ts tests/enterprise/production-mutator-inventory.test.ts package.json
npm run --silent guard:production-mutators -- --print-files > /tmp/trophe-production-mutators.txt
git add --pathspec-from-file=/tmp/trophe-production-mutators.txt
git diff --cached --name-only
git commit -m "fix(security): interlock production mutation tools"
```

The `--print-files` mode must output only repository-relative filenames, one per
line, so the command is safe and reviewable. Inspect the staged list before
committing.

### Task 6: Upgrade and audit production plus development dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if compatibility requires: source/config files named by a failed Next.js or Supabase CLI compatibility test
- Create: `tests/enterprise/dependency-security.test.ts`

**Interfaces:**
- Requires: Next.js `>=16.2.11`
- Requires: no production high/critical advisory
- Requires: no full-tree high/critical advisory, including the Supabase CLI/`tar` chain
- Prohibits: `npm audit fix --force`

- [ ] **Step 1: Add a failing lockfile policy test**

Parse `package-lock.json` and assert:

```ts
expect(compareSemver(installedVersion('next'), '16.2.11'))
  .toBeGreaterThanOrEqual(0);
expect(installedVersions('sharp').some((value) =>
  compareSemver(value, '0.35.0') < 0,
)).toBe(false);
```

Implement the assertions with a small numeric semver comparator so the test
does not depend on an undeclared transitive package. Assert the lockfile no
longer contains the exact package/version pairs reported by the fresh
production audit in Step 2. Live registry output remains a separate gate and
must not be embedded in the repository.

- [ ] **Step 2: Capture fresh production and full audit baselines**

```bash
npm audit --omit=dev --json > /tmp/trophe-prod-audit.json || true
npm audit --json > /tmp/trophe-full-audit.json || true
node -e "for (const p of ['/tmp/trophe-prod-audit.json','/tmp/trophe-full-audit.json']) { const a=require(p); console.log(p, a.metadata.vulnerabilities) }"
npm explain next
npm explain tar
```

Expected baseline: Next `16.2.7` and production advisories; the full audit also
identifies the dev Supabase CLI/`tar` chain. Do not print environment values.

- [ ] **Step 3: Upgrade Next and aligned packages without force**

```bash
npm install next@^16.2.11 eslint-config-next@^16.2.11
npm dedupe
npx vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
npm run typecheck
npm run build
```

Keep Next and `eslint-config-next` on compatible lines. Confirm the lockfile no
longer resolves the vulnerable nested Sharp/PostCSS versions. Do not use
`--force` or suppress an advisory.

- [ ] **Step 4: Upgrade the Supabase CLI/`tar` chain if compatible**

Inspect the registry-selected CLI release before changing the lock:

```bash
npm view supabase version
npm install --save-dev supabase@latest
npm explain tar
npx supabase --version
npm run db:doctor
```

Then run focused database tooling/tests. If the latest compatible CLI still
contains a high/critical `tar` advisory, the task remains red and the final
audit must name the exact advisory and upstream constraint; do not hide it with
an audit exception or forced major upgrade.

- [ ] **Step 5: Run both audits and the full compatibility gate**

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npx vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
npm run typecheck
npm run lint
npm test
npm run build
```

Expected: both audit commands exit zero for high/critical findings and the
application test/build gates pass. Review any remaining low/moderate advisory
for reachability in Task 8 rather than auto-fixing it.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/enterprise/dependency-security.test.ts
git diff --name-only
git diff --cached --name-only
git commit -m "chore(security): upgrade vulnerable dependencies"
```

If a compatibility check required a source/config change, stage that exact path
only after `git diff --name-only` confirms why it changed. The final staged set
is the dependency manifest, lockfile, policy test, and only compatibility files
changed because a named check failed.

### Task 7: Return stable database errors and enforce portable privileged import boundaries

**Files:**
- Create: `lib/http/internal-error.ts`
- Create: `lib/security/server-runtime.ts`
- Create: `lib/security/import-graph.ts`
- Create: `tests/enterprise/api-error-surface.test.ts`
- Create: `tests/enterprise/privileged-import-graph.test.ts`
- Modify: `app/api/food/local-search/route.ts`
- Modify: `app/api/client/message/route.ts`
- Modify if reported: every API route discovered returning a database/provider `error.message`
- Modify: `lib/supabase/server.ts`
- Modify: `db/client.ts`
- Modify if reported: privileged secret/service-role modules reachable from a client import root

**Interfaces:**
- Produces: `internalErrorResponse(event: string): NextResponse`
- Produces: `assertServerRuntime(boundary: string): void`
- Produces: `findPrivilegedClientImportPaths(root: string): ImportPathFinding[]`
- Invariant: API responses never return raw database/provider error strings.
- Invariant: no `'use client'` import path reaches database, service-role, provider-credential, or secret-bearing telemetry modules.

- [ ] **Step 1: Write failing API sentinel tests**

Inject a database error containing `DB_SENTINEL_DO_NOT_EXPOSE` into local food
search and client messaging. Assert the response status remains 500, the body is
exactly a stable public shape such as `{ error: 'Internal server error' }`, and
the sentinel is absent from response and captured logs. Add a source inventory
that discovers `NextResponse.json({ error: error.message })` and equivalent
aliases in every `app/api/**/route.ts`.

- [ ] **Step 2: Write failing privileged import-graph tests**

Treat files whose first directive is `'use client'` or `"use client"` as client
roots. Resolve relative imports and the `@/` alias across `.ts`/`.tsx` files.
Mark these as privileged roots:

- `db/client.ts`;
- `lib/supabase/server.ts`;
- modules reading `SUPABASE_SERVICE_ROLE_KEY`;
- provider credential adapters;
- server observability modules reading secret configuration.

Assert `findPrivilegedClientImportPaths` returns no path. Add fixtures proving
the analyzer catches direct, barrel-export, and transitive imports.

- [ ] **Step 3: Prove both regressions fail**

```bash
npx vitest run tests/enterprise/api-error-surface.test.ts tests/enterprise/privileged-import-graph.test.ts --reporter=verbose
```

Expected: raw database error routes fail the first suite. Import-graph fixtures
fail until the analyzer is implemented.

- [ ] **Step 4: Implement stable API error handling**

`internalErrorResponse(event)` returns only the stable public JSON and logs a
fixed event identifier through the safe logger from Task 4. It must not accept
an arbitrary error argument. Replace every inventory-reported raw message
response with this helper; retain existing 4xx validation/authorization copy.

- [ ] **Step 5: Implement a portable server boundary**

Use a local module, not a bare `import 'server-only'` dependency that can break
`tsx` scripts or Vitest:

```ts
export function assertServerRuntime(boundary: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(`Server-only boundary loaded: ${boundary}`);
  }
}
```

Call it at privileged module initialization. The import graph is the build-time
enforcement; the runtime assertion is defense in depth. It reports only a fixed
boundary identifier and never configuration values.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/enterprise/api-error-surface.test.ts tests/enterprise/privileged-import-graph.test.ts tests/api tests/lib --reporter=verbose
npm run typecheck
git add lib/http/internal-error.ts lib/security/server-runtime.ts lib/security/import-graph.ts lib/supabase/server.ts db/client.ts app/api/food/local-search/route.ts app/api/client/message/route.ts tests/enterprise/api-error-surface.test.ts tests/enterprise/privileged-import-graph.test.ts
git diff --name-only -- app/api
git diff --cached --name-only
git commit -m "fix(security): seal API and privileged import boundaries"
```

Expected: no raw error response is discovered, no client-to-privileged import
path exists, and `tsx`-executed tests do not require special module resolution.
If the API error inventory reports additional routes, stage those exact paths
after confirming each appears in `git diff --name-only -- app/api`.

### Task 8: Run the final zero-spend security audit and record evidence

**Files:**
- Create: `docs/quality/security-audit-2026-07-25.md`
- Modify only if evidence is stale: `agents/README.md`, `ARCHITECTURE.md`

**Interfaces:**
- Consumes: every guard and regression from Tasks 1-7
- Consumes, without reimplementing: `npm run guard:paid-ai-tools` from Task 6 of the AI runtime offline-harness plan
- Produces: ranked final evidence with current-HEAD corrections and residual risk

- [ ] **Step 1: Verify all static inventories fail closed**

```bash
npm run guard:workflow-security
npm run guard:production-mutators
npm run guard:paid-ai-tools
npm run guard:eval-identity
npm run guard:golden-tolerances
npx vitest run tests/enterprise/ai-route-security.test.ts tests/enterprise/workflow-security.test.ts tests/enterprise/production-mutator-inventory.test.ts tests/enterprise/api-error-surface.test.ts tests/enterprise/privileged-import-graph.test.ts tests/enterprise/dependency-security.test.ts --reporter=verbose
```

If `guard:paid-ai-tools` is absent or fails, stop: the direct paid-tool boundary
belongs to the AI plan and is a prerequisite, not work to duplicate here. None
of these commands may receive provider credentials or invoke production.

- [ ] **Step 2: Verify focused security behavior and local database concurrency**

```bash
npx vitest run tests/agents/org-budget.test.ts tests/agents/budget-reservation.test.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/lib/api-guard.test.ts tests/api/shopping-list.test.ts --reporter=verbose
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm test -- --run tests/db/ai-budget-reservation.test.ts tests/db/rls.test.ts tests/db/rag-rls.test.ts
```

Expected: unauthorized/nonmember/budget-denied requests start zero providers,
the 20-way threshold test admits exactly the budgeted count, and no sentinel
reaches a durable or external sink.

- [ ] **Step 3: Run dependency, type, lint, test, and build gates**

```bash
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
npm run typecheck
npm run lint
npm test
npm run build
```

Record exact command exit status and test counts. Do not claim a gate passed
from a partial suite or stale output.

- [ ] **Step 4: Perform bounded read-only public-header checks**

```bash
curl --fail --silent --show-error --head https://trophe.app/
curl --fail --silent --show-error --head https://trophe.app/login
curl --fail --silent --show-error --head https://trophe.app/trust
curl --silent --show-error --head https://trophe.app/dashboard
```

Inspect CSP, HSTS, frame protection, content-type protection, redirect, and
cache headers. Do not authenticate, submit a form, call `/api/ai/**`, or follow
a redirect into an authenticated flow.

- [ ] **Step 5: Write the final evidence report**

For each original finding, record:

- status: fixed, mitigated, or open;
- two independent evidence signals;
- focused regression command and result;
- residual exploit preconditions;
- current-HEAD correction if source moved during implementation.

Separate defects from hardening. State explicitly that the database migration
was tested only on localhost and was not applied or deployed to production.
State that provider spend was `$0.00` and no provider/production AI endpoint was
called. Include remaining dependency advisories with reachability analysis.

- [ ] **Step 6: Verify report and commit**

```bash
rg -n "Critical|Important|Minor|\\$0\\.00|localhost|not applied|guard:paid-ai-tools" docs/quality/security-audit-2026-07-25.md
git diff --check
git status --short
git add docs/quality/security-audit-2026-07-25.md agents/README.md ARCHITECTURE.md
git diff --cached --name-only
git commit -m "docs(security): record hardened security posture"
```

Stage `agents/README.md` and `ARCHITECTURE.md` only if the implemented interfaces
made their current text false. Expected final evidence: no Critical finding,
all validated Important defects closed or explicitly blocking release, all
guards green, production unchanged, and paid-provider spend `$0.00`.
