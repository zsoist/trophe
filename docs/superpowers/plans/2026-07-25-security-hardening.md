# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the validated AI cost-governance, secret-surface, telemetry-redaction, production-tooling, dependency, and privileged-import defects with zero paid-provider spend and zero production access.

**Architecture:** A dependency-free safety launcher is built first and becomes the only executable boundary for migration, test, build, install, audit, and database commands. A cycle-safe workload graph assigns every AI path either a verified user principal or a bounded authenticated system principal; provider adapters declare full billable envelopes, and a PostgreSQL micro-dollar ledger atomically moves each attempt through `reserved -> started -> settled | released | retained`. One language-neutral tool manifest composes paid-AI and production-write approvals across TypeScript, JavaScript, and shell without duplicate policy implementations.

**Tech Stack:** TypeScript 5, Node.js 20, Next.js 16 App Router, Vitest 4, Drizzle ORM/PostgreSQL, Supabase SSR/PostgREST, GitHub Actions.

## Global Constraints

- Paid AI/provider spend is exactly USD `$0.00` throughout implementation and verification.
- Production access is forbidden, including read-only HTTP checks. Do not authenticate, call production, run provider smoke/evals, deploy, merge, push, link Supabase, or apply a remote migration.
- The canonical local database is exactly `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; the canonical local Supabase HTTP origin is exactly `http://127.0.0.1:54321`.
- Task 0's launcher must pass before any other task runs `db:generate`, `db:migrate`, database tests, Vitest, typecheck, lint, build, install, registry metadata, or audit commands.
- After Task 0, every `node`, `npm`, or `npx` execution in this plan goes through `node scripts/safety/run-local-zero-spend.mjs <profile> -- ...`. Bare `git`, `rg`, and path-specific file inspection remain allowed.
- The launcher rejects remote ambient database/Supabase configuration before spawning, pins both `DATABASE_URL` and `DIRECT_URL` to the canonical local database, pins local Supabase placeholders, scrubs paid keys and live/write/eval approvals, and injects a deny-by-default network guard.
- Database migrations/RPCs may be generated, applied, and concurrency-tested only on the canonical local database. The production schema remains unchanged until a separately authorized schema-first release.
- Runtime activation is release-blocked behind schema/backfill/privilege verification. There is no legacy or fail-open budget fallback.
- Do not print or persist credential values. URL userinfo is private parser input and is discarded before diagnostics, manifests, approval tokens, or logs.
- Every defect is fixed test-first. Observe the focused regression fail for the expected reason, implement the minimum boundary, then run the focused and adjacent suites through the launcher.
- Inventories are discovery-driven and fail on unclassified roots, unresolved local dynamic edges, duplicate manifest entries, or unknown pricing/modality.
- Preserve unrelated worktree changes. Stage only exact task-owned paths after a path-specific diff.

---

## Planned File Map

- `scripts/safety/run-local-zero-spend.mjs`: scrubbed child-process launcher with `local-only`, `npm-registry-readonly`, and exact Supabase CLI release profiles.
- `scripts/safety/deny-external-network.cjs`: child-injected network policy; loopback-only except exact npm registry access in the registry profile.
- `scripts/safety/target-policy.mjs`: credential-redacting DSN/URL parser and canonical target comparison.
- `scripts/safety/tool-policy-manifest.json`: one language-neutral inventory shared with AI offline-harness Task 6 and production-write hardening.
- `scripts/safety/tool-policy.mjs`: validate manifest ownership and return composed policy decisions to Node or shell callers.
- `lib/security/ai-workload-graph.ts`: transitive route/caller graph, principal classification, and control findings.
- `agents/runtime/principal.ts`: verified end-user and allowlisted system-workload principal types.
- `agents/runtime/billable-envelope.ts`: provider-specific worst-case billable units and micro-dollar ceiling.
- `db/schema/ai_budget_reservations.ts`: authoritative per-attempt ledger.
- `agents/runtime/budget-reservation.ts`: service-role RPC client for reserve/start/settle/release/retain transitions.
- `scripts/ci/check-workflow-security.mjs`: all-workflow job/step secret policy and Google-header guard.
- `agents/observability/safe-error.ts`: allowlist-only persistence/Langfuse/log serialization.
- `lib/security/error-flow.ts`: semantic error-derived response/log inventory.
- `lib/security/privileged-import-graph.ts`: transitive client-to-privileged import guard.
- `scripts/ci/check-production-mutators.mjs`: semantic JS/TS/shell mutator inventory backed by the shared manifest.
- `docs/runbooks/ai-budget-schema-first-rollout.md`: non-executable deploy/rollback order.
- `docs/quality/security-audit-2026-07-25.md`: final local/source evidence and residual risk.

### Task 0: Build and prove the scrubbed zero-spend/local execution boundary

**Files:**
- Create: `scripts/safety/target-policy.mjs`
- Create: `scripts/safety/deny-external-network.cjs`
- Create: `scripts/safety/run-local-zero-spend.mjs`
- Create only if absent; otherwise validate and preserve AI Task 6-owned rows: `scripts/safety/tool-policy-manifest.json`
- Create: `scripts/safety/tool-policy.mjs`
- Create: `tests/safety/target-policy.test.mjs`
- Create: `tests/safety/run-local-zero-spend.test.mjs`
- Create: `tests/safety/tool-policy.test.mjs`
- Create: `tests/safety/network-denial-child.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `parsePrivateTarget(raw: string): CanonicalTarget`
- Produces: `assertSafeAmbientEnvironment(env): void`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs local-only -- <command> [args...]`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- <command> [args...]`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs supabase-cli-2.109.1-release -- <command> [args...]`
- Produces CLI: `node scripts/safety/tool-policy.mjs validate`
- Produces CLI: `node scripts/safety/tool-policy.mjs validate --phase paid-ai-base`
- Produces CLI: `node scripts/safety/tool-policy.mjs decide --tool <id> --policy <paid-ai|production-write> [--target <ref>]`

**Manifest contract:**

