# Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the validated AI cost-governance, secret-surface, telemetry-redaction, production-tooling, dependency, and privileged-import defects with zero paid-provider spend and zero production access.

**Architecture:** A dependency-free launcher drives every real repository command inside a digest-pinned rootless Linux runner whose kernel network is `none` or an internal-only bridge. The only external path is a small, manifest-driven egress gateway used by bounded prefetch/audit phases; tests, installs, builds, migrations, and application code never receive a default route or runtime socket. A cycle-safe workload graph assigns every AI path a verified principal, provider adapters bind full billable envelopes to reproducible pricing evidence, and PostgreSQL atomically moves each attempt through `reserved -> started -> settled | released | retained`.

**Tech Stack:** TypeScript 5, Node.js `20.19.5`, npm `10.8.2`, Podman `5.4.2` rootless, Next.js 16 App Router, Vitest 4, Drizzle ORM/PostgreSQL, Supabase SSR/PostgREST, GitHub Actions.

## Global Constraints

- Paid AI/provider spend is exactly USD `$0.00` throughout implementation and verification.
- Production access is forbidden, including read-only HTTP checks. Do not authenticate, call production, run provider smoke/evals, deploy, merge, push, link Supabase, or apply a remote migration.
- The canonical local database is exactly `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; the canonical local Supabase HTTP origin is exactly `http://127.0.0.1:54321`.
- Task 0's launcher must pass before any other task runs `db:generate`, `db:migrate`, database tests, Vitest, typecheck, lint, build, install, registry metadata, or audit commands.
- After Task 0, every `node`, `npm`, or `npx` execution in this plan—including staging helpers—goes through `node scripts/safety/run-local-zero-spend.mjs <profile> -- ...`. Bare read-only `git`/`rg`/path inspection, exact `git apply --cached` of a verified owned patch, and `git commit` remain allowed.
- The launcher rejects remote ambient database/Supabase configuration before spawning, pins both database variables to the canonical local target, scrubs paid/live/write/eval state, and starts every real command in the pinned rootless Linux runner. It never treats in-process JavaScript patches as a security boundary.
- Database migrations/RPCs may be generated, applied, and concurrency-tested only on the canonical local database. The production schema remains unchanged until a separately authorized schema-first release.
- Runtime activation is release-blocked behind schema/backfill/privilege verification. There is no legacy or fail-open budget fallback.
- Do not print or persist credential values. URL userinfo is private parser input and is discarded before diagnostics, manifests, approval tokens, or logs.
- Every defect is fixed test-first. Observe the focused regression fail for the expected reason, implement the minimum boundary, then run the focused and adjacent suites through the launcher.
- Inventories are discovery-driven and fail on unclassified roots, unresolved local dynamic edges, duplicate manifest entries, or unknown pricing/modality.
- Repository, npm, test, build, audit, migration, Supabase, and staging workloads require the proved rootless container boundary. If the pinned runtime/image/config or kernel proof is unavailable, hard-stop `isolated_runner_unavailable`; there is no portable or Seatbelt execution fallback.
- The trusted dependency-free launcher/orchestration controller runs host-side
  only to verify the pinned runtime, create namespaces/containers, and collect
  bounded attestations; it never imports application/package code or acts as
  the containment boundary. The only host-side repository test workload is
  Task 0's dependency-free policy-unit suite. Those tests import only declared
  `scripts/safety/**` policy modules, receive no repository/npm credentials,
  perform no application import or real transport, and are not evidence that
  untrusted Node is contained.
- Repository dotenv/npm configuration is unreadable inside the runner: the worktree is read-only, `.env*`/`.npmrc` are overmounted with empty read-only files, HOME/XDG/npm config are fresh, and only declared output mounts are writable.
- Command environments are explicit: `NODE_ENV=test` for tests and local DB fixtures, `NODE_ENV=production` for the exact `npm run build` tuple, and `NODE_ENV=development` for lifecycle-disabled dependency/audit commands.
- All implementation tasks run in a clean isolated worktree. A staging helper records starting blob/worktree fingerprints, refuses dirty or concurrently changed shared paths, stages existing files through a reviewed binary patch, and compares the cached hunk inventory to that task patch. Package/lockfile and migration generation are forbidden outside this isolation.

**Task-owned staging protocol:** Task 0 commits
`scripts/safety/task-ownership.json`, whose exact static paths and dynamic
inventory IDs cover Tasks 0A-9. For every task, the shown `begin`,
`build-patch`, and `verify-patch` commands use identical
`--task <id> --declarations scripts/safety/task-ownership.json`; no phase may
add an argument. `begin` records
`git status --porcelain=v2 --untracked-files=all`, requires every declared new
path absent, hashes all shared paths and dynamic inventories, and rejects every
undeclared tracked or untracked change. The launcher mounts the worktree and
Git metadata read-only and only
`.artifacts/security/staging/<task-id>/` read-write. The helper writes an owned
binary patch and hunk manifest there; it never edits the Git index. After
`verify-patch`, bare Git applies that exact patch with
`git apply --cached --check` and `git apply --cached`. Launcher-wrapped
`verify-index` then reads the index read-only and requires identical
path/hunk/patch hashes. Mixed ownership, a newly appearing path, changed
inventory, or any other untracked file aborts.

`task-ownership.json` has exactly `version` and `tasks`. Each task object has
sorted, unique repo-relative `shared`, `new`, and `dynamicInventoryIds` arrays;
unknown keys, globs, absolute paths, parent traversal, symlinks, duplicate
paths, or overlap between `shared` and `new` reject. Every `Modify:` path in
the task's file list is copied to `shared`, every `Create:` path to `new`, and
each described generated inventory to `dynamicInventoryIds`. Dynamic IDs map
only to the fixed ignored
`.artifacts/security/ownership/<inventory-id>.json` path and that file records
HEAD, sorted paths, per-path starting blob/absence, and its SHA-256. `begin`
hashes the complete declaration file bytes plus every inventory; later phases
must match those exact hashes and may not substitute flags or paths.