```json
{
  "version": 1,
  "tools": [
    {
      "id": "nutrition-enterprise-eval",
      "entrypoint": "scripts/eval/run-nutrition-enterprise-prod.ts",
      "runtime": "node",
      "policies": ["paid-ai", "production-write"],
      "owners": {
        "paid-ai": "ai-offline-harness-task-6",
        "production-write": "security-hardening-task-7"
      },
      "operations": {
        "paid-ai": "nutrition-enterprise-eval",
        "production-write": "nutrition-enterprise-eval-write"
      },
      "classifications": {
        "serviceRole": true,
        "localDb": false
      }
    }
  ]
}
```

This JSON shape is exact: `runtime` is `node` or `shell`; `policies` contains
only sorted, unique `paid-ai` and/or `production-write` values; and the keys in
`owners` and `operations` must exactly equal the `policies` array. There is
exactly one row per entrypoint. AI offline-harness Task 6 creates and owns the
paid-AI rows first. Security Task 0 validates and preserves those rows without
staging them; only when the manifest is absent may Task 0 seed exactly
`{"version":1,"tools":[]}`. Security Task 7 augments each same row with
`production-write` and the `serviceRole`/`localDb` classifications; it never
creates a duplicate row or another paid-AI guard. A dual-policy tool must
receive two successful decisions before execution.

- [ ] **Step 1: Write dependency-free launcher and target-policy tests**

Use Node's built-in test runner so no project tool runs before the launcher
exists. Assert:

- ambient `DIRECT_URL=postgresql://user:secret@db.prod.example:5432/postgres`
  rejects before the injected spawn function runs, even when `DATABASE_URL` is
  local;
- remote `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`,
  `E2E_SUPABASE_URL`, `TEST_DATABASE_URL`, and `TROPHE_API` each reject;
- absent or canonical local database/Supabase variables pass;
- the child receives both database variables pinned to
  `127.0.0.1:54322/postgres`;
- the child receives `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL` pinned to
  `http://127.0.0.1:54321` and fixed non-secret local test keys;
- all discovered paid-provider keys, Langfuse remote credentials, eval auth,
  production-write approvals, remote-seed flags, `VERCEL_ENV`, and
  `TROPHE_ALLOW_PAID_AI` are pinned to empty strings in the child;
- a child that calls `process.loadEnvFile('.env.local')`, `@next/env`, or the
  repository's dotenv loader against a temporary production-shaped
  `.env.local` still sees database/Supabase variables pinned local and every
  paid/live/eval/write value pinned empty;
- `NODE_ENV=test`, `npm_config_ignore_scripts=true`, and an empty temporary
  `npm_config_userconfig` are forced for all profiles so ambient `.npmrc`
  credentials and lifecycle configuration cannot be inherited;
- pure URL-policy fixtures admit only the exact Supabase CLI `v2.109.1`
  checksum/archive paths and one allowed release-asset redirect, without
  opening an external socket;
- errors never contain input userinfo/passwords.

Target parser fixtures cover encoded userinfo, malformed URLs, Supabase direct
and pooler hosts, IPv4 loopback, bracketed IPv6 loopback, deceptive suffixes,
explicit/default ports, and database names.

- [ ] **Step 2: Prove the bootstrap tests fail in an empty environment**

```bash
/usr/bin/env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=test \
  node --test tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs
```

Expected: FAIL because the launcher, parser, network policy, and manifest
validator do not exist. This is the only pre-launcher Node test command.

- [ ] **Step 3: Implement target parsing, environment scrubbing, and network denial**

`parsePrivateTarget` returns only:

```ts
type CanonicalTarget = {
  kind: 'postgres' | 'supabase-http';
  scheme: string;
  host: string;
  port: number;
  database?: string;
  projectRef?: string;
};
```

It never returns username/password/raw URL. `assertSafeAmbientEnvironment`
checks the same `DIRECT_URL || DATABASE_URL` precedence as Drizzle and rejects
any configured remote value before replacing child variables.

The launcher uses an explicit environment allowlist, then adds fixed local
values. It pins safety-sensitive names rather than deleting them, so dotenv,
`@next/env`, and `process.loadEnvFile` cannot rehydrate a secret from
`.env.local`. Its scrub list is generated from the manifest plus semantic
discovery of paid adapters and includes at minimum OpenAI, Anthropic, DeepSeek,
Voyage, Gemini/Google, Mistral, Langfuse, eval credentials/tokens/base URLs,
rate-limit bypass IDs, production-write approvals, remote-seed flags, and
Vercel live flags. It forces `NODE_ENV=test`, lifecycle scripts off, and
`npm_config_userconfig` to a newly created empty file that is removed after the
child exits. The sole lifecycle exception is the exact Task 8 argv
`npm rebuild sharp --ignore-scripts=false`; the launcher admits that tuple only
under `local-only`, while its network guard remains active, and rejects every
other lifecycle opt-out.

Inject `deny-external-network.cjs` through `NODE_OPTIONS`. `local-only` permits
only `localhost`, `127.0.0.0/8`, and `::1`. `npm-registry-readonly` additionally
permits exactly `registry.npmjs.org`. The
`supabase-cli-2.109.1-release` profile permits only the exact HTTPS checksum and
platform archive paths beneath
`github.com/supabase/cli/releases/download/v2.109.1/`, then at most one
validated redirect to `release-assets.githubusercontent.com`; it rejects any
other tag, asset, host, protocol, or redirect. Patch Node
fetch/http/https/net/tls/DNS entry points and reject provider, Supabase,
arbitrary Internet, and direct-IP attempts with sanitized host-only
diagnostics.

- [ ] **Step 4: Implement and validate the shared manifest**

Final `tool-policy.mjs validate` rejects duplicate IDs/entrypoints, unknown fields,
unsorted or duplicate policies, a policy outside `paid-ai` and
`production-write`, owner/operation mappings that do not exactly match the
policy array, owner conflicts, invalid runtime/classification values, and a
paid tool absent from AI Task 6's inventory. `decide` emits one JSON object with
fixed IDs and booleans only; shell consumes its exit status/JSON before any
`psql`, `curl`, `npx`, or service-role client construction.

Task 0 uses `validate --phase paid-ai-base`: it applies the same
ID/entrypoint/runtime/policy/owner/operation checks to AI Task 6's paid rows but
temporarily permits `classifications` to be absent. It never rewrites that
file. Task 7 must add the exact boolean classifications and make final
`validate` pass before any decision is executable.

Add package aliases for convenience, but later plan commands invoke the Node
launcher directly so npm pre/post hooks cannot run outside it.

- [ ] **Step 5: Prove hostile ambient values and non-loopback transports fail**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/network-denial-child.test.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/safety/tool-policy.mjs validate --phase paid-ai-base
```

The child fixture attempts loopback, a provider hostname, a remote Supabase
hostname, raw public IP, `http.request`, `tls.connect`, and `fetch`; only
loopback succeeds. No real provider or production host is contacted because the
guard rejects before socket creation.

- [ ] **Step 6: Commit**

```bash
git add scripts/safety/target-policy.mjs scripts/safety/deny-external-network.cjs scripts/safety/run-local-zero-spend.mjs scripts/safety/tool-policy.mjs tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs tests/safety/network-denial-child.test.mjs
git add -p -- package.json
git diff -- scripts/safety/tool-policy-manifest.json
git diff --cached --name-only
git commit -m "feat(security): add zero-spend local execution boundary"
```

Stage `scripts/safety/tool-policy-manifest.json` in Task 0 only when this task
created the exact empty seed; add that exact path separately after inspecting
it. If AI Task 6 already created it, validate it, preserve its paid rows
byte-for-byte, and omit it from Task 0's index.

### Task 1: Build the transitive AI workload graph and verified principal boundary

**Files:**
- Create: `lib/security/ai-workload-graph.ts`
- Create: `tests/enterprise/ai-workload-graph.test.ts`
- Create: `agents/runtime/principal.ts`
- Create: `tests/agents/principal.test.ts`
- Modify: `lib/security/api-guard.ts`
- Modify: `agents/runtime/types.ts`
- Modify: every graph-discovered AI HTTP/internal root and `executeAiTask` caller
- Modify: `tests/lib/api-guard.test.ts`

**Interfaces:**
- Produces: `discoverAiWorkloads(root): AiWorkload[]`
- Produces: `resolveAiPrincipal(input): Promise<AiPrincipal>`
- Produces:

```ts
type AiPrincipal =
  | { kind: 'end-user'; userId: string; organizationId?: string }
  | { kind: 'system'; workloadId: SystemWorkloadId; organizationId?: string };
```

- [ ] **Step 1: Write the failing cycle-safe graph and regression floor**

Start from every `app/api/**/route.{ts,tsx,js,mjs}` plus every
`executeAiTask` caller. Parse imports, re-exports, literal dynamic imports,
CommonJS `require`, JS-to-TS substitutions, extensionless paths, and index
barrels. Traverse transitively with cycle-safe full chains. A computed local
dynamic/require expression is a finding, not an ignored edge.

Mark a root billable when a reachable module hits `executeAiTask`, a paid
adapter, or a direct paid-provider hostname/SDK. The floor includes:

- `app/api/ai/coach-insight/route.ts`;
- `app/api/ai/conversation/route.ts`;
- `app/api/ai/meal-suggest/route.ts`;
- `app/api/ai/photo-analyze/route.ts`;
- `app/api/coach/shopping-list/route.ts`;
- `app/api/food/parse/route.ts`;
- `app/api/food/recipe-analyze/route.ts`;
- `app/api/coach/meal-plan-macros/route.ts`;
- `app/api/internal/memory-worker/route.ts`.

Assert no discovered billable root is unclassified.

- [ ] **Step 2: Prove direct source-string discovery is insufficient**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/ai-workload-graph.test.ts --reporter=verbose
```

Expected: FAIL on transitive food parse, recipe analyze, meal-plan fan-out, and
memory worker paths.

- [ ] **Step 3: Classify workload controls**

The graph assigns:

- `end-user`: verified `guardAiRoute` identity, durable user limiter, tenant
  resource authorization, and resolved billing principal before tenant reads;
- `authenticated-fanout`: the same controls plus per-request fan-out ceiling,
  concurrency ceiling, and per-attempt budget reservation;
- `internal-scheduled`: exact worker-specific bearer verification, durable
  workload limiter, fixed allowlisted system principal, and workload budget;
- `direct-tool`: manifest-owned by AI offline-harness Task 6 and never
  authorized by the HTTP route policy.

The inventory reports missing control, wrong order, and unsanitized full import
chain. Internal roots must not be forced through end-user auth; end-user routes
must not accept a cron/system principal.

- [ ] **Step 4: Write failing identity and multi-organization tests**

Assert:

- requested organization requires exact `(user_id, org_id)` membership;
- a resource-derived tenant organization overrides caller choice after tenant
  authorization;
- zero memberships resolves to the solo-user budget;
- exactly one membership may be inferred;
- more than one membership without a resource-derived or explicit verified
  organization throws `AmbiguousOrganizationPrincipalError`;
- nonexistent/victim organization throws;
- missing user identity never becomes a fabricated profile;
- only registry-listed, bearer-authenticated workers may create a system
  principal, each with a fixed workload budget ID.

- [ ] **Step 5: Implement principal resolution and controls**

Replace optional raw `context.userId`/`organizationId` attribution with
`AiPrincipal`. Route code may accept an organization selection but cannot pass
it to runtime until membership/resource validation succeeds. Convert
shopping-list and meal-plan-macros to the shared durable AI guard with role and
fan-out options. Bind memory-worker to `workloadId: 'memory-worker'` only after
`MEMORY_CRON_SECRET` validation; inventory every other background caller and
add a distinct fixed workload ID or fail closed.