The complete pre-edit `begin` command for each post-bootstrap task is:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0a -- node scripts/safety/stage-task-owned.mjs begin --task security-task-0a --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0b -- node scripts/safety/stage-task-owned.mjs begin --task security-task-0b --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-1 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-1 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-2 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-2 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-3 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-3 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-4 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-4 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-5 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-5 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-6 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-6 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-7 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-7 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-8 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-8 --declarations scripts/safety/task-ownership.json
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-9 -- node scripts/safety/stage-task-owned.mjs begin --task security-task-9 --declarations scripts/safety/task-ownership.json
```

Task 0B must commit the graph exporter before the Task 1/2 begin commands;
those two commands first regenerate their fixed ownership files exactly as
shown in their tasks.

---

## Planned File Map

- `scripts/safety/run-local-zero-spend.mjs`: dependency-free host controller for `policy-unit-only`, `isolated-offline`, `isolated-db`, `isolated-prefetch`, and `isolated-staging`.
- `scripts/safety/isolation-lock.json`: exact runner index/platform digests, Node/npm, Podman machine/runtime/config hashes, supported host matrix, and canonical lockfile platform.
- `scripts/safety/rootless-runner.mjs`: provision/verify names, mounts, namespaces, resource limits, and hard-stop reasons.
- `scripts/safety/egress-gateway.mjs`: the sole dual-homed process; exposes only manifest-ID fetch/audit endpoints and validates method, host, path, redirects, size, and integrity.
- `scripts/safety/prefetch-artifacts.mjs`: parse lock/artifact manifests and request only exact IDs from the gateway into a fresh immutable cache.
- `scripts/safety/local-stack-orchestrator.mjs`: create the pinned no-pull Supabase service topology without exposing the Podman socket to workloads.
- `scripts/safety/loopback-relay.mjs`: runner-namespace loopback bindings for canonical DB/API ports.
- `scripts/safety/isolation-topology.json`: exact names, networks, containers, endpoints, ports, health, collision, and teardown contract.
- `scripts/safety/guarded-runtime-preload.cjs`: defense-in-depth only; never cited as the process/network boundary.
- `scripts/safety/sensitive-file-policy.mjs`: dotenv/npm masking and guard-state revalidation.
- `scripts/safety/stage-task-owned.mjs`: clean-isolated-worktree and exact cached-hunk ownership enforcement.
- `scripts/safety/apply-task-owned.sh`: fixed-enum host wrapper that runs build/verify in isolated staging, applies the exact patch, then verifies the index.
- `scripts/safety/task-ownership.json`: exact per-task static paths and deterministic dynamic inventory inputs.
- `scripts/safety/target-policy.mjs`: credential-redacting DSN/URL parser and canonical target comparison.
- `scripts/safety/tool-policy-manifest.json`: one language-neutral inventory shared with AI offline-harness Task 6 and production-write hardening.
- `scripts/safety/tool-policy.mjs`: validate manifest ownership and return composed policy decisions to Node or shell callers.
- `scripts/ci/bootstrap-clean-checkout.mjs`: dependency, exact Supabase CLI, and local-stack bootstrap without `npx`.
- `scripts/ci/check-toolchain.mjs`: enforce Node `20.19.5`, npm `10.8.2`, runner digest, and canonical lockfile platform before any real command.
- `scripts/ci/export-static-ownership.mjs`: dependency-free fixed-ID superset inventories for Tasks 6 and 7 before their semantic scanners exist.
- `scripts/ci/export-ai-workload-paths.mjs`: committed early graph CLI that produces Task 1 and Task 2 ownership inventories before their `begin`.
- `scripts/ci/install-supabase-cli-artifact.mjs`: lifecycle-free exact CLI artifact installer.
- `scripts/ci/supabase-cli-2.109.1-platforms.json`: exact supported platform/arch/archive/checksum/executable/bin-link contract.
- `scripts/ci/supabase-local-images-2.109.1.json`: pinned local image-digest inventory required before `supabase start`.
- `lib/security/ai-workload-graph.ts`: transitive route/caller graph, principal classification, and control findings.
- `agents/runtime/principal.ts`: verified end-user and allowlisted system-workload principal types.
- `agents/runtime/billable-envelope.ts`: provider-specific worst-case billable units and micro-dollar ceiling.
- `db/schema/ai_budget_reservations.ts`: authoritative per-attempt ledger.
- `db/schema/user_ai_budgets.ts`: authoritative server-owned solo-user daily/monthly limits.
- `agents/runtime/budget-reservation.ts`: service-role RPC client for reserve/start/settle/release/retain transitions.
- `agents/router/pricing-snapshots/2026-07-26.v1.json`: immutable, expiring, source-attributed conservative prices.
- `agents/router/pricing-evidence/2026-07-26/raw/*`: bounded immutable provider source fragments and response metadata.
- `agents/router/pricing-evidence/2026-07-26/normalized/*.json`: deterministic normalized source tables and conversion rules.
- `agents/router/pricing-evidence/2026-07-26/extraction-manifest.v1.json`: every generated price/class/conversion row mapped to a raw artifact and exact locator.
- `scripts/ci/build-pricing-snapshot.mjs`: reproduce normalized evidence and generated snapshot byte-for-byte or fail uncovered.
- `agents/router/pricing-snapshot.ts`: exact alias/class resolution and missing/expired-price denial.
- `scripts/ops/recover-ai-budget-attempts.ts`: fixed-policy, idempotent stale-attempt recovery caller.
- `app/api/internal/ai-budget-recovery/route.ts`: separately authenticated recovery endpoint; it does not overload invite recovery.
- `scripts/ci/check-workflow-security.mjs`: all-workflow job/step secret policy and Google-header guard.
- `agents/observability/safe-error.ts`: allowlist-only persistence/Langfuse/log serialization.
- `lib/security/error-flow.ts`: semantic error-derived response/log inventory.
- `lib/security/privileged-import-graph.ts`: transitive client-to-privileged import guard.
- `scripts/ci/check-production-mutators.mjs`: semantic JS/TS/shell mutator inventory backed by the shared manifest.
- `scripts/ci/run-npm-audit.mjs`: fresh bounded npm-audit capture, schema/exit validation, and atomic artifact publication.
- `docs/runbooks/ai-budget-schema-first-rollout.md`: non-executable deploy/rollback order.
- `docs/quality/security-audit-2026-07-25.md`: final local/source evidence and residual risk.

### Task 0: Build and prove the scrubbed zero-spend/local execution boundary

**Files:**
- Create: `scripts/safety/target-policy.mjs`
- Create: `scripts/safety/isolation-lock.json`
- Create: `scripts/safety/isolation-topology.json`
- Create: `scripts/safety/rootless-runner.mjs`
- Create: `scripts/safety/egress-gateway.mjs`
- Create: `scripts/safety/prefetch-artifacts.mjs`
- Create: `scripts/safety/local-stack-orchestrator.mjs`
- Create: `scripts/safety/loopback-relay.mjs`
- Create: `scripts/safety/guarded-runtime-preload.cjs`
- Create: `scripts/safety/sensitive-file-policy.mjs`
- Create: `scripts/safety/stage-task-owned.mjs`
- Create: `scripts/safety/apply-task-owned.sh`
- Create: `scripts/safety/task-ownership.json`
- Create: `scripts/safety/run-local-zero-spend.mjs`
- Create: `scripts/ci/check-toolchain.mjs`
- Create: `scripts/ci/export-static-ownership.mjs`
- Create: `scripts/ci/validate-npm-audit.mjs`
- Create: `scripts/ci/run-npm-audit.mjs`
- Create: `scripts/safety/tool-policy.mjs`
- Create: `tests/safety/target-policy.test.mjs`
- Create: `tests/safety/run-local-zero-spend.test.mjs`
- Create: `tests/safety/tool-policy.test.mjs`
- Create: `tests/safety/network-denial-child.test.mjs`
- Create: `tests/safety/process-tree-isolation.test.mjs`
- Create: `tests/safety/internal-binding-hostile.test.mjs`
- Create: `tests/safety/rootless-runner-integration.test.mjs`
- Create: `tests/safety/egress-gateway.test.mjs`
- Create: `tests/safety/local-stack-topology.test.mjs`
- Create: `tests/safety/hostile-env-npm.test.mjs`
- Create: `tests/safety/command-environment.test.mjs`
- Create: `tests/safety/stage-task-owned.test.mjs`
- Create: `tests/safety/npm-audit-runner.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `parsePrivateTarget(raw: string): CanonicalTarget`
- Produces: `assertSafeAmbientEnvironment(env): void`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs policy-unit-only -- <node-test-command>`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs isolated-offline -- <command> [args...]`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs isolated-db -- <command> [args...]`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- <prefetch-or-audit-command>`
- Produces CLI: `node scripts/safety/run-local-zero-spend.mjs isolated-staging --task <id> -- <staging-command>`
- Produces CLI: `node scripts/safety/tool-policy.mjs validate`
- Produces CLI: `node scripts/safety/tool-policy.mjs validate --phase paid-ai-base`
- Produces CLI: `node scripts/safety/tool-policy.mjs decide --tool <id> --policy <paid-ai|production-write> [--target <ref>]`
- Produces: `assertPinnedIsolationHost(lock, hostProbe): SupportedHost`
- Produces: `createIsolatedRun(runId, profile): IsolatedRun`
- Produces: `assertGuardState(boundary, env): void`
- Produces CLI: `node scripts/safety/stage-task-owned.mjs begin|build-patch|verify-patch|verify-index --task <id> --declarations scripts/safety/task-ownership.json`
- Produces CLI: `bash scripts/safety/apply-task-owned.sh security-task-0a|security-task-0b|security-task-1|security-task-2|security-task-3|security-task-4|security-task-5|security-task-6|security-task-7|security-task-8|security-task-9`
- Produces CLI: `node scripts/ci/run-npm-audit.mjs <production|full> --label <baseline|after|final>`

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
paid-AI rows first. Commit `a276402` is an execution prerequisite and supplies
the reviewed 18-row manifest, including `scripts/rag/ingest-document.ts`.
Security Task 0 validates and preserves those rows without staging them;
missing, fewer-than-18, or unclassified paid rows hard-stop. Security Task 7
augments each same row with
`production-write` and the `serviceRole`/`localDb` classifications; it never
creates a duplicate row or another paid-AI guard. A dual-policy tool must
receive two successful decisions before execution.

`classifications.localDb=true` has one narrow meaning: the executable is
structurally and at runtime forced through `isolated-db` to the canonical
`127.0.0.1:54322` PostgreSQL or `127.0.0.1:54321` Supabase target, and it
rejects caller-supplied targets plus remote database/Supabase environment
before constructing a client. Merely importing a database client or normally
using a database never qualifies. `scripts/rag/ingest-document.ts` therefore
remains `localDb:false` because it can accept a remote target; Task 7 must add
its `production-write` policy and require the exact remote target approval
before credentials, client construction, or mutation.

- [ ] **Step 1: Write dependency-free launcher and target-policy tests**

Use Node's built-in test runner so no project tool runs before the launcher
exists. Assert:

First require `git status --porcelain=v2 --untracked-files=all` to be empty.
For every path named `Create:` in Task 0, require filesystem absence and record an
absence marker plus the starting HEAD and `package.json` blob in
`.artifacts/security/staging/security-task-0/bootstrap.json`. If the worktree
contains any tracked/untracked path or a declared new path already exists,
abort before writing tests. Task 0 is the sole bootstrap exception to the
not-yet-created helper; `verify-patch --bootstrap-task-0` must reproduce those
records and accept only the declared `package.json` patch plus paths proven
absent.

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
- children cannot read repository `.env`, `.env.*`, or `.npmrc` through
  `process.loadEnvFile`, `@next/env`, dotenv with `override`, delete-and-reload,
  `fs`, `fs/promises`, streams, or file descriptors; attempts fail with a
  name/rule-only error before parsing;
- tests/DB fixtures receive `NODE_ENV=test`, exact `npm run build` receives
  `NODE_ENV=production`, and install/audit commands receive
  `NODE_ENV=development`; every command class receives lifecycle scripts off,
  a temporary empty HOME/XDG/npm config/cache, and no inherited credential,
  proxy, live/write/eval, database, or `npm_config_*` value outside the fixed
  allowlist;
- project `.npmrc` with credential, registry override, proxy, CA-file, or
  lifecycle settings rejects before spawn; user/global configs remain empty
  even when ambient npm config points elsewhere;
- `npx` without `--no-install`, an unresolved local package binary, or a
  command that would consult the registry under `isolated-offline` rejects before
  spawn;
- pure URL-policy fixtures admit only the exact Supabase CLI `v2.109.1`
  checksum/archive paths and one allowed release-asset redirect, without
  opening an external socket;
- errors never contain input userinfo/passwords.
- `policy-unit-only` rejects any import outside the explicit Task 0 policy-test
  module graph, any package resolution, application file, npm command, worker,
  child, internal binding, or real socket;
- every real profile refuses before command spawn when Podman/runtime config,
  supported host, runner digest, Node/npm version, rootless status, or the
  kernel no-route proof does not exactly match `isolation-lock.json`.

Target parser fixtures cover encoded userinfo, malformed URLs, Supabase direct
and pooler hosts, IPv4 loopback, bracketed IPv6 loopback, deceptive suffixes,
explicit/default ports, and database names.

- [ ] **Step 2: Prove the bootstrap tests fail in an empty environment**

```bash
/usr/bin/env -i PATH="$PATH" HOME="$HOME" CI=1 NODE_ENV=test \
  node --test tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs
```

Expected: FAIL because the launcher, parser, guard, isolation selector, and
manifest validator do not exist. This is the only pre-launcher Node test
command. Run it from the required clean isolated worktree; abort if any tracked
path is dirty.

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

The launcher creates a mode-`0700` temporary home and XDG tree plus empty
mode-`0600` user/global npm config files, sets npm config locations explicitly,
and rejects every ambient `npm_config_*` not named in its allowlist. It
statically rejects a project `.npmrc` containing auth, registry overrides,
proxy, CA-file, or lifecycle directives. The guard denies repository
`.env`, `.env.*`, and `.npmrc` through all synchronous/asynchronous `fs`
entrypoints; the OS/container backends mount or mask them as unreadable too.
The launcher pins safety-sensitive names rather than merely deleting them and
creates a nonce-bound guard state. `assertGuardState` revalidates the nonce,
scrubbed values, dotenv/npm policy, and profile immediately before credential
lookup, spawn/fork/worker creation, and each transport call. Deleting or
overriding a pinned variable invalidates the process and fails closed.

The scrub list is generated from the manifest plus semantic discovery of paid
adapters and includes at minimum OpenAI, Anthropic, DeepSeek, Voyage,
Gemini/Google, Mistral, Langfuse, eval credentials/tokens/base URLs, rate-limit
bypass IDs, production-write approvals, remote-seed flags, Vercel live flags,
`HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, and credential-shaped npm
variables. The sole lifecycle exception is the exact Task 8 argv
`npm rebuild sharp --ignore-scripts=false`; only `isolated-offline` admits that tuple
with external network still denied.

Inject `guarded-runtime-preload.cjs` as defense in depth and keep its transport,
spawn, worker, redirect, and sensitive-file assertions, but do not count those
assertions as containment. `isolated-offline`, `isolated-db`, and
`isolated-staging` have no kernel route to an external interface.
`isolated-prefetch` gives only the manifest-driven gateway container an
external interface; the client container is connected solely to the internal
prefetch network and can address only `http://gateway:18080`.

- [ ] **Step 4: Enforce the process-tree boundary and task-owned staging**

`isolation-lock.json` pins:

- host support exactly `darwin/arm64` developer and `linux/amd64` self-hosted
  CI; every other host is unsupported and red;
- Podman `5.4.2`, rootless UID mapping, cgroup v2, netavark backend, machine
  image/config hashes, and the exact policy/registries configuration hashes;
- a Node `20.19.5` runner OCI index digest plus separate
  `linux/arm64`/`linux/amd64` manifest and config digests; both images must
  report npm `10.8.2`;
- canonical lockfile generation only on `linux/amd64`. Darwin developers may
  run `npm ci --offline` in the Linux/arm64 runner but may not mutate
  `package-lock.json`.

The lock file is tracked with real `sha256:` values obtained and independently
reviewed during Task 0; no tag-only reference is executable. `rootless-runner`
uses `--pull=never`, verifies image ID/config/architecture after create,
`--read-only`, `--cap-drop=all`, `--security-opt=no-new-privileges`,
`--pids-limit=512`, fixed memory/CPU/time limits, and only declared RO/RW
mounts. No runner receives the Podman/Docker socket. Standard GitHub-hosted CI
is explicitly unsupported; Task 5 keeps its security gate red unless a
self-hosted runner labelled
`self-hosted,linux,x64,trophe-rootless-podman-5.4.2` passes the exact lock
attestation.

`isolation-topology.json` defines one UUID `runId` and these exact names:

- `trophe-sec-<runId>-offline` (`--network=none`);
- `trophe-sec-<runId>-internal` (Podman `internal=true`);
- `trophe-sec-<runId>-prefetch` (client-only internal bridge);
- `trophe-sec-<runId>-egress` (gateway's sole external bridge);
- containers `trophe-sec-<runId>-runner`,
  `-gateway`, `-relay`, and `-supabase-<service-id>`.

Every object carries labels `io.trophe.safety.run=<runId>` and
`io.trophe.safety.owner=trophe-security-plan`. Name collision with an absent or
different label aborts; never delete it. Teardown stops/removes only matching
labels in reverse dependency order, verifies no matching container/network
remains, and records failure as red. SIGINT/SIGTERM/timeout invokes the same
idempotent teardown. No random host port is published.

The gateway is the only container on both prefetch and egress networks and
exposes on the internal side exactly:

- `GET /v1/health` (fixed JSON, no upstream);
- `POST /v1/fetch` with a manifest artifact ID, never a caller URL;
- `POST /v1/npm-audit` with mode, lockfile SHA-256, and the exact bounded npm
  audit body;
- `POST /v1/shutdown` with the run nonce.

It accepts at most 4 KiB request metadata and 8 MiB response bodies, resolves
only the exact scheme/host/port/path/method in the tracked artifact manifest,
validates every redirect before following, denies raw IP/alternate port/DNS
rebinding, strips auth/cookies/proxy headers, and verifies integrity before
atomic cache publication. Unknown ID/method/path returns fixed rule JSON. The
prefetch/audit client has no default route, so internal bindings, native
children, or cleared environment can reach only the gateway. Installs,
tests/build, and migrations consume the immutable cache with network
`none`/`internal`; no npm or application command has live egress.

Real hostile integration starts an untrusted descendant inside the pinned
runner and attempts public/wrapped APIs plus
`process.binding('spawn_sync')`, `process.binding('tcp_wrap')`,
`process.binding('udp_wrap')`, `process.binding('process_wrap')`,
`process.binding('fs')`, `process._linkedBinding`, raw syscalls through native
`curl`/Python/shell, cleared `NODE_OPTIONS`, worker/fork, HTTP/2, UDP,
WebSocket, imported Undici, raw IP, redirect, direct gateway bypass, and direct
upstream DNS/IP. Under offline/internal profiles every attempt is denied by
the namespace/route; under prefetch only valid manifest IDs succeed through
the gateway. The test verifies a real descendant PID/cgroup/network namespace,
not an injected connector. An unavailable proof is failure, never skip.

`stage-task-owned` runs in `isolated-staging`. The launcher automatically
mounts the worktree/Git metadata read-only and only the selected task's
`.artifacts/security/staging/<task-id>/` directory read-write. `begin` requires
all declared new paths absent and includes all untracked paths. `build-patch`
revalidates the identical declarations/inventory hashes and writes the patch;
`verify-patch` checks path/hunk ownership before bare Git applies it.
`verify-index` remounts Git read-only and compares the cached diff to the exact
patch. The helper has no write mount to the worktree, index, refs, or object
database.

`run-npm-audit.mjs` is dependency-free and is the only audit entrypoint. It
creates a fresh audit-client container with only `package.json`,
`package-lock.json`, an empty cache, and the prefetch network; it mounts no
application source or credentials. That client spawns exactly
`npm audit --omit=dev --json` for `production` and `npm audit --json` for
`full`. Its only routable peer is the gateway, which admits exactly
`POST https://registry.npmjs.org/-/npm/v1/security/audits/quick` for the
bounded lock-derived body. Timeout is 120 seconds and stdout/stderr caps are
8 MiB. The runner captures the actual exit code and requires npm audit report version 2:
numeric `metadata.vulnerabilities` counts, dependency metadata, and a
`vulnerabilities` object. Exit `0` is valid only for a structurally valid
report; exit `1` is advisory-bearing only when the valid report's counts agree
with its vulnerability rows. Timeout, signal, exit greater than `1`, invalid or
truncated JSON, registry-error JSON, missing metadata, or count mismatch is
red—not “zero vulnerabilities.”

Each invocation generates a UUID run ID and UTC start/finish timestamps, binds
command/mode, current HEAD, `package-lock.json` SHA-256, Node/npm versions,
actual exit, stdout SHA-256, validation result, and full bounded report. It
writes to a new ignored
`.artifacts/security/npm-audit/<run-id>-<label>-<mode>.json` by
mode-`0600` temporary file, fsync, and atomic no-overwrite rename. The validator
rejects an artifact older than five minutes, a reused run ID/output path, wrong
label/mode/command, or current lockfile/HEAD mismatch. Tests inject fake
processes; they never contact a registry.

- [ ] **Step 5: Implement and validate the shared manifest**

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

- [ ] **Step 6: Prove hostile ambient values and non-loopback transports fail**

```bash
node scripts/safety/run-local-zero-spend.mjs policy-unit-only -- \
  node --test tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/hostile-env-npm.test.mjs tests/safety/command-environment.test.mjs tests/safety/stage-task-owned.test.mjs tests/safety/egress-gateway.test.mjs tests/safety/local-stack-topology.test.mjs tests/safety/npm-audit-runner.test.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/network-denial-child.test.mjs tests/safety/process-tree-isolation.test.mjs tests/safety/internal-binding-hostile.test.mjs tests/safety/rootless-runner-integration.test.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/safety/tool-policy.mjs validate --phase paid-ai-base
```

The real descendant proof must show kernel denial even when every JavaScript
guard is bypassed. No provider/production host is contacted: invalid attempts
have no route, and the gateway tests use an injected loopback upstream.

- [ ] **Step 7: Commit the exact owned patch**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0 -- \
  node scripts/safety/stage-task-owned.mjs build-patch --task security-task-0 \
  --declarations scripts/safety/task-ownership.json \
  --bootstrap-task-0
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0 -- \
  node scripts/safety/stage-task-owned.mjs verify-patch --task security-task-0 \
  --declarations scripts/safety/task-ownership.json --bootstrap-task-0
git apply --cached --check .artifacts/security/staging/security-task-0/owned.patch
git apply --cached .artifacts/security/staging/security-task-0/owned.patch
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0 -- \
  node scripts/safety/stage-task-owned.mjs verify-index --task security-task-0 \
  --declarations scripts/safety/task-ownership.json --bootstrap-task-0
git commit -m "feat(security): add zero-spend local execution boundary"
```

The base manifest is read-only input from `a276402`; Task 0 never stages it.

### Task 0A: Reproduce dependencies, install the exact Supabase CLI, and bring up the canonical local stack

This task is a hard prerequisite for Task 1. It resolves a clean checkout before
any project test, migration, or local database command is attempted.

**Files:**
- Create: `.nvmrc`
- Create: `.node-version`
- Create: `scripts/ci/bootstrap-clean-checkout.mjs`
- Create: `scripts/ci/install-supabase-cli-artifact.mjs`
- Create: `scripts/ci/supabase-cli-2.109.1-platforms.json`
- Create: `scripts/ci/supabase-cli-2.109.1-checksums.json`
- Create: `scripts/ci/supabase-local-images-2.109.1.json`
- Create: `scripts/ci/supabase-stack-2.109.1.json`
- Create: `tests/safety/clean-checkout-bootstrap.test.mjs`
- Create: `tests/safety/supabase-cli-artifact.test.mjs`
- Create: `tests/safety/local-stack-real-integration.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/db/bootstrap-local.sh`

**Pinned dependency contract:**

- exact toolchain: `.nvmrc` and `.node-version` contain `20.19.5`;
  `package.json.engines` requires exactly Node `20.19.5` and npm `10.8.2`;
  `packageManager` is `npm@10.8.2`;
- `check-toolchain.mjs` runs before prefetch, lock mutation, install, audit,
  test, or build and compares the process plus runner image/config digests to
  `isolation-lock.json`;
- canonical lockfile generation is only `linux/amd64`; Darwin/arm64 may prove
  the same committed lock/tree installs in its Linux/arm64 runner but cannot
  write `package-lock.json`;
- lifecycle-disabled clean install:
  `npm ci --offline --ignore-scripts --include=dev` from an initially empty
  cache populated and sealed by the manifest-driven prefetch phase;
- local execution only: `npx` is forbidden for bootstrap and every later
  `npx` tuple requires `--no-install`;
- exact checksum asset `supabase_2.109.1_checksums.txt`.

**Supabase execution support:**

| Host | Isolated runner | Executed archive | Support gate |
|---|---|---|---|
| `darwin/arm64` | pinned `linux/arm64` | `supabase_linux_arm64.tar.gz` | real checksum/extract/mode/link/`--version` proof in the Podman machine |
| `linux/amd64` | pinned `linux/amd64` | `supabase_linux_amd64.tar.gz` | real proof on the attested self-hosted CI runner |

`darwin/arm64`, `darwin/amd64`, `windows/arm64`, and `windows/amd64` release
archives remain checksum metadata only. They are not installed, linked,
executed, or described as supported. Windows and standard GitHub-hosted runners
hard-stop `unsupported_isolation_host`. The two executed Linux binaries install
under `.artifacts/tools/supabase/2.109.1/<runner-arch>/supabase`, mode `0755`,
with `.artifacts/bin/supabase` resolving to the active runner architecture.
The platform JSON marks each row `executed-supported` or `metadata-only`;
unsupported rows can never be selected by the installer.

- [ ] **Step 1: Record staging ownership and write offline bootstrap tests**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0a -- \
  node scripts/safety/stage-task-owned.mjs begin --task security-task-0a \
  --declarations scripts/safety/task-ownership.json
```

The Task 0 declaration lists all three shared files and every new file above;
`begin` proves new-path absence and a completely clean tracked/untracked
worktree. Fixtures use local fake registries, archives, checksums, process
adapters, image inventory, and status JSON. Assert:

- a clean checkout with no `node_modules`, empty npm cache, and local fixture
  prefetch produces an immutable cache; the subsequent install is offline,
  lifecycle-disabled, and contains no `npx`;
- toolchain mismatch, wrong host/runner architecture, tag-only image,
  non-rootless runtime, or lock mutation outside Linux/amd64 rejects;
- the two executed-supported rows resolve exact Linux assets, mode/link, and
  native version probes; metadata-only rows reject before selection;
- a missing/changed checksum, traversal/symlink archive entry, extra
  executable, wrong version, broken bin link, or non-atomic partial install
  rejects and removes the partial output;
- a missing service/relay image digest fails before create; every Podman run
  tuple includes `--pull=never`;
- network/container collision with a foreign label aborts without deletion;
- canonical loopback DB/API health, second-run idempotency, timeout, partial
  start, SIGTERM, and reverse-order labelled teardown;
- real integration emits zero pull events, gives the runner no runtime socket
  or external route, and rejects provider/public IP/DNS attempts;
- errors contain only rule, asset/image name, platform, and version.

Run the focused tests in the already proved runner:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs tests/safety/local-stack-real-integration.test.mjs
```

Expected: FAIL because the bootstrap and installer do not exist.

- [ ] **Step 2: Prefetch exact current-lock artifacts and capture fresh baselines**

`prefetch-artifacts.mjs` reads only the current lockfile and tracked artifact
manifests. It sends artifact IDs—not caller URLs—to the gateway. The gateway
fetches exact lockfile `resolved` URLs/checksum and Supabase release assets,
verifies SRI/SHA-256, writes a fresh content-addressed cache, seals it read-only,
and emits a manifest containing source ID, bytes, integrity, redirect chain,
and cache SHA-256. Missing lock integrity or an undeclared URL is red.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/check-toolchain.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/safety/prefetch-artifacts.mjs --lockfile package-lock.json \
  --artifact-manifest scripts/ci/supabase-cli-2.109.1-platforms.json
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs production --label baseline
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs full --label baseline
```

The audit client mounts no repository source and can route only to the gateway;
the real npm exit and immutable evidence contract from Task 0 remains intact.
No provider, Supabase service, or arbitrary registry path is reachable.

- [ ] **Step 3: Prove clean-cache offline install and pin toolchain metadata**

On the canonical Linux/amd64 runner only, add the exact engine/package-manager
metadata and update the root lockfile metadata with npm `10.8.2`; dependency
versions do not change in this task. Then create a second fresh cache by
replaying the sealed prefetch manifest, run `npm ci --offline --ignore-scripts
--include=dev`, and compare lock SHA-256, package tree, executable bins, and
module file hashes with the first clean fixture. Any attempted socket is
kernel-denied and fails the task.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/ci/check-toolchain.mjs --require-lock-platform
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npm ci --offline --ignore-scripts --include=dev
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/ci/install-supabase-cli-artifact.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  ./.artifacts/bin/supabase --version
```

Expected exact version: `2.109.1`.

- [ ] **Step 4: Bootstrap the exact internal local stack without a runtime socket**

The trusted host orchestrator—not application code or Supabase CLI—verifies
every service/relay image by digest and uses exact Podman `--pull=never`
create/start tuples from `supabase-stack-2.109.1.json`. It creates only
`trophe-sec-<runId>-internal` with `internal=true`; DB is service `db` port
`5432`, Kong/API is service `kong` port `8000`. The relay container joins that
network and the runner uses `--network=container:<relay-id>`, sharing its
network namespace. Relay commands bind only:

```text
TCP-LISTEN:54322,bind=127.0.0.1,reuseaddr,fork -> TCP:db:5432
TCP-LISTEN:54321,bind=127.0.0.1,reuseaddr,fork -> TCP:kong:8000
```

No host port is published. Service records contain exact digest, command,
read-only config mounts, non-secret local env names, dependency order, and
health probe. The executable minimal service set is fixed:

| Service ID | Internal port | Health contract |
|---|---:|---|
| `db` | `5432` | `pg_isready -U postgres -d postgres` |
| `auth` | `9999` | `GET /health` returns `200` |
| `rest` | `3000` | `GET /` returns `200` |
| `realtime` | `4000` | `GET /api/tenants/realtime-dev/health` returns `200` |
| `storage` | `5000` | `GET /status` returns `200` |
| `meta` | `8080` | `GET /health` returns `200` |
| `kong` | `8000` | `GET /health` returns `200` after all dependencies |

Studio, Inbucket, analytics, vector, and imgproxy are excluded; an application
test that requires one must expand the reviewed stack JSON in a new plan rather
than auto-start it. DB must accept
`postgresql://postgres:postgres@127.0.0.1:54322/postgres`; API must return the
fixed local health status at `http://127.0.0.1:54321/health`. Readiness has a
120-second deadline with two-second polling. `scripts/db/bootstrap-local.sh`
delegates only to this orchestrator; no `npx`, CLI `start`, daemon socket, or
linked project is available inside the runner.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  node scripts/ci/bootstrap-clean-checkout.mjs --ensure-local-stack
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  node --test tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs tests/safety/local-stack-real-integration.test.mjs
```

The real integration starts from preloaded pinned images, sets registry policy
to reject pulls, observes Podman events, and requires zero pull/build events.
It proves internal-binding/native descendant attempts cannot reach external
hosts, then executes labelled teardown and verifies no run objects remain. A
missing image/runtime/self-hosted attestation is a hard stop, never a pull,
remote DB, host-side fallback, or skipped job.

- [ ] **Step 5: Stage the exact dependency/bootstrap patch and commit**

```bash
bash scripts/safety/apply-task-owned.sh security-task-0a
git commit -m "fix(security): reproduce dependencies and local stack safely"
```

### Task 0B: Land the read-only workload graph before any discovered-path consumer

**Files:**
- Create: `lib/security/ai-workload-graph.ts`
- Create: `scripts/ci/export-ai-workload-paths.mjs`
- Create: `tests/enterprise/ai-workload-graph.test.ts`

**Interfaces:**
- Produces: `discoverAiWorkloads(root): AiWorkload[]`
- Produces deterministic ignored inventories:
  `.artifacts/security/ownership/security-task-1-shared.json` and
  `.artifacts/security/ownership/security-task-2-provider-shared.json`
- Inventory schema: version, current HEAD, sorted path, starting blob ID,
  root/import chain, role (`route|caller|adapter|adapter-test`), and whole-file
  SHA-256.

- [ ] **Step 1: Begin with the complete Task 0B declaration**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-0b -- \
  node scripts/safety/stage-task-owned.mjs begin --task security-task-0b \
  --declarations scripts/safety/task-ownership.json
```

The declaration names all three files as new; `begin` requires each absent and
the complete worktree clean including untracked files.

- [ ] **Step 2: Write and fail the cycle-safe semantic graph test**

Start from every AI route and `executeAiTask` caller; parse TypeScript/JavaScript
imports, re-exports, literal dynamic imports, CommonJS require, extension/index
resolution, and cycles. Computed local edges are findings. The test includes
the nine billable roots listed in Task 1 and separate adapter/test fixtures for
OpenAI, Anthropic, Google, DeepSeek, and Voyage.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts --reporter=verbose
```

Expected: FAIL because the graph/exporter do not exist.

- [ ] **Step 3: Implement, verify, and emit both ownership inventories**

The exporter accepts only fixed output IDs; callers cannot supply arbitrary
paths. The launcher mounts only
`.artifacts/security/ownership/` read-write. It fails unresolved edges,
unclassified billable roots/adapters, duplicate paths, a path outside the
worktree, or a path whose blob cannot be recorded.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  node scripts/ci/export-ai-workload-paths.mjs --all-security-inventories
```

- [ ] **Step 4: Build, verify, apply, and commit the exact patch**

```bash
bash scripts/safety/apply-task-owned.sh security-task-0b
git commit -m "feat(security): add deterministic AI workload inventory"
```

### Task 1: Build the transitive AI workload graph and verified principal boundary

**Files:**
- Modify: `tests/enterprise/ai-workload-graph.test.ts`
- Create: `agents/runtime/principal.ts`
- Create: `tests/agents/principal.test.ts`
- Modify: `lib/security/api-guard.ts`
- Modify: `agents/runtime/types.ts`
- Modify: every graph-discovered AI HTTP/internal root and `executeAiTask` caller
- Modify: `tests/lib/api-guard.test.ts`

**Interfaces:**
- Consumes: Task 0B `discoverAiWorkloads(root): AiWorkload[]`
- Produces: `resolveAiPrincipal(input): Promise<AiPrincipal>`
- Produces:

```ts
type AiPrincipal =
  | {
      kind: 'end-user';
      userId: string;
      organizationId?: string;
      budgetOwner:
        | { kind: 'organization'; organizationId: string }
        | { kind: 'user'; userId: string };
    }
  | { kind: 'system'; workloadId: SystemWorkloadId; organizationId?: string };
```

- [ ] **Step 1: Regenerate reviewed ownership and begin with the full declaration**

Task 0B's committed exporter runs before any Task 1 edit and rewrites only the
fixed ignored ownership directory:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  node scripts/ci/export-ai-workload-paths.mjs --all-security-inventories
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-1 -- \
  node scripts/safety/stage-task-owned.mjs begin --task security-task-1 \
  --declarations scripts/safety/task-ownership.json
```

The declaration contains the static shared/new files above and references
`.artifacts/security/ownership/security-task-1-shared.json`. `begin` validates
its HEAD/path/blob/hash fields and requires every declared new path absent.

The existing graph marks a root billable when a reachable module hits
`executeAiTask`, a paid adapter, or a direct paid-provider hostname/SDK. The
regression floor remains:

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
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts --reporter=verbose
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
- zero memberships resolves only to
  `budgetOwner: { kind: 'user', userId: verifiedUserId }`; it carries no
  caller-supplied amount, and Task 3 denies if the authoritative DB row is
  missing;
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
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts tests/agents/principal.test.ts tests/lib/api-guard.test.ts tests/api --reporter=verbose
bash scripts/safety/apply-task-owned.sh security-task-1
git commit -m "fix(security): bind AI workloads to verified principals"
```

### Task 2: Model the full provider-specific billable envelope

**Files:**
- Create: `agents/runtime/billable-envelope.ts`
- Create: `agents/router/pricing-snapshots/2026-07-26.v1.json`
- Create: `agents/router/pricing-snapshot.ts`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/openai-api-pricing.fragment.bin`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/anthropic-api-pricing.fragment.bin`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/google-gemini-pricing.fragment.bin`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/deepseek-api-pricing.fragment.bin`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/voyage-api-pricing.fragment.bin`
- Create: `agents/router/pricing-evidence/2026-07-26/raw/response-metadata.json`
- Create: `agents/router/pricing-evidence/2026-07-26/normalized/provider-prices.json`
- Create: `agents/router/pricing-evidence/2026-07-26/normalized/billing-conversions.json`
- Create: `agents/router/pricing-evidence/2026-07-26/extraction-manifest.v1.json`
- Create: `agents/router/pricing-evidence/2026-07-26/artifact-hashes.json`
- Create: `scripts/ci/capture-pricing-evidence.mjs`
- Create: `scripts/ci/build-pricing-snapshot.mjs`
- Create: `tests/agents/billable-envelope.test.ts`
- Create: `tests/agents/pricing-snapshot.test.ts`
- Create: `tests/enterprise/pricing-evidence.test.ts`
- Modify: `agents/runtime/types.ts`
- Modify: `agents/router/pricing.ts`
- Modify: paid adapters/dispatchers discovered by Task 1
- Modify: provider adapter tests

**Interfaces:**
- Produces: `BillableEnvelope`
- Produces: `estimateWorstCaseMicrousd(envelope): bigint`
- Produces: `loadPricingSnapshot(version, now): PricingSnapshot`
- Invariant: unknown model, modality, pricing class, retry count, or token/media conversion denies before provider transport.
- Invariant: every envelope and persisted attempt binds immutable
  `pricingSnapshotVersion`; unknown, unmapped-alias, or expired pricing denies
  before reservation or provider transport.

- [ ] **Step 1: Regenerate Task 2 ownership, begin, and write failing tests**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  node scripts/ci/export-ai-workload-paths.mjs --all-security-inventories
node scripts/safety/run-local-zero-spend.mjs isolated-staging --task security-task-2 -- \
  node scripts/safety/stage-task-owned.mjs begin --task security-task-2 \
  --declarations scripts/safety/task-ownership.json
```

The Task 2 declaration includes every static file above plus
`.artifacts/security/ownership/security-task-2-provider-shared.json`, which
contains all existing paid adapters, dispatchers, and their tests. `begin` and
every later staging phase use the same declaration; no post-verify discovery is
permitted.

Define provider fixture cases for:

- plain text input plus adapter overhead;
- JSON/tool schema and descriptions;
- cache-write/read classes, reserving without assuming a discount;
- bounded output and reasoning tokens;
- base64 image bytes, MIME type, dimensions/media token formula;
- embedding batch item count and input token ceiling;
- internal retry count and a separately priced fallback attempt;
- exact model alias and reasoning/cache/modality price-class selection;
- snapshot not-yet-effective, expired, unknown-version, missing official
  source, model price increase, and alias drift;
- sub-cent cost, exact policy threshold, and one micro-dollar over threshold;
- provider-reported actual cost greater than reserved cost;
- raw source tamper, normalized table tamper, snapshot tamper, invalid byte
  locator, duplicate locator, conversion without evidence, price row without
  coverage, and nondeterministic regeneration;
- unknown model/modality/pricing and missing cap.

Assert reservation rounds upward to integer micro-dollars and never rounds down.

- [ ] **Step 2: Prove prompt-only estimation fails**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts tests/enterprise/pricing-evidence.test.ts --reporter=verbose
```

Expected: FAIL because current pricing sees usage after execution and cannot
price tool schema, media, reasoning, embedding, or retries before transport.

- [ ] **Step 3: Implement the envelope contract**

```ts
type BillableEnvelope = {
  provider: PaidProvider;
  model: string;
  pricingSnapshotVersion: string;
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

`2026-07-26.v1.json` has exact top-level fields `schemaVersion`, `version`,
`effectiveAt`, `reviewedAt`, `expiresAt`, `sources`, `aliases`, and `prices`.
For this version, `effectiveAt` and `reviewedAt` are
`2026-07-26T00:00:00Z`, `expiresAt` is
`2026-08-09T00:00:00Z`, and the official source set is exactly:

- OpenAI: `https://openai.com/api/pricing/`;
- Anthropic: `https://platform.claude.com/docs/en/about-claude/pricing`;
- Google Gemini: `https://ai.google.dev/gemini-api/docs/pricing`;
- DeepSeek: `https://api-docs.deepseek.com/quick_start/pricing`;
- Voyage: `https://docs.voyageai.com/docs/pricing`.

Evidence capture is a new-version-only `isolated-prefetch` action. The gateway
accepts five fixed pricing source IDs and stores no cookie/auth. For each
response, it caps the retained raw fragment at 256 KiB and total evidence at
2 MiB, stores the exact relevant table/conversion bytes plus 1 KiB surrounding
context, and records URL, redirect chain, UTC retrieval time, content type,
HTTP validators, full-response SHA-256, original byte start/end, and fragment
SHA-256 in `response-metadata.json`. Existing version directories are
immutable and capture refuses overwrite.

Every price row keys exact provider, canonical model, modality,
input/output/cache-read/cache-write/reasoning class, unit, currency, and
integer numerator/denominator for conservative rational arithmetic. Aliases
are explicit versioned mappings, never prefix or substring guesses.

`extraction-manifest.v1.json` maps every JSON pointer in `prices`, `aliases`,
and every token/media/cache/reasoning conversion to one raw artifact ID and an
exact locator: original byte range, fragment-relative range, selected-byte
SHA-256, normalized row label, column label, unit, and extractor rule ID.
`build-pricing-snapshot.mjs` reads only committed raw evidence and that
manifest, emits the two normalized JSON files with canonical key order and LF
newlines, then generates the snapshot. `artifact-hashes.json` records SHA-256
for every raw fragment, metadata file, extraction manifest, both normalized
files, and the final snapshot. `--check` regenerates all outputs in memory and
requires byte identity.

Generation/review rejects uncovered or multiply covered rows/conversions,
out-of-range locators, source-hash mismatch, non-USD units, floating point,
missing reasoning/cache/media classes, expiry beyond 14 days, or generated
bytes that differ. A price change creates a new immutable evidence/snapshot
version; it never edits one referenced by a ledger row. Tests are offline after
the one bounded source capture and make no billable provider/API call.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch \
  --write-mount agents/router/pricing-evidence/2026-07-26/raw -- \
  node scripts/ci/capture-pricing-evidence.mjs --version 2026-07-26.v1
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount agents/router/pricing-evidence/2026-07-26 \
  --write-mount agents/router/pricing-snapshots -- \
  node scripts/ci/build-pricing-snapshot.mjs --version 2026-07-26.v1
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/ci/build-pricing-snapshot.mjs --version 2026-07-26.v1 --check
```

- [ ] **Step 4: Deny over-cap rather than clamping**

Resolve the exact unexpired snapshot and alias first. Calculate the complete
worst case with integer rational arithmetic, round every billable class
conservatively and the final reservation upward to micro-dollars, and compare
to `policyMaxMicrousd`. If it exceeds the policy ceiling, throw
`AiRequestCostCeilingExceededError`; never replace the estimate with the cap and
continue. Primary/fallback reserve independently; internal retries are included
in the current attempt envelope. Settlement records provider-reported actual
cost even when it exceeds the reservation, increments `overrun_microusd`,
emits a sanitized durable overrun alert, and blocks further spend for that
budget owner until explicit server-side review clears the block. It never
clamps actual to reserved or silently releases the difference.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts tests/enterprise/pricing-evidence.test.ts tests/agents/provider-access.test.ts tests/agents/openai-structured.test.ts tests/agents/anthropic-provider.test.ts tests/agents/deepseek-provider.test.ts --reporter=verbose
bash scripts/safety/apply-task-owned.sh security-task-2
git commit -m "feat(ai): price complete billable envelopes"
```

### Task 3: Establish the authoritative local ledger, privileges, and schema-first rollout

**Files:**
- Create: `db/schema/ai_budget_reservations.ts`
- Create: `db/schema/ai_pricing_snapshots.ts`
- Create: `db/schema/system_ai_budgets.ts`
- Create: `db/schema/user_ai_budgets.ts`
- Modify: `db/schema/organization_ai_budgets.ts`
- Modify: `db/schema/agent_runs.ts`
- Modify: `db/schema/index.ts`
- Create: the next unused migration with suffix `ai_budget_authoritative_ledger`
- Create: `tests/db/ai-budget-ledger.test.ts`
- Create: `tests/db/ai-budget-privileges.test.ts`
- Create: `tests/db/ai-budget-recovery.test.ts`
- Create: `scripts/ops/recover-ai-budget-attempts.ts`
- Create: `app/api/internal/ai-budget-recovery/route.ts`
- Create: `tests/api/internal-ai-budget-recovery.test.ts`
- Create: `docs/runbooks/ai-budget-schema-first-rollout.md`

**Interfaces:**
- Produces RPCs: `public.reserve_ai_budget_attempt`, `public.start_ai_budget_attempt`, `public.settle_ai_budget_attempt`, `public.release_ai_budget_attempt`, `public.retain_ai_budget_attempt`
- Produces recovery RPC: `public.recover_ai_budget_attempts(uuid)`
- Produces caller: `npm run ops:recover-ai-budget -- --run-id <uuid>`
- Ledger states: `reserved -> started -> settled | released | retained`
- Authoritative amount: reserved/started/retained use `reserved_microusd`; settled uses `settled_microusd`; released uses zero.
- Solo policy: zero-membership users lock their own
  `public.user_ai_budgets` row; callers never provide a daily/monthly limit.
- Pricing policy: reserve validates the committed version against the private
  DB registry row (`version`, effective/expiry timestamps, source-file SHA-256).

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
- solo-user 20-way concurrency and exact threshold, missing solo row, cross-user
  attempt, UTC day/month rollover, kill switch, victim organization, and
  ambiguous principal;
- expired pricing snapshot, price alias/version mismatch, actual cost greater
  than reserved, overrun accounting, durable block, and blocked-owner denial;
- recovery before/at/after fixed stale cutoffs, live start-vs-recovery races,
  start after release, repeat run ID/caller retry, overlapping workers,
  crashed lease recovery, retained started rows, and unknown/future states
  never released;
- anon/authenticated/PUBLIC unable to inspect ledger or execute RPCs;
- service role able to access the ledger only through the named RPCs; the
  recovery function is not executable by any application client role.

- [ ] **Step 2: Prove the local schema is absent through the launcher**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts
```

Expected: FAIL because the ledger/RPCs do not exist. The launcher pins both DB
variables and rejects any ambient remote `DIRECT_URL` before npm starts.

- [ ] **Step 3: Define fixed-precision authoritative accounting**

Store all limits and ledger amounts as nonnegative `bigint` micro-dollars.
Reservations round upward; trusted settlement converts conservatively and
rejects negative/overflow values. Persist `pricing_snapshot_version`,
`reserved_microusd`, `settled_microusd`, and nonnegative
`overrun_microusd = greatest(settled_microusd - reserved_microusd, 0)`. Add
uniqueness to `agent_runs.generation_id`. The ledger, not an eventually
updated `agent_runs` sum, is authoritative:

```text
reserved  => reserved_microusd
started   => reserved_microusd
retained  => reserved_microusd
settled   => settled_microusd
released  => 0
```

No transition removes an amount before its replacement is committed.

Create `public.user_ai_budgets` keyed uniquely by `user_id` with nonnegative
`daily_limit_microusd`, `monthly_limit_microusd`, `spend_blocked`,
`blocked_reason_code`, `blocked_at`, and timestamps. The initial reviewed solo
policy is exactly `250000` micro-USD/day and `3000000` micro-USD/month.
Provision a row in the same transaction as every profile/user creation and
idempotently backfill existing profiles; missing rows always deny. Only
server-owned provisioning/admin functions can change limits or clear a block.
Reservation selects the authoritative organization, user, or system budget
row from the verified principal with `SELECT ... FOR UPDATE`, and computes UTC
usage from the ledger. `user_ai_budgets.user_id` is the primary key. Add
partial covering ledger indexes `(user_id, created_at, state)`,
`(organization_id, created_at, state)`, and
`(workload_id, created_at, state)` for non-released authoritative states; DB
tests inspect the query plan and prove the corresponding row lock serializes
20 concurrent reservations. No request/RPC argument, header, route, or client
metadata can provide or override a limit.

When trusted actual cost exceeds reserved cost, settlement stores/counts the
entire actual value, records the overrun, sets the selected budget row's block
and fixed reason `actual_exceeded_reservation`, and emits one idempotent
sanitized outbox alert keyed by attempt ID. Further reservations for that
budget owner deny until a separately authorized server-side review clears it.

- [ ] **Step 4: Implement explicit SECURITY DEFINER boundaries**

Create a dedicated `NOLOGIN` owner `trophe_ai_budget_owner`. Each RPC is
`SECURITY DEFINER SET search_path = pg_catalog`, schema-qualifies every
`public`/`private` object, validates the principal/membership/workload inside
the transaction, locks the exact budget row, and uses one idempotency key per
generation/attempt.

Use these exact signatures (all return the affected
`public.ai_budget_reservations` row):

```sql
public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text, text)
public.start_ai_budget_attempt(uuid, text)
public.settle_ai_budget_attempt(uuid, bigint, text)
public.release_ai_budget_attempt(uuid, text)
public.retain_ai_budget_attempt(uuid, text)
```

The reserve arguments are attempt ID, generation ID, principal kind, nullable
user ID, nullable organization ID, nullable workload ID, reserved micro-USD,
pricing snapshot version, and idempotency key. The function verifies the
snapshot version is effective/unexpired through the server-owned loaded
snapshot registry before reserving. Each transition receives attempt ID plus
idempotency key; settlement also receives settled micro-USD. Database
constraints require the one valid identity shape for `end-user` or `system`.
Server time is obtained inside PostgreSQL, never from a caller-supplied
timestamp.

For each signature, apply exact ownership and grants, for example:

```sql
ALTER FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text, text) OWNER TO trophe_ai_budget_owner;
REVOKE ALL ON FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_budget_attempt(uuid, uuid, text, uuid, uuid, text, bigint, text, text) TO service_role;
```

Apply equivalent statements to start/settle/release/retain. Tables are RLS
enabled with no anon/authenticated policy. The application calls these RPCs
through the verified service-role server client; no direct client role receives
table access.

- [ ] **Step 5: Add provisioning, backfill, and executable recovery**

The migration idempotently inserts missing organization and solo-user budget
rows before enabling fail-closed runtime use. Organization/profile creation
provisions its row atomically via a schema-qualified trigger/function or the
same creation transaction; test new identities and conflict-safe retry. System
workload budgets are explicit rows keyed by allowlisted workload ID.

Create `public.recover_ai_budget_attempts(p_run_id uuid)` as
`SECURITY DEFINER SET search_path = pg_catalog`, owned by
`trophe_ai_budget_owner`, revoked from `PUBLIC`, `anon`, and `authenticated`,
and executable only by `service_role`. The caller cannot supply cutoffs,
limits, state, principal, or amount. Fixed reviewed policy in the function is:

- batch size `100`, schedule cadence `5 minutes`, run lease `5 minutes`;
- `reserved` becomes `released` only when `started_at IS NULL` and
  `last_transition_at <= statement_timestamp() - interval '15 minutes'`;
- `started` becomes `retained` only when
  `last_transition_at <= statement_timestamp() - interval '30 minutes'`;
- `retained`, `settled`, `released`, and any unknown/future state are never
  released.

Persist unique run IDs and lease expiry in
`private.ai_budget_recovery_runs`. Claim candidates deterministically by
`last_transition_at, attempt_id` using `FOR UPDATE SKIP LOCKED`; transitions,
outbox events, counts, and run completion commit atomically. A retried run ID
returns its prior result. An expired incomplete lease is reclaimable without
duplicating a transition. `start_ai_budget_attempt` locks the same row; if
recovery commits release first, start denies, and if start commits first,
recovery retains only after the 30-minute cutoff. No state check/update race
uses an unlocked read.

`scripts/ops/recover-ai-budget-attempts.ts` requires an explicit UUID run ID,
reasserts local target/scrubbed guard state, invokes only the recovery RPC, and
prints fixed counts. `app/api/internal/ai-budget-recovery/route.ts` is a `POST`
target for the documented five-minute scheduler, requires constant-time
`AI_BUDGET_RECOVERY_SECRET` verification and `X-Recovery-Run-Id`, and calls the
same module. It is distinct from
`app/api/cron/recover-reservations/route.ts`, which retains its invite/auth
reservation purpose. The runbook defines the schedule but this plan does not
configure or deploy it; runtime activation stays blocked until the RPC, caller,
grant checks, and schedule ownership are verified in the target environment.

The same migration inserts the immutable metadata for
`2026-07-26.v1.json` into `private.ai_pricing_snapshots`; the migration's
source-file SHA-256 is generated from and verified against the staged JSON in
the isolated worktree. Only migration owner/service RPCs can read it. Reserve
requires an effective, unexpired row whose version and hash match the runtime
snapshot; mismatch or expiry denies before any provider transport.

- [ ] **Step 6: Generate, inspect, and apply only to local**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-db -- npm run db:generate
git diff -- db/schema drizzle
node scripts/safety/run-local-zero-spend.mjs isolated-db -- npm run db:migrate
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/ai-budget-recovery.test.ts tests/api/internal-ai-budget-recovery.test.ts tests/db/rls.test.ts
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  npm run ops:recover-ai-budget -- --run-id 00000000-0000-4000-8000-000000000001
```

If the proposed migration ordinal is already used, choose the actual next
unused ordinal; never overwrite or combine a parallel migration. The manual
caller runs only against the canonical local database and must return bounded
JSON counts. A missing RPC/grant, reused run with different metadata, or
nonlocal target stops the task; it never falls back to direct table access.

- [ ] **Step 7: Document release and rollback without executing either**

The runbook states:

1. apply additive schema/RPC migration;
2. verify backfill, new-org provisioning, grants, negative roles, and schema
   version;
3. only then deploy runtime that requires the ledger;
4. never activate a permissive fallback;
5. rollback runtime first while retaining additive ledger schema;
6. verify the five-minute recovery caller schedule has a named owner, unique run
   IDs, failure alert, and service-only grant before runtime activation;
7. remove schema only in a later separately approved change after proving no
   runtime uses it.

This plan performs none of those production actions.

- [ ] **Step 8: Commit**

```bash
bash scripts/safety/apply-task-owned.sh security-task-3
git commit -m "feat(security): add authoritative AI budget ledger"
```

The global Task 3 `begin` command runs before the first schema edit. Its
declaration includes the journal and a dynamic `next-drizzle-migration`
inventory that computes the exact next SQL/snapshot paths, records their
absence, and later requires generator output to match. Inspect each generated
path and verify its SQL/metadata contains only this task's ledger/RPC/grant
changes. Unexpected output, dirty schema, or mixed hunks abort.

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
8. primary, fallback, and retry accounting matches their envelopes;
9. unknown/expired pricing version starts zero transport calls;
10. actual usage greater than reserved settles the full actual value, records
    the overrun/block once, and makes the next reservation deny.

- [ ] **Step 2: Prove current runtime lacks the lifecycle**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts -t "budget|reservation|crash|fallback" --reporter=verbose
```

- [ ] **Step 3: Implement mandatory RPC lifecycle**

The RPC client uses the service-role server client only. Generate the attempt
ID, load the exact effective pricing snapshot, reserve with that immutable
version, create the generation record, persist `started`, then invoke the
transport. Settlement writes trusted actual/estimated cost—including an amount
greater than reserved—to the authoritative ledger and telemetry idempotently.
The RPC response communicates the fixed overrun block without exposing limits.
A missing function/table/schema/pricing marker throws
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
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts tests/agents/billable-envelope.test.ts tests/agents/principal.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts
bash scripts/safety/apply-task-owned.sh security-task-4
git commit -m "fix(ai): enforce crash-safe budget reservations"
```

Commit is implementation-ready but release-blocked by Task 3's separately
approved production schema-first runbook.

### Task 5: Scope workflow provider secrets to exact protected network steps

**Files:**
- Create: `scripts/ci/check-workflow-security.mjs`
- Create: `scripts/ci/check-isolated-runner-attestation.mjs`
- Create: `tests/enterprise/workflow-security.test.ts`
- Create: `.github/workflows/security-isolated.yml`
- Create: `docs/runbooks/isolation-runner-provisioning.md`
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
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/workflow-security.test.ts --reporter=verbose
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

The ordinary GitHub-hosted workflow is not an isolation proof. Pin its host to
`ubuntu-24.04` for static checks and add an explicit red
`isolated-security-gate` when repository variable
`TROPHE_ISOLATED_RUNNER_PROVISIONED` is not exactly `1`; it must not run npm,
tests, build, audit, or database work on that host.
`security-isolated.yml` runs those real commands only on labels
`self-hosted,linux,x64,trophe-rootless-podman-5.4.2`. Its first
dependency-free step compares rootless Podman version, UID maps, cgroup,
netavark/machine/config hashes, runner image digests, Node/npm, and no-pull
policy to `isolation-lock.json`; mismatch exits
`isolated_runner_attestation_failed` before repository execution. The runbook
specifies the exact preprovisioned Podman `5.4.2` binary checksum/config from
that lock, rootless service ownership, cache/image preload, labels, rotation,
and deprovisioning. No workflow installs a floating runtime with apt.

- [ ] **Step 4: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/ci/check-workflow-security.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/workflow-security.test.ts tests/agents/provider-access.test.ts --reporter=verbose
bash scripts/safety/apply-task-owned.sh security-task-5
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
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts --reporter=verbose
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

`assertServerRuntime` is a local `typeof window` assertion usable by
Next, Vitest, and `tsx`; do not add a bare `server-only` resolution dependency.
The transitive import graph is the compile-time enforcement.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/api --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run typecheck
git diff --name-only -- agents app/api lib
bash scripts/safety/apply-task-owned.sh security-task-6
git commit -m "fix(security): seal error and privileged import boundaries"
```

Before the global Task 6 `begin`, run:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  node scripts/ci/export-static-ownership.mjs --id security-task-6
```

That fixed ID includes every existing path under `agents/`, `app/api/`, `lib/`,
`tests/api/`, and the named test files. The declaration references
`.artifacts/security/ownership/security-task-6-shared.json`; semantic scanners
may narrow findings but cannot add a path outside this pre-begun superset.

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
`scripts/db/bootstrap-local.sh`. Set bootstrap to `localDb:true` only after the
inventory proves that it rejects target input/remote environment and the
launcher forces canonical loopback. Set migrate-production to `localDb:false`
and give it the `production-write` policy. Keep
`scripts/rag/ingest-document.ts` at `localDb:false` and add
`production-write`, because its target can be remote. `canary-readonly.sh` is
read-only and is never executed by this plan.

Target tests cover credential-bearing PostgreSQL DSNs, encoded userinfo,
Supabase poolers, IPv4/IPv6 loopback, malformed URLs, and redaction. Private
userinfo never enters manifest, `--target`, approval string, errors, or output.

- [ ] **Step 2: Prove unguarded Node and shell mutators fail inventory**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/production-write-approval.test.mjs
```

The second command tests the interlock itself inside the proven Task 0
boundary; it never executes its child. Fixtures must prove the semantic
inversion fails closed: bootstrap marked `localDb:false`, RAG ingestion marked
`localDb:true`, or any `localDb:true` executable that accepts a target/remote
environment is rejected. They also prove every remote-capable mutator with
`localDb:false`, including RAG ingestion, has `production-write` with an exact
owner/operation and cannot execute without its target-bound approval.

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
`classifications.localDb=true`, `isolated-db`, exact canonical loopback target,
and structural proof that no target argument or remote database/Supabase
environment can reach client construction.

Shell scripts call the Node decision CLI and check its exit status before any
`psql`, `curl`, `npx`, or mutation. Do not source a TypeScript helper from
shell. Add a static ordering test proving decision precedes the first mutation
token.

- [ ] **Step 5: Verify without invoking a real tool**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/safety/tool-policy.mjs validate
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/ci/check-production-mutators.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
```

Tests inject fake clients/transports and assert zero writes for absent,
malformed, mismatched-operation, and mismatched-target approvals. No production
tool is invoked.

- [ ] **Step 6: Commit**

```bash
bash scripts/safety/apply-task-owned.sh security-task-7
git commit -m "fix(security): compose production mutation interlocks"
```

Before the global Task 7 `begin`, run the fixed superset exporter:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline \
  --write-mount .artifacts/security/ownership -- \
  node scripts/ci/export-static-ownership.mjs --id security-task-7
```

The resulting declaration inventory includes every existing `scripts/**`
entrypoint plus the manifest and package file. Semantic discovery may narrow
the mutator set but cannot introduce an unbegun path.

### Task 8: Validate the reproduced dependency tree, fresh audit evidence, and compatibility

Task 0A proves the current lock installs cleanly and owns the exact CLI/local
stack. This task performs the reviewed dependency upgrade on the canonical
Linux/amd64 resolver only, then re-proves an offline clean install.

**Files:**
- Create: `scripts/ci/dependency-upgrade-request.json`
- Create: `scripts/ci/resolve-dependency-upgrade.mjs`
- Create: `tests/enterprise/dependency-security.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Requires exact direct pins: `next@16.2.12`,
  `eslint-config-next@16.2.12`, `supabase@2.109.1`
- Requires fresh production/full audit artifacts whose run metadata matches
  current HEAD and lockfile
- Requires zero production/full-tree high or critical advisories
- Prohibits lifecycle scripts except the reviewed offline Sharp tuple, audit
  suppression, stale artifact reuse, `npm audit fix`, and
  `npm audit fix --force`

- [ ] **Step 1: Begin exact ownership and write dependency/evidence regressions**

Run the global Task 8 `begin` before creating the two scripts/test or changing
package files. Its declaration has no conditional compatibility path. If a
compatibility gate later requires another source/config change, stop and amend
the reviewed ownership plan; Task 8 cannot silently expand scope.

Parse package/lock data and assert exact reviewed direct pins, one resolved
Next version, matching Next ESLint config, expected Sharp/PostCSS closure,
Supabase `2.109.1`, and no unexpected `tar` vulnerable range. Load fresh
runner-produced fixture artifacts and assert command/mode/label, unique run ID,
timestamps, actual child exit, JSON schema, count agreement, current
lockfile/HEAD hashes, and five-minute freshness. Reject copied baseline as
after/final, truncated output, registry error JSON, fabricated exit `0`,
advisory exit `1` without valid rows, exit greater than `1`, and stale output.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
```

Expected: FAIL until the tests consume the Task 0/0A runner and exact
reproduced tree.

- [ ] **Step 2: Verify artifact and lockfile provenance without reinstalling**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm explain next
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm explain tar
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  ./.artifacts/bin/supabase --version
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/supabase-cli-artifact.test.mjs tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/npm-audit-runner.test.mjs
```

Expected Supabase version is exactly `2.109.1`; installer checksum, platform
matrix, binary mode/link, and local image inventory must still match. If the
tree is missing or drifted, return to Task 0A; do not use `npx`, a package
postinstall, or an ambient global binary.

If a compatibility gate specifically proves Sharp needs its install lifecycle,
allow only:

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npm rebuild sharp --ignore-scripts=false
```

The tuple uses the locked local package in the network-none runner. Any other
lifecycle tuple is rejected. If it changes a tracked compatibility file,
stop for a new reviewed ownership declaration rather than staging it.

- [ ] **Step 3: Resolve exact upgrades through the gateway, then install offline**

`dependency-upgrade-request.json` contains only
`next@16.2.12`, `eslint-config-next@16.2.12`, and
`supabase@2.109.1`. On canonical Linux/amd64,
`resolve-dependency-upgrade.mjs` creates a resolver container containing only
the two package files, empty HOME/cache, and npm `10.8.2`; no application
source is mounted. Its only peer is the gateway. The gateway recursively
permits registry metadata only for package names proven by the current lock or
dependency metadata reached from those three exact roots, records every
expansion, and denies scripts/auth/other hosts. Resolver output may modify only
the two package files. Then prefetch the new lock's exact tarballs and run a
fresh `npm ci --offline --ignore-scripts --include=dev` in network-none.

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch \
  --write-mount package.json --write-mount package-lock.json -- \
  node scripts/ci/resolve-dependency-upgrade.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/safety/prefetch-artifacts.mjs --lockfile package-lock.json
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npm ci --offline --ignore-scripts --include=dev
```

- [ ] **Step 4: Capture fresh final audit runs and validate gates**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs production --label final
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs full --label final
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-db -- npm run db:doctor
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run typecheck
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run lint
node scripts/safety/run-local-zero-spend.mjs isolated-db -- npm test
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run build
```

The last command must be recognized as the exact production build tuple and
receive `NODE_ENV=production`; tests remain `NODE_ENV=test`. Both final audit
runs must be newly created during this step, structurally valid, and zero
high/critical. A valid advisory exit `1` may describe lower severity findings
but does not satisfy the gate if any high/critical count is nonzero. Any audit
transport/timeout/parse/schema failure is release-blocking and cannot be
reported as clean.

- [ ] **Step 5: Stage the exact declared patch and commit**

```bash
bash scripts/safety/apply-task-owned.sh security-task-8
git commit -m "chore(security): upgrade and reproduce dependency evidence"
```

### Task 9: Run the final zero-spend isolated audit

**Files:**
- Create: `docs/quality/security-audit-2026-07-25.md`

**Interfaces:**
- Consumes: Tasks 0-8
- Consumes without reimplementation: AI offline-harness Task 6
  `guard:paid-ai-tools` and its `paid-ai` policy fields in
  `tool-policy-manifest.json`
- Produces: ranked final evidence and release blockers

- [ ] **Step 1: Verify every inventory through the safety launcher**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node scripts/safety/tool-policy.mjs validate
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run guard:paid-ai-tools
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run guard:production-mutators
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run guard:workflow-security
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/enterprise/dependency-security.test.ts --reporter=verbose
```

If the paid-tool guard or manifest ownership contract is absent/failing, stop.
Do not duplicate its implementation in this task.

- [ ] **Step 2: Verify principals, envelopes, ledger, and redaction locally**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  npx --no-install vitest run tests/agents/principal.test.ts tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts tests/enterprise/pricing-evidence.test.ts tests/agents/budget-reservation.test.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/lib/api-guard.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/ai-budget-recovery.test.ts tests/api/internal-ai-budget-recovery.test.ts tests/db/rls.test.ts tests/db/rag-rls.test.ts
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- \
  node --test tests/safety/process-tree-isolation.test.mjs tests/safety/internal-binding-hostile.test.mjs tests/safety/rootless-runner-integration.test.mjs tests/safety/egress-gateway.test.mjs tests/safety/hostile-env-npm.test.mjs tests/safety/command-environment.test.mjs tests/safety/stage-task-owned.test.mjs tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs tests/safety/npm-audit-runner.test.mjs
node scripts/safety/run-local-zero-spend.mjs isolated-db -- \
  node --test tests/safety/local-stack-topology.test.mjs tests/safety/local-stack-real-integration.test.mjs
```

- [ ] **Step 3: Verify audited dependencies and full project gates**

```bash
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs production --label final
node scripts/safety/run-local-zero-spend.mjs isolated-prefetch -- \
  node scripts/ci/run-npm-audit.mjs full --label final
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run typecheck
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run lint
node scripts/safety/run-local-zero-spend.mjs isolated-db -- npm test
node scripts/safety/run-local-zero-spend.mjs isolated-offline -- npm run build
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
- no inference/provider API, production endpoint, or authenticated external
  system was called; the only egress was the bounded unauthenticated pricing
  evidence and npm audit manifest IDs recorded by the gateway;
- migration/RPCs were applied only to local `127.0.0.1:54322/postgres`;
- production schema/runtime remain unchanged;
- runtime release is blocked until the schema-first runbook is separately
  approved and completed;
- the evidence names fresh production/full audit run IDs, timestamps, actual
  exits, and matching HEAD/lockfile hashes; it never reuses Task 0A/Task 8
  artifacts;
- production headers were source-reviewed, not live-verified.

- [ ] **Step 6: Verify and safely stage the report**

```bash
rg -n "Critical|Important|Minor|\\$0\\.00|54322|release.blocked|not live-verified|guard:paid-ai-tools" docs/quality/security-audit-2026-07-25.md
git diff --check -- docs/quality/security-audit-2026-07-25.md
bash scripts/safety/apply-task-owned.sh security-task-9
git commit -m "docs(security): record fail-closed security evidence"
```

Task 9 owns only the new evidence report. If another document is stale, stop
and create a separately reviewed documentation task with a new complete
ownership declaration before editing it.