- [ ] **Step 6: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/ai-workload-graph.test.ts tests/agents/principal.test.ts tests/lib/api-guard.test.ts tests/api --reporter=verbose
git add lib/security/ai-workload-graph.ts agents/runtime/principal.ts agents/runtime/types.ts lib/security/api-guard.ts tests/enterprise/ai-workload-graph.test.ts tests/agents/principal.test.ts tests/lib/api-guard.test.ts
git diff --name-only -- app/api agents
git diff --cached --name-only
git commit -m "fix(security): bind AI workloads to verified principals"
```

Stage only graph-reported route/caller paths from the path-specific diff before
commit.

### Task 2: Model the full provider-specific billable envelope

**Files:**
- Create: `agents/runtime/billable-envelope.ts`
- Create: `tests/agents/billable-envelope.test.ts`
- Modify: `agents/runtime/types.ts`
- Modify: `agents/router/pricing.ts`
- Modify: paid adapters/dispatchers discovered by Task 1
- Modify: provider adapter tests

**Interfaces:**
- Produces: `BillableEnvelope`
- Produces: `estimateWorstCaseMicrousd(envelope): bigint`
- Invariant: unknown model, modality, pricing class, retry count, or token/media conversion denies before provider transport.

- [ ] **Step 1: Write failing envelope and pricing tests**

Define provider fixture cases for:

- plain text input plus adapter overhead;
- JSON/tool schema and descriptions;
- cache-write/read classes, reserving without assuming a discount;
- bounded output and reasoning tokens;
- base64 image bytes, MIME type, dimensions/media token formula;
- embedding batch item count and input token ceiling;
- internal retry count and a separately priced fallback attempt;
- sub-cent cost, exact policy threshold, and one micro-dollar over threshold;
- unknown model/modality/pricing and missing cap.

Assert reservation rounds upward to integer micro-dollars and never rounds down.

- [ ] **Step 2: Prove prompt-only estimation fails**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/billable-envelope.test.ts --reporter=verbose
```

Expected: FAIL because current pricing sees usage after execution and cannot
price tool schema, media, reasoning, embedding, or retries before transport.

- [ ] **Step 3: Implement the envelope contract**

```ts
type BillableEnvelope = {
  provider: PaidProvider;
  model: string;
  text: { inputTokenCeiling: bigint; adapterOverheadTokens: bigint };
  tools?: { schemaBytes: bigint; descriptionBytes: bigint };
  media?: Array<{ kind: 'image'; mime: string; bytes: bigint; width?: number; height?: number }>;
  embedding?: { itemCount: bigint; inputTokenCeiling: bigint };
  cache: { readTokenCeiling: bigint; writeTokenCeiling: bigint };
  outputTokenCeiling: bigint;
  reasoningTokenCeiling: bigint;
  maxPhysicalAttempts: bigint;
  policyMaxMicrousd: bigint;
};
```

Each adapter constructs its own envelope from the exact request it will send.
Tool/schema/media fields are not reconstructed from a short runtime prompt.
Provider-specific conversion/pricing functions are exhaustive. Unknown data
throws `UnpriceableAiRequestError`.

- [ ] **Step 4: Deny over-cap rather than clamping**

Calculate the complete worst case, round up once to micro-dollars, and compare
to `policyMaxMicrousd`. If it exceeds the policy ceiling, throw
`AiRequestCostCeilingExceededError`; never replace the estimate with the cap and
continue. Primary/fallback reserve independently; internal retries are included
in the current attempt envelope.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/billable-envelope.test.ts tests/agents/provider-access.test.ts tests/agents/openai-structured.test.ts tests/agents/anthropic-provider.test.ts tests/agents/deepseek-provider.test.ts --reporter=verbose
git add agents/runtime/billable-envelope.ts agents/runtime/types.ts agents/router/pricing.ts tests/agents/billable-envelope.test.ts
git diff --name-only -- agents/runtime/providers agents/clients tests/agents
git diff --cached --name-only
git commit -m "feat(ai): price complete billable envelopes"
```

Stage only adapters/tests named by the focused diff.

### Task 3: Establish the authoritative local ledger, privileges, and schema-first rollout

**Files:**
- Create: `db/schema/ai_budget_reservations.ts`
- Create: `db/schema/system_ai_budgets.ts`
- Modify: `db/schema/organization_ai_budgets.ts`
- Modify: `db/schema/agent_runs.ts`
- Modify: `db/schema/index.ts`
- Create: the next unused migration with suffix `ai_budget_authoritative_ledger`
- Create: `tests/db/ai-budget-ledger.test.ts`
- Create: `tests/db/ai-budget-privileges.test.ts`
- Create: `docs/runbooks/ai-budget-schema-first-rollout.md`

**Interfaces:**
- Produces RPCs: `public.reserve_ai_budget_attempt`, `public.start_ai_budget_attempt`, `public.settle_ai_budget_attempt`, `public.release_ai_budget_attempt`, `public.retain_ai_budget_attempt`
- Ledger states: `reserved -> started -> settled | released | retained`
- Authoritative amount: reserved/started/retained use `reserved_microusd`; settled uses `settled_microusd`; released uses zero.

- [ ] **Step 1: Write failing schema, precision, concurrency, and privilege tests**

Test the real local PostgreSQL boundary for:

- 20 concurrent reservations at a threshold that admits exactly three;
- daily/monthly UTC half-open windows `[start, next_start)`;
- exact threshold, one micro-dollar over, sub-cent values, UTC midnight and
  month rollover under a fixed clock;
- unique reservation and unique `agent_runs.generation_id`;
- idempotent reserve/transition retries;
- illegal transitions and duplicate settlement;
- crash points before/after every state transition;
- missing budget row, kill switch, victim organization, ambiguous principal;
- anon/authenticated/PUBLIC unable to inspect ledger or execute RPCs;
- service role able to access the ledger only through the named RPCs.

- [ ] **Step 2: Prove the local schema is absent through the launcher**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts
```

Expected: FAIL because the ledger/RPCs do not exist. The launcher pins both DB
variables and rejects any ambient remote `DIRECT_URL` before npm starts.

- [ ] **Step 3: Define fixed-precision authoritative accounting**

Store all limits and ledger amounts as nonnegative `bigint` micro-dollars.
Reservations round upward; trusted settlement converts conservatively and
rejects negative/overflow values. Add uniqueness to
`agent_runs.generation_id`. The ledger, not an eventually updated `agent_runs`
sum, is authoritative:

```text
reserved  => reserved_microusd
started   => reserved_microusd
retained  => reserved_microusd
settled   => settled_microusd
released  => 0
```

No transition removes an amount before its replacement is committed.

- [ ] **Step 4: Implement explicit SECURITY DEFINER boundaries**

Create a dedicated `NOLOGIN` owner `trophe_ai_budget_owner`. Each RPC is
`SECURITY DEFINER SET search_path = pg_catalog`, schema-qualifies every
`public`/`private` object, validates the principal/membership/workload inside
the transaction, locks the exact budget row, and uses one idempotency key per
generation/attempt.

Use these exact signatures (all return the affected
`public.ai_budget_reservations` row):

```sql
public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text)
public.start_ai_budget_attempt(uuid, text)
public.settle_ai_budget_attempt(uuid, bigint, text)
public.release_ai_budget_attempt(uuid, text)
public.retain_ai_budget_attempt(uuid, text)
```

The reserve arguments are attempt ID, generation ID, principal kind, nullable
user ID, nullable organization ID, nullable workload ID, reserved micro-USD,
and idempotency key. Each transition receives attempt ID plus idempotency key;
settlement also receives settled micro-USD. Database constraints require the
one valid identity shape for `end-user` or `system`. Server time is obtained
inside PostgreSQL, never from a caller-supplied timestamp.

For each signature, apply exact ownership and grants, for example:

```sql
ALTER FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text) OWNER TO trophe_ai_budget_owner;
REVOKE ALL ON FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text) TO service_role;
```

Apply equivalent statements to start/settle/release/retain. Tables are RLS
enabled with no anon/authenticated policy. The application calls these RPCs
through the verified service-role server client; no direct client role receives
table access.

- [ ] **Step 5: Add provisioning, backfill, and recovery**

The migration idempotently inserts missing organization budget rows before
enabling fail-closed runtime use. Organization creation provisions its budget
atomically via a schema-qualified trigger/function or the same creation
transaction; test a new organization and conflict-safe retry.

Recovery releases only stale `reserved` rows that have no `started_at`. The
runtime writes `started` before transport, so a crash between state change and
network is conservatively charged. Stale `started` becomes `retained` and keeps
worst case until trusted reconciliation; it is never automatically released.
System workload budgets are explicit rows keyed by allowlisted workload ID.

- [ ] **Step 6: Generate, inspect, and apply only to local**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:generate
git diff -- db/schema drizzle
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:migrate
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/rls.test.ts
```

If the proposed migration ordinal is already used, choose the actual next
unused ordinal; never overwrite or combine a parallel migration.

- [ ] **Step 7: Document release and rollback without executing either**

The runbook states:

1. apply additive schema/RPC migration;
2. verify backfill, new-org provisioning, grants, negative roles, and schema
   version;
3. only then deploy runtime that requires the ledger;
4. never activate a permissive fallback;
5. rollback runtime first while retaining additive ledger schema;
6. remove schema only in a later separately approved change after proving no
   runtime uses it.

This plan performs none of those production actions.

- [ ] **Step 8: Commit**

```bash
git add db/schema/ai_budget_reservations.ts db/schema/system_ai_budgets.ts db/schema/organization_ai_budgets.ts db/schema/agent_runs.ts db/schema/index.ts tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts docs/runbooks/ai-budget-schema-first-rollout.md
git diff --name-only -- drizzle
git diff --cached --name-only
git commit -m "feat(security): add authoritative AI budget ledger"
```

Inspect every generated migration/journal path from the path-specific diff,
confirm it contains only this task's ledger/RPC/grant changes, then add those
exact paths one by one before the cached-name review. Do not use a broad
`git add db/schema` or `git add drizzle`.

### Task 4: Integrate crash-safe reservation into runtime without a fail-open path

**Files:**
- Create: `agents/runtime/budget-reservation.ts`
- Create: `tests/agents/budget-reservation.test.ts`
- Modify: `agents/runtime/execute.ts`
- Modify: `agents/runtime/persistence.ts`
- Modify: `agents/runtime/error-classification.ts`
- Modify: `tests/agents/runtime-execute.test.ts`

**Interfaces:**
- Produces: `reserveAttempt`, `markAttemptStarted`, `settleAttempt`, `releaseUnstartedAttempt`, `retainStartedAttempt`
- Requires: verified `AiPrincipal` and complete `BillableEnvelope`
- Denies: unavailable ledger/RPC/schema, missing budget row, unpriceable request, unknown principal, invalid transition.

- [ ] **Step 1: Write failing ordering, crash, and idempotency tests**

Assert:

1. principal and full envelope resolve before reservation;
2. reservation commits before generation/provider work;
3. `started` commits immediately before the first physical transport;
4. denial/unavailable RPC/missing budget starts zero provider calls;
5. validation failure before `started` releases idempotently;
6. any failure/crash after `started` retains worst case unless trusted usage
   settles it;
7. persistence/settlement retries cannot double-charge or create an uncounted
   window;
8. primary, fallback, and retry accounting matches their envelopes.

- [ ] **Step 2: Prove current runtime lacks the lifecycle**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts -t "budget|reservation|crash|fallback" --reporter=verbose
```

- [ ] **Step 3: Implement mandatory RPC lifecycle**

The RPC client uses the service-role server client only. Generate the attempt
ID, reserve, create the generation record, persist `started`, then invoke the
transport. Settlement writes trusted actual/estimated cost to the authoritative
ledger and telemetry idempotently. A missing function/table/schema marker throws
`AiBudgetInfrastructureUnavailableError`; do not call the old aggregate checker
and do not continue.

Provider adapters expose a callback immediately before each physical transport
so `started` is durable before network. If an adapter can retry internally, its
envelope reserves all allowed physical attempts; it cannot exceed that count.

- [ ] **Step 4: Verify user and system workloads**

Cover end-user, fan-out, and memory-worker principals. A system workload without
an authenticated allowlisted ID or explicit system budget is rejected. Eval
and direct tools remain owned by AI Task 6 and must pass the shared manifest's
paid decision; they do not receive an unmetered runtime context.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts tests/agents/billable-envelope.test.ts tests/agents/principal.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts
git add agents/runtime/budget-reservation.ts agents/runtime/execute.ts agents/runtime/persistence.ts agents/runtime/error-classification.ts tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts
git diff --cached --name-only
git commit -m "fix(ai): enforce crash-safe budget reservations"
```

Commit is implementation-ready but release-blocked by Task 3's separately
approved production schema-first runbook.

### Task 5: Scope workflow provider secrets to exact protected network steps

**Files:**
- Create: `scripts/ci/check-workflow-security.mjs`
- Create: `tests/enterprise/workflow-security.test.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/provider-smoke.yml`
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run guard:workflow-security`
- Rules: `provider-secret-at-job-scope`, `provider-secret-on-nonnetwork-step`, `credential-in-url`, `google-key-not-in-header`

- [ ] **Step 1: Write failing all-workflow policy tests**

Parse every `.github/workflows/*.{yml,yaml}`. Forbid provider secrets at job
scope in every workflow, not only pull-request CI. Forbid them on checkout,
setup, install, cache, test, or build steps. A protected manual provider check
may receive only the one key used by that exact network step. Reject any
credential expression/environment variable in URL/query construction.

- [ ] **Step 2: Prove current workflow scope and Google URL fail**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/workflow-security.test.ts --reporter=verbose
```

- [ ] **Step 3: Implement scanner and workflow changes**

Normal CI gets no real provider secret. Split provider-smoke into one protected
network step per provider, with only that provider's key in step-level `env`.
Keep environment approval and pinned actions. Google uses a key-free URL plus:

```yaml
env:
  GOOGLE_API_KEY: ${{ secrets.GOOGLE_API_KEY }}
```

```ts
headers: {
  'content-type': 'application/json',
  'x-goog-api-key': process.env.GOOGLE_API_KEY,
}
```

Do not execute the workflow.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/ci/check-workflow-security.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/workflow-security.test.ts tests/agents/provider-access.test.ts --reporter=verbose
git add scripts/ci/check-workflow-security.mjs tests/enterprise/workflow-security.test.ts .github/workflows/ci.yml .github/workflows/provider-smoke.yml package.json
git diff --cached --name-only
git commit -m "fix(security): scope provider secrets to network steps"
```

### Task 6: Seal semantic error, telemetry, API, and privileged import boundaries

**Files:**
- Create: `agents/observability/safe-error.ts`
- Create: `lib/security/error-flow.ts`
- Create: `lib/http/internal-error.ts`
- Create: `lib/security/server-runtime.ts`
- Create: `lib/security/privileged-import-graph.ts`
- Create: `tests/agents/error-redaction-boundary.test.ts`
- Create: `tests/agents/langfuse-redaction.test.ts`
- Create: `tests/enterprise/api-error-flow.test.ts`
- Create: `tests/enterprise/privileged-import-graph.test.ts`
- Modify: provider adapters, persistence, Langfuse, and every inventory-reported route

**Interfaces:**
- Produces: `sanitizeProviderFailure(error): SafeProviderFailure`
- Produces: `internalErrorResponse(event: SafeEventId): NextResponse`
- Produces: `assertServerRuntime(boundary: ServerBoundaryId): void`
- Produces: `findErrorFlowViolations(root): ErrorFlowFinding[]`
- Produces: `findPrivilegedClientImportPaths(root): ImportPathFinding[]`

- [ ] **Step 1: Write cross-sink sentinel and semantic-flow tests**

Taint catch bindings and values derived through property access
(`error.message`, `result.error`, `response.detail`), assignment, object
destructuring, template strings, concatenation, return values from registered
error helpers, and fixed-point transitive intraprocedural aliases/call
summaries. Flag tainted values reaching
`NextResponse.json`, `Response`, console/log helpers, persistence, or Langfuse.
Use AST control/data flow rather than source substring matching.

Sentinels must remain absent from thrown/public messages,
`agent_runs.errorMessage`, metadata, Langfuse `statusMessage`, logs, and API
responses. Regression floors include food parse, recipe analyze, local food
search, client message, shopping-list, and every Task 1 billable route.

- [ ] **Step 2: Write the privileged import graph tests**

Start from every `'use client'` JS/JSX/TS/TSX/MJS entry in
`app/components/lib/agents`. Resolve alias, relative, extension/index,
JS-to-TS, imports, re-exports, literal dynamic imports, and `require`
transitively with cycle safety. Flag unresolved computed local dynamic edges.
Targets include database client, service-role Supabase, provider credentials,
secret telemetry, and server auth. Type-only edges are excluded only when the
compiler erases the entire edge.

- [ ] **Step 3: Prove the current sinks and raw API messages fail**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts --reporter=verbose
```

- [ ] **Step 4: Implement allowlisted IDs and centralized serialization**

Use constant registries:

```ts
export const SAFE_EVENT_IDS = {
  ai_provider_failed: true,
  food_parse_failed: true,
  database_operation_failed: true,
} as const;
export type SafeEventId = keyof typeof SAFE_EVENT_IDS;

export const SERVER_BOUNDARY_IDS = {
  database: true,
  service_role: true,
  provider_credentials: true,
  server_observability: true,
} as const;
export type ServerBoundaryId = keyof typeof SERVER_BOUNDARY_IDS;
```

No function accepts a free-form event/boundary string. Provider errors keep only
generic message plus allowlisted status/code/type/request ID/usage/latency.
Persistence, Langfuse, and logs consume the sanitized shape. Public 500s use a
stable generic JSON body.

`assertServerRuntime` is a local portable `typeof window` assertion usable by
Next, Vitest, and `tsx`; do not add a bare `server-only` resolution dependency.
The transitive import graph is the compile-time enforcement.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/api --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run typecheck
git add agents/observability/safe-error.ts lib/security/error-flow.ts lib/http/internal-error.ts lib/security/server-runtime.ts lib/security/privileged-import-graph.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts
git diff --name-only -- agents app/api lib
git diff --cached --name-only
git commit -m "fix(security): seal error and privileged import boundaries"
```

Stage only inventory-reported sink/module paths.

### Task 7: Compose production-write interlocks across Node and shell tools

**Files:**
- Create: `scripts/ci/check-production-mutators.mjs`
- Create: `scripts/safety/require-production-write-approval.mjs`
- Create: `tests/enterprise/production-mutator-inventory.test.ts`
- Create: `tests/safety/production-write-approval.test.mjs`
- Modify: `scripts/safety/tool-policy-manifest.json`
- Modify: every manifest-discovered mutator, including shell
- Modify: `package.json`

**Interfaces:**
- Produces: `npm run guard:production-mutators`
- Produces CLI: `node scripts/safety/require-production-write-approval.mjs --tool <id> --target <ref> [--execute] -- <command>`
- Approval: exact `TROPHE_ALLOW_PRODUCTION_WRITE=<operation-id>:<target-ref>`
- Default: dry-run, zero client/socket/mutation construction.

- [ ] **Step 1: Write failing semantic inventory and private-target tests**

Use TypeScript AST for JS/TS and a tested shell lexer plus `bash -n` for shell.
Inspect executable nodes/tokens, not comments or string examples. Discover
service-role construction, mutating Supabase calls, mutation SQL, `psql`,
production POST/PUT/PATCH/DELETE, and destructive commands.

The floor includes service-role data scripts, erasure smoke, benchmark batch
scripts, `scripts/db/migrate-production.sh`, and local
`scripts/db/bootstrap-local.sh`. Classify bootstrap as `localDb`; classify
migrate-production with the `production-write` policy. `canary-readonly.sh` is
read-only and is never executed by this plan.

Target tests cover credential-bearing PostgreSQL DSNs, encoded userinfo,
Supabase poolers, IPv4/IPv6 loopback, malformed URLs, and redaction. Private
userinfo never enters manifest, `--target`, approval string, errors, or output.

- [ ] **Step 2: Prove unguarded Node and shell mutators fail inventory**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/production-write-approval.test.mjs
```

The second command tests the interlock itself inside the proven Task 0
boundary; it never executes its child.

- [ ] **Step 3: Extend the one shared manifest without duplicating AI Task 6**

For each discovered tool, update the existing manifest row. Paid-only policies
remain owned by `ai-offline-harness-task-6`; production-write policies are
owned by `security-hardening-task-7`. Any remote tool that authenticates with a
service role or can mutate receives `production-write` in addition to any
existing `paid-ai` policy. Task 7 sets `classifications.serviceRole` and
`classifications.localDb` on every row, preserves Task 6's paid owner/operation
values, sorts `policies`, and keeps all three mappings exact. A tool with both
policies must pass:

```text
tool-policy decide --policy paid-ai
AND
tool-policy decide --policy production-write
```

before credential lookup, service client construction, authentication, report
write, or network. There is one tool ID and one row.

- [ ] **Step 4: Implement Node/shell-callable write approval**

Without `--execute`, emit a bounded dry-run plan and exit before mutation.
Remote execution requires exact `--target=<canonical-ref>` and exact approval
value; truthy/mismatched operation/target rejects. Local tools require
`classifications.localDb=true`, exact loopback target, and the Task 0 launcher.

Shell scripts call the Node decision CLI and check its exit status before any
`psql`, `curl`, `npx`, or mutation. Do not source a TypeScript helper from
shell. Add a static ordering test proving decision precedes the first mutation
token.

- [ ] **Step 5: Verify without invoking a real tool**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/safety/tool-policy.mjs validate
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/ci/check-production-mutators.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
```

Tests inject fake clients/transports and assert zero writes for absent,
malformed, mismatched-operation, and mismatched-target approvals. No production
tool is invoked.

- [ ] **Step 6: Commit**

```bash
git add scripts/ci/check-production-mutators.mjs scripts/safety/require-production-write-approval.mjs scripts/safety/tool-policy-manifest.json tests/enterprise/production-mutator-inventory.test.ts tests/safety/production-write-approval.test.mjs package.json
git diff --name-only -- scripts
git diff --cached --name-only
git commit -m "fix(security): compose production mutation interlocks"
```

Stage only manifest-reported mutator paths.

### Task 8: Upgrade exact reviewed dependencies and validate audit output

**Files:**
- Create: `scripts/ci/validate-npm-audit.mjs`
- Create: `scripts/ci/install-supabase-cli-artifact.mjs`
- Create: `scripts/ci/supabase-cli-2.109.1-checksums.json`
- Create: `tests/enterprise/dependency-security.test.ts`
- Create: `tests/safety/supabase-cli-artifact.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify only if a named compatibility check fails: exact source/config path tied to that failure

**Interfaces:**
- Pins: `next@16.2.12`, `eslint-config-next@16.2.12`, `supabase@2.109.1`
- Installs: exact Supabase CLI artifact only after required official and committed SHA-256 checks agree
- Requires: no production or full-tree high/critical advisory
- Prohibits: lifecycle scripts during install, audit suppression, and `npm audit fix --force`

- [ ] **Step 1: Write failing lockfile and audit-validator tests**

Parse lockfile versions and assert exact reviewed pins. Feed the validator:
valid clean JSON, valid advisory JSON with npm exit 1, invalid JSON, registry
error JSON, missing metadata, and truncated output. Advisory exit is distinct
from transport/parse failure; only valid metadata may support a security claim.

Unit-test the Supabase artifact installer with injected local fixtures. Require
the exact `v2.109.1` asset name for each supported OS/architecture, an entry in
the official checksum file, an identical entry in the committed checksum map,
and a matching downloaded archive SHA-256. Reject absent/malformed/conflicting
checksums, wrong versions/platforms, HTTP or extra redirects, oversized
responses, archive traversal, links, extra executable payloads, and a binary
whose reported version is not `2.109.1`. Tests perform no network access.

- [ ] **Step 2: Capture validated baselines through the registry-only profile**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs production /tmp/trophe-prod-audit.json
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs full /tmp/trophe-full-audit.json
node scripts/safety/run-local-zero-spend.mjs local-only -- npm explain next
node scripts/safety/run-local-zero-spend.mjs local-only -- npm explain tar
```

Expected baseline may exit red for advisories, but invalid/failed registry
responses cannot be interpreted as zero vulnerabilities.

- [ ] **Step 3: Install exact packages without lifecycle scripts, then install one verified CLI artifact**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  npm install --ignore-scripts --save-exact next@16.2.12 eslint-config-next@16.2.12
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  npm install --ignore-scripts --save-dev --save-exact supabase@2.109.1
node scripts/safety/run-local-zero-spend.mjs local-only -- npm dedupe
node scripts/safety/run-local-zero-spend.mjs supabase-cli-2.109.1-release -- \
  node scripts/ci/install-supabase-cli-artifact.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node_modules/supabase/bin/supabase --version
```

The package installs use an empty npm user config and cannot run lifecycle
scripts. Do not run Supabase's `postinstall.js`: it may skip verification when
the expected checksum entry is absent. The bespoke installer accepts only the
exact official `v2.109.1` checksum and platform archive URLs, requires the
official checksum entry to equal the reviewed value committed in
`supabase-cli-2.109.1-checksums.json`, verifies SHA-256 before extraction,
extracts only the expected binary into `node_modules/supabase/bin`, enforces
compressed/uncompressed size caps and traversal/link rejection, and atomically
renames the verified result. It removes partial files on failure. The direct
binary command—not `npx`—must print exactly `2.109.1`.

Review the lockfile for fixed nested Next/Sharp/PostCSS and Supabase CLI/`tar`
versions. If a compatibility gate proves Sharp needs its install lifecycle,
allow only this exact command through `local-only` after the launcher validates
the package name and argv:

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm rebuild sharp --ignore-scripts=false
```

That narrow exception remains under loopback-only network denial; arbitrary
`npm rebuild`, another package name, or any pre/post hook remains rejected.

- [ ] **Step 4: Run validated audits and compatibility gates**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs production /tmp/trophe-prod-audit-after.json
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs full /tmp/trophe-full-audit-after.json
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/supabase-cli-artifact.test.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:doctor
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run typecheck
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run lint
node scripts/safety/run-local-zero-spend.mjs local-only -- npm test
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run build
```

Both validated audits must contain valid metadata and zero high/critical
findings. If Supabase CLI `2.109.1` still resolves vulnerable `tar`, the task
remains release-blocking; do not add an exception.

- [ ] **Step 5: Commit**

```bash
git add scripts/ci/validate-npm-audit.mjs scripts/ci/install-supabase-cli-artifact.mjs scripts/ci/supabase-cli-2.109.1-checksums.json tests/enterprise/dependency-security.test.ts tests/safety/supabase-cli-artifact.test.mjs package.json package-lock.json
git diff --name-only
git diff --cached --name-only
git commit -m "chore(security): upgrade reviewed dependencies"
```

Stage a compatibility file only when a path-specific diff and failed check
prove it belongs to this task.

### Task 9: Run the final zero-spend, local/source-only audit

**Files:**
- Create: `docs/quality/security-audit-2026-07-25.md`
- Modify only if made stale by implemented interfaces: `agents/README.md`, `ARCHITECTURE.md`

**Interfaces:**
- Consumes: Tasks 0-8
- Consumes without reimplementation: AI offline-harness Task 6
  `guard:paid-ai-tools` and its `paid-ai` policy fields in
  `tool-policy-manifest.json`
- Produces: ranked final evidence and release blockers

- [ ] **Step 1: Verify every inventory through the safety launcher**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/safety/tool-policy.mjs validate
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run guard:paid-ai-tools
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run guard:production-mutators
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run guard:workflow-security
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/enterprise/ai-workload-graph.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/enterprise/dependency-security.test.ts --reporter=verbose
```

If the paid-tool guard or manifest ownership contract is absent/failing, stop.
Do not duplicate its implementation in this task.

- [ ] **Step 2: Verify principals, envelopes, ledger, and redaction locally**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx vitest run tests/agents/principal.test.ts tests/agents/billable-envelope.test.ts tests/agents/budget-reservation.test.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/lib/api-guard.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/rls.test.ts tests/db/rag-rls.test.ts
```

- [ ] **Step 3: Verify audited dependencies and full project gates**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs production /tmp/trophe-final-prod-audit.json
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/validate-npm-audit.mjs full /tmp/trophe-final-full-audit.json
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run typecheck
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run lint
node scripts/safety/run-local-zero-spend.mjs local-only -- npm test
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run build
```

- [ ] **Step 4: Review security headers from source only**

Inspect Next config, middleware, route response helpers, and header tests for
CSP, HSTS, frame protection, content-type protection, redirect, and cache
policy. Do not run `curl`, browser automation, production canary, or any live
URL. Record production headers as **not live-verified in this plan**. A future
post-deploy verification is a separately authorized phase, not an executable
step here.

- [ ] **Step 5: Write evidence and release status**

For each audit finding record fixed/mitigated/open, two evidence signals,
focused command/result, residual preconditions, current-HEAD correction, and
whether it blocks release. State:

- provider spend `$0.00`;
- no production/provider endpoint or authenticated external system was called;
- migration/RPCs were applied only to local `127.0.0.1:54322/postgres`;
- production schema/runtime remain unchanged;
- runtime release is blocked until the schema-first runbook is separately
  approved and completed;
- production headers were source-reviewed, not live-verified.

- [ ] **Step 6: Verify and safely stage the report**

```bash
rg -n "Critical|Important|Minor|\\$0\\.00|54322|release.blocked|not live-verified|guard:paid-ai-tools" docs/quality/security-audit-2026-07-25.md
git diff --check -- docs/quality/security-audit-2026-07-25.md
git add docs/quality/security-audit-2026-07-25.md
git diff --cached --name-only
git commit -m "docs(security): record fail-closed security evidence"
```

If `agents/README.md` or `ARCHITECTURE.md` became stale, update and commit each
in a separate path-specific documentation commit. Never stage them with the
evidence report in a shared worktree.
