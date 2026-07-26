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
- Full-process-tree external denial uses the strongest self-tested OS/container boundary available. The portable fallback fails closed unless every descendant is a guard-preloaded Node process or an exact local-only native tuple allowed by the active command profile.
- Repository dotenv/npm configuration is unreadable to guarded descendants. A boundary assertion revalidates the scrubbed environment before every credential lookup, child spawn, worker creation, or transport call.
- Command environments are explicit: `NODE_ENV=test` for tests and local DB fixtures, `NODE_ENV=production` for the exact `npm run build` tuple, and `NODE_ENV=development` for lifecycle-disabled dependency/audit commands.
- All implementation tasks run in a clean isolated worktree. A staging helper records starting blob/worktree fingerprints, refuses dirty or concurrently changed shared paths, stages existing files through a reviewed binary patch, and compares the cached hunk inventory to that task patch. Package/lockfile and migration generation are forbidden outside this isolation.

**Task-owned staging protocol:** Before Step 1 of every Task 1-9, run
`stage-task-owned begin` with the same `--shared`, `--new`, and reviewed
`--shared-from` inventory later passed to `stage`. Discovery that determines
paths is read-only and must run first; if it finds another path after `begin`,
abort, reset only the disposable isolated worktree, review the expanded
inventory, and restart the task. `stage` uses `git diff --binary` plus
`git apply --cached`, never path-only `git add` for an existing file.
`verify` compares cached path/hunk IDs and patch SHA-256 to the task manifest
and requires the unstaged diff to equal only intentionally uncommitted new-task
work. A user/shared-worktree change, mixed hunk, or baseline mismatch aborts
without modifying the index.

---

## Planned File Map

- `scripts/safety/run-local-zero-spend.mjs`: scrubbed child-process launcher with `local-only`, `npm-registry-readonly`, and exact Supabase CLI release profiles.
- `scripts/safety/os-network-sandbox.mjs`: strongest-compatible macOS Seatbelt/Linux rootless-container/process-tree boundary selection and proof.
- `scripts/safety/guarded-runtime-preload.cjs`: child-injected transport, descendant, worker, and sensitive-file policy.
- `scripts/safety/sensitive-file-policy.mjs`: dotenv/npm masking and guard-state revalidation.
- `scripts/safety/docker-api-proxy.mjs`: local-stack-only Docker API allowlist that makes image pulls and unknown daemon actions impossible.
- `scripts/safety/stage-task-owned.mjs`: clean-isolated-worktree and exact cached-hunk ownership enforcement.
- `scripts/safety/target-policy.mjs`: credential-redacting DSN/URL parser and canonical target comparison.
- `scripts/safety/tool-policy-manifest.json`: one language-neutral inventory shared with AI offline-harness Task 6 and production-write hardening.
- `scripts/safety/tool-policy.mjs`: validate manifest ownership and return composed policy decisions to Node or shell callers.
- `scripts/ci/bootstrap-clean-checkout.mjs`: dependency, exact Supabase CLI, and local-stack bootstrap without `npx`.
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
- Create: `scripts/safety/os-network-sandbox.mjs`
- Create: `scripts/safety/guarded-runtime-preload.cjs`
- Create: `scripts/safety/sensitive-file-policy.mjs`
- Create: `scripts/safety/docker-api-proxy.mjs`
- Create: `scripts/safety/stage-task-owned.mjs`
- Create: `scripts/safety/run-local-zero-spend.mjs`
- Create: `scripts/ci/validate-npm-audit.mjs`
- Create: `scripts/ci/run-npm-audit.mjs`
- Create only if absent; otherwise validate and preserve AI Task 6-owned rows: `scripts/safety/tool-policy-manifest.json`
- Create: `scripts/safety/tool-policy.mjs`
- Create: `tests/safety/target-policy.test.mjs`
- Create: `tests/safety/run-local-zero-spend.test.mjs`
- Create: `tests/safety/tool-policy.test.mjs`
- Create: `tests/safety/network-denial-child.test.mjs`
- Create: `tests/safety/process-tree-isolation.test.mjs`
- Create: `tests/safety/hostile-env-npm.test.mjs`
- Create: `tests/safety/command-environment.test.mjs`
- Create: `tests/safety/stage-task-owned.test.mjs`
- Create: `tests/safety/docker-api-proxy.test.mjs`
- Create: `tests/safety/npm-audit-runner.test.mjs`
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
- Produces: `selectIsolationBackend(profile, argv): 'darwin-seatbelt' | 'linux-rootless-container' | 'portable-node-only'`
- Produces: `assertGuardState(boundary, env): void`
- Produces CLI: `node scripts/safety/stage-task-owned.mjs begin|stage|verify --task <id> [--shared <path...>] [--new <path...>] [--shared-from <reviewed-json>] [--new-from <reviewed-json>]`
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
paid-AI rows first. Security Task 0 validates and preserves those rows without
staging them; only when the manifest is absent may Task 0 seed exactly
`{"version":1,"tools":[]}`. Security Task 7 augments each same row with
`production-write` and the `serviceRole`/`localDb` classifications; it never
creates a duplicate row or another paid-AI guard. A dual-policy tool must
receive two successful decisions before execution.

- [ ] **Step 1: Write dependency-free launcher and target-policy tests**

Use Node's built-in test runner so no project tool runs before the launcher
exists. Assert:

First require `git status --porcelain=v1 --untracked-files=no` to be empty and
record the exact starting HEAD and `package.json` blob under the isolated
worktree's private Git metadata. Task 0 is the one bootstrap exception to the
not-yet-created staging helper; its final `stage --bootstrap-task-0` mode must
match those records and accepts only the declared `package.json` binary patch
plus declared new files.

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
  command that would consult the registry under `local-only` rejects before
  spawn;
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
`npm rebuild sharp --ignore-scripts=false`; only `local-only` admits that tuple
with external network still denied.

Inject `guarded-runtime-preload.cjs` through an immutable, launcher-generated
`NODE_OPTIONS` token. Patch `fetch`, `http`, `https`, `http2`, `net`, `tls`,
`dns`, `dgram`, global and module-loaded Undici dispatchers/clients, and
WebSocket. Validate every redirect hop and resolved address. `local-only`
permits only `localhost`, `127.0.0.0/8`, and `::1`.
`npm-registry-readonly` additionally permits exactly `registry.npmjs.org`. The
`supabase-cli-2.109.1-release` profile permits only the exact HTTPS checksum and
platform archive paths beneath
`github.com/supabase/cli/releases/download/v2.109.1/`, then only validated
release-asset redirects to `release-assets.githubusercontent.com`; it rejects
any other tag, asset, host, protocol, redirect, raw IP, or DNS rebinding.

- [ ] **Step 4: Enforce the process-tree boundary and task-owned staging**

`os-network-sandbox.mjs` probes and proves a backend before executing:

- on macOS, a generated `sandbox-exec` profile denies outbound sockets and
  process execution by default, allowing only the exact profile endpoints,
  repository/temp reads, output writes, and reviewed child tuples. If
  `sandbox-exec` is absent or its deny proof fails, it is unavailable rather
  than assumed;
- on Linux CI, rootless Docker/Podman must already have the pinned Node runner
  image by digest. No-network commands run with `--network=none`, read-only
  repository mounts plus declared output mounts, `--cap-drop=ALL`,
  `no-new-privileges`, PID/memory/time limits, and the runtime default seccomp
  profile. DB commands run in a launcher-created `--internal` bridge with only
  pinned Supabase service containers and launcher-owned loopback relays mapping
  the internal DB/API to `127.0.0.1:54322`/`:54321` inside the runner. The
  bridge has no external route. Registry/release commands may run only behind
  a tested egress proxy that is the container's sole route and applies the same
  exact endpoint/path/redirect policy; otherwise the launcher uses portable
  Node-only mode and refuses native children;
- when neither proved boundary is available, `portable-node-only` wraps all
  `child_process` exports (`spawn`,
  `spawnSync`, `exec`, `execSync`, `execFile`, `execFileSync`, and `fork`),
  `Worker`, and cluster/fork entrypoints. Node descendants must preserve the
  exact preload token and runs with Node's `--no-addons` so a native addon
  cannot bypass the guarded file/network APIs. It denies every native child;
  `npm` is admitted only as the exact current Node plus resolved npm CLI JS
  tuple. Verified Supabase,
  Docker, `psql`, Sharp, and any other native operation require a proved
  Seatbelt/container backend. There is no “trusted binary” bypass.

If an argv needs native network behavior that the selected backend cannot
enforce, fail `isolation_backend_unavailable`; never degrade silently. Tests
include a real backend self-test whose untrusted descendant tries TCP, UDP,
DNS, HTTP/2, WebSocket, and a native helper against an injected unreachable
external address; success is defined as denial by the OS/container before
transport. Portable tests inject spawn/transport implementations and prove the
same native helper is refused before spawn. The hostile suite also covers
cleared `NODE_OPTIONS`, worker/fork, imported Undici, redirect, raw-IP, and DNS
rebinding. CI skips nothing: unavailable/failed OS isolation is red for every
native-child tuple.

The launcher also exposes a temporary Unix-socket Docker API proxy for the
exact local-stack profile. It forwards only the reviewed version, image
inspect/list, network inspect/create, container inspect/create/start/stop, and
log endpoints needed by Supabase v2.109.1. It denies image create/pull/push,
build, exec, plugin, secret, swarm, volume deletion, privileged/container-host
mounts, non-inventory image digests, non-internal networks, and any unknown
method/path before the real daemon. `DOCKER_HOST` points only to this proxy.
Offline tests use a fake daemon and assert rejected calls are never forwarded.

`stage-task-owned.mjs begin` requires a clean isolated worktree, records
HEAD/path blobs and worktree fingerprints, and rejects pre-existing changes to
every shared path. `stage` creates a binary patch only for declared shared
files, checks it with `git apply --cached --check`, applies it to the index, and
stages declared new files explicitly. `verify` compares the cached hunk
inventory byte-for-byte with the reviewed task patch, rejects undeclared paths,
overlapping/unowned hunks, or any shared path changed since `begin`, and prints
path/hunk identifiers only. Dependency/lockfile or migration tasks additionally
fail unless the isolated-worktree marker is present.

`run-npm-audit.mjs` is dependency-free and is the only audit entrypoint. It
spawns exactly `npm audit --omit=dev --json` for `production` and
`npm audit --json` for `full`, with a 120-second timeout and 8 MiB stdout/stderr
caps. It captures the actual exit code and requires npm audit report version 2:
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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs tests/safety/hostile-env-npm.test.mjs tests/safety/command-environment.test.mjs tests/safety/stage-task-owned.test.mjs tests/safety/docker-api-proxy.test.mjs tests/safety/npm-audit-runner.test.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/network-denial-child.test.mjs tests/safety/process-tree-isolation.test.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/safety/tool-policy.mjs validate --phase paid-ai-base
```

Only loopback succeeds. Every external attempt is intercepted before socket or
native-child creation, and sanitized failures contain rule/name classes only.

- [ ] **Step 7: Commit the exact owned patch**

```bash
node scripts/safety/stage-task-owned.mjs stage --task security-task-0 \
  --bootstrap-task-0 \
  --shared package.json \
  --new scripts/safety/target-policy.mjs scripts/safety/os-network-sandbox.mjs scripts/safety/guarded-runtime-preload.cjs scripts/safety/sensitive-file-policy.mjs scripts/safety/docker-api-proxy.mjs scripts/safety/stage-task-owned.mjs scripts/safety/run-local-zero-spend.mjs scripts/safety/tool-policy.mjs scripts/ci/validate-npm-audit.mjs scripts/ci/run-npm-audit.mjs tests/safety/target-policy.test.mjs tests/safety/run-local-zero-spend.test.mjs tests/safety/tool-policy.test.mjs tests/safety/network-denial-child.test.mjs tests/safety/process-tree-isolation.test.mjs tests/safety/hostile-env-npm.test.mjs tests/safety/command-environment.test.mjs tests/safety/stage-task-owned.test.mjs tests/safety/docker-api-proxy.test.mjs tests/safety/npm-audit-runner.test.mjs
node scripts/safety/stage-task-owned.mjs verify --task security-task-0
git commit -m "feat(security): add zero-spend local execution boundary"
```

Stage `scripts/safety/tool-policy-manifest.json` in Task 0 only when this task
created the exact empty seed; in that case include it as a declared `--new` path
in the same helper manifest and rerun `verify`. If AI Task 6 already created
it, validate it, preserve its paid rows byte-for-byte, and omit it from Task
0's patch and index.

### Task 0A: Reproduce dependencies, install the exact Supabase CLI, and bring up the canonical local stack

This task is a hard prerequisite for Task 1. It resolves a clean checkout before
any project test, migration, or local database command is attempted.

**Files:**
- Create: `scripts/ci/bootstrap-clean-checkout.mjs`
- Create: `scripts/ci/install-supabase-cli-artifact.mjs`
- Create: `scripts/ci/supabase-cli-2.109.1-platforms.json`
- Create: `scripts/ci/supabase-cli-2.109.1-checksums.json`
- Create: `scripts/ci/supabase-local-images-2.109.1.json`
- Create: `tests/safety/clean-checkout-bootstrap.test.mjs`
- Create: `tests/safety/supabase-cli-artifact.test.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `scripts/db/bootstrap-local.sh`

**Pinned dependency contract:**

- exact direct versions: `next@16.2.12`, `eslint-config-next@16.2.12`,
  `supabase@2.109.1`;
- lifecycle-disabled install: `npm ci --ignore-scripts --include=dev` from the
  exact lockfile and an initially empty task cache;
- local execution only: `npx` is forbidden for bootstrap and every later
  `npx` tuple requires `--no-install`;
- exact checksum file:
  `supabase_2.109.1_checksums.txt`;
- exact supported npm-postinstall-compatible matrix:

| Node platform | Node arch | Release archive | Installed executable | Mode/link |
|---|---|---|---|---|
| `darwin` | `arm64` | `supabase_darwin_arm64.tar.gz` | `node_modules/supabase/bin/supabase` | `0755`; `.bin/supabase -> ../supabase/bin/supabase` |
| `darwin` | `x64` | `supabase_darwin_amd64.tar.gz` | `node_modules/supabase/bin/supabase` | `0755`; `.bin/supabase -> ../supabase/bin/supabase` |
| `linux` | `arm64` | `supabase_linux_arm64.tar.gz` | `node_modules/supabase/bin/supabase` | `0755`; `.bin/supabase -> ../supabase/bin/supabase` |
| `linux` | `x64` | `supabase_linux_amd64.tar.gz` | `node_modules/supabase/bin/supabase` | `0755`; `.bin/supabase -> ../supabase/bin/supabase` |
| `win32` | `arm64` | `supabase_windows_arm64.tar.gz` | `node_modules/supabase/bin/supabase.exe` | executable file; `.bin/supabase.cmd`/`.ps1` generated by `bin-links` semantics |
| `win32` | `x64` | `supabase_windows_amd64.tar.gz` | `node_modules/supabase/bin/supabase.exe` | executable file; `.bin/supabase.cmd`/`.ps1` generated by `bin-links` semantics |

Any other platform/arch fails before URL construction or download. The
platform JSON records all six rows, exact release/checksum names, executable
relative path, Unix mode, and link target. The checksum JSON contains all six
archive SHA-256 values transcribed from the exact official v2.109.1 checksum
asset; generation records the official release URL, tag, asset name, review
timestamp, and checksum-file SHA-256. Missing entries, duplicate assets, a
checksum-file mismatch, or a platform row absent from the official asset list
is a hard failure. This contract is intentionally locked to the reviewed
v2.109.1 npm installer; newer Supabase CLI platform-package layouts do not
change it.

- [ ] **Step 1: Record staging ownership and write offline bootstrap tests**

```bash
node scripts/safety/stage-task-owned.mjs begin --task security-task-0a \
  --shared package.json package-lock.json scripts/db/bootstrap-local.sh
```

Fixtures use local fake registries, release archives, checksums, process
adapters, image inventory, and status JSON. Assert:

- a clean checkout with no `node_modules`, empty npm cache, and local fixture
  cache completes without `npx` or lifecycle scripts;
- all six supported matrix rows resolve the exact asset and executable/link
  path, Unix modes are `0755`, and unsupported platform/arch rejects before
  transport;
- a missing/changed checksum, traversal/symlink archive entry, extra
  executable, wrong version, broken bin link, or non-atomic partial install
  rejects and removes the partial output;
- absent `127.0.0.1:54322` status invokes the exact verified binary; present
  canonical status is idempotent;
- missing pinned Docker image digest fails `local_supabase_image_missing`
  before `supabase start`, and no Docker pull is attempted;
- remote project refs/tokens, linked-project metadata, non-loopback status, or
  unexpected ports fail before stack start;
- errors contain only rule, asset/image name, platform, and version.

Run only dependency-free tests first:

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs
```

Expected: FAIL because the bootstrap and installer do not exist.

- [ ] **Step 2: Update and prove the exact lockfile from the isolated worktree**

Under `npm-registry-readonly`, use a fresh empty temporary npm cache and the
empty launcher-owned npm configs:

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs production --label baseline
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs full --label baseline
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  npm install --ignore-scripts --save-exact next@16.2.12 eslint-config-next@16.2.12
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  npm install --ignore-scripts --save-dev --save-exact supabase@2.109.1
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  npm ci --ignore-scripts --include=dev
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs production --label after
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs full --label after
```

The launcher rejects lockfile drift outside those direct/transitive changes,
undeclared registry hosts, auth headers, package tarballs whose integrity does
not match `package-lock.json`, postinstall output, and any attempt to reuse an
ambient cache/config. A second proof clones the tracked package files into a
temporary clean-checkout fixture, starts with no `node_modules` and a distinct
empty cache, and must produce the same package-tree/lock digest. Failure is red;
do not proceed using an older `node_modules`. Baseline and after audits are
fresh runner-owned captures; an advisory exit `1` may be recorded only when the
report is structurally valid. Invalid transport/parse/schema output stops this
task. High/critical findings after the reviewed upgrades remain
release-blocking and are not suppressed.

- [ ] **Step 3: Implement lifecycle-free artifact installation**

The installer downloads only the exact checksum and selected archive under the
release profile, bounds each response/archive/file size, requires HTTPS,
validates every redirect, parses exactly one matching checksum entry, verifies
SHA-256 before extraction, rejects absolute/traversal/symlink/hardlink/device
entries, extracts to a sibling temporary directory, verifies the binary alone
reports `2.109.1`, applies Unix mode `0755`, and atomically renames it into the
matrix path. It then creates and resolves the exact bin link contract without
running the package postinstall. Re-running is idempotent only after checksum,
mode/link, and version revalidation.

```bash
node scripts/safety/run-local-zero-spend.mjs supabase-cli-2.109.1-release -- \
  node scripts/ci/install-supabase-cli-artifact.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  ./node_modules/.bin/supabase --version
```

Expected exact version: `2.109.1`.

- [ ] **Step 4: Bootstrap the canonical local stack without hidden pulls**

`bootstrap-clean-checkout.mjs` first verifies every image reference and digest
in `supabase-local-images-2.109.1.json` through exact
`docker image inspect <repository>@sha256:<digest>` tuples. The inventory is
derived once from the reviewed v2.109.1 local-stack configuration and contains
no mutable tags. If any image is absent, stop with
`local_supabase_image_missing`; image acquisition is a separate explicitly
authorized prerequisite and this plan never auto-pulls.

With all images present, require a proved Seatbelt/rootless-container backend,
start the launcher-owned Docker API proxy, and set `DOCKER_HOST` to only its
mode-`0600` Unix socket. The proxy rejects pulls/builds/exec/privileged mounts
and constrains image/container/network operations to the pinned inventory and
internal/local-stack topology. Scrub `SUPABASE_ACCESS_TOKEN`, project refs,
link metadata, ambient proxy variables, and remote URLs; invoke only
`./node_modules/.bin/supabase status -o json`, then, when absent, the same
verified binary's `start`. Parse JSON and require API `127.0.0.1:54321` and DB
`127.0.0.1:54322`; reject any additional remote host. Run the canonical local
SQL readiness query through the launcher and make `scripts/db/bootstrap-local.sh`
delegate to this binary-based flow without `npx`.

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/ci/bootstrap-clean-checkout.mjs --ensure-local-stack
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs
```

If the OS/container boundary, Docker proxy proof, required pinned image, or
canonical ports are unavailable, record the fixed reason and stop Task 0A. Do
not use portable Node-only mode for the native CLI, substitute a remote
database, or relax the boundary.

- [ ] **Step 5: Stage the exact dependency/bootstrap patch and commit**

```bash
node scripts/safety/stage-task-owned.mjs stage --task security-task-0a \
  --shared package.json package-lock.json scripts/db/bootstrap-local.sh \
  --new scripts/ci/bootstrap-clean-checkout.mjs scripts/ci/install-supabase-cli-artifact.mjs scripts/ci/supabase-cli-2.109.1-platforms.json scripts/ci/supabase-cli-2.109.1-checksums.json scripts/ci/supabase-local-images-2.109.1.json tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs
node scripts/safety/stage-task-owned.mjs verify --task security-task-0a
git commit -m "fix(security): reproduce dependencies and local stack safely"
```

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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts tests/agents/principal.test.ts tests/lib/api-guard.test.ts tests/api --reporter=verbose
git diff --name-only -- app/api agents
node scripts/safety/stage-task-owned.mjs stage --task security-task-1 \
  --shared agents/runtime/types.ts lib/security/api-guard.ts tests/lib/api-guard.test.ts \
  --shared-from .artifacts/security/security-task-1-discovered-shared-paths.json \
  --new lib/security/ai-workload-graph.ts agents/runtime/principal.ts tests/enterprise/ai-workload-graph.test.ts tests/agents/principal.test.ts
node scripts/safety/stage-task-owned.mjs verify --task security-task-1
git commit -m "fix(security): bind AI workloads to verified principals"
```

Before Step 1, emit the sorted graph-discovered existing route/caller/test
paths to the named ignored JSON and pass the same file to
`stage-task-owned begin`. The helper rejects a dirty/missing path or any cached
path/hunk not present in that reviewed inventory.

### Task 2: Model the full provider-specific billable envelope

**Files:**
- Create: `agents/runtime/billable-envelope.ts`
- Create: `agents/router/pricing-snapshots/2026-07-26.v1.json`
- Create: `agents/router/pricing-snapshot.ts`
- Create: `tests/agents/billable-envelope.test.ts`
- Create: `tests/agents/pricing-snapshot.test.ts`
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

- [ ] **Step 1: Write failing envelope and pricing tests**

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
- unknown model/modality/pricing and missing cap.

Assert reservation rounds upward to integer micro-dollars and never rounds down.

- [ ] **Step 2: Prove prompt-only estimation fails**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts --reporter=verbose
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

Every source row also records retrieval timestamp and content SHA-256. Every
price row keys exact provider, canonical model, modality,
input/output/cache-read/cache-write/reasoning class, unit, currency, and
integer numerator/denominator for conservative rational arithmetic. Aliases
are explicit versioned mappings, never prefix or substring guesses.

Generation/review rejects duplicate coverage, non-USD units, floating point,
missing reasoning/cache/media classes, an expiry more than 14 days after
review, or a source that does not correspond to the effective table. A price
change creates a new immutable version; it never edits one referenced by a
ledger row. Tests use committed local fixtures and make no provider request.

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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts tests/agents/provider-access.test.ts tests/agents/openai-structured.test.ts tests/agents/anthropic-provider.test.ts tests/agents/deepseek-provider.test.ts --reporter=verbose
node scripts/safety/stage-task-owned.mjs stage --task security-task-2 \
  --shared agents/runtime/types.ts agents/router/pricing.ts \
  --new agents/runtime/billable-envelope.ts agents/router/pricing-snapshots/2026-07-26.v1.json agents/router/pricing-snapshot.ts tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts
node scripts/safety/stage-task-owned.mjs verify --task security-task-2
git diff --name-only -- agents/runtime/providers agents/clients tests/agents
git commit -m "feat(ai): price complete billable envelopes"
```

Stage only adapters/tests named by the focused diff.

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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
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
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:generate
git diff -- db/schema drizzle
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:migrate
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/ai-budget-recovery.test.ts tests/api/internal-ai-budget-recovery.test.ts tests/db/rls.test.ts
node scripts/safety/run-local-zero-spend.mjs local-only -- \
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
node scripts/safety/stage-task-owned.mjs stage --task security-task-3 \
  --shared db/schema/organization_ai_budgets.ts db/schema/agent_runs.ts db/schema/index.ts package.json drizzle/meta/_journal.json \
  --new db/schema/ai_budget_reservations.ts db/schema/ai_pricing_snapshots.ts db/schema/system_ai_budgets.ts db/schema/user_ai_budgets.ts scripts/ops/recover-ai-budget-attempts.ts app/api/internal/ai-budget-recovery/route.ts tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/ai-budget-recovery.test.ts tests/api/internal-ai-budget-recovery.test.ts docs/runbooks/ai-budget-schema-first-rollout.md \
  --new-from .artifacts/security/security-task-3-generated-new-paths.json
node scripts/safety/stage-task-owned.mjs verify --task security-task-3
git commit -m "feat(security): add authoritative AI budget ledger"
```

Run `stage-task-owned begin` before the first schema edit with every shared path
above, including the journal. After generation, export the exact sorted new SQL
and snapshot paths to the named ignored JSON. Inspect every generated path and
verify its SQL/metadata contains only this task's
ledger/RPC/grant changes. Any unexpected generated path, dirty starting schema,
or mixed hunk aborts; never use broad path staging.

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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
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
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/agents/budget-reservation.test.ts tests/agents/runtime-execute.test.ts tests/agents/billable-envelope.test.ts tests/agents/principal.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts
node scripts/safety/stage-task-owned.mjs stage --task security-task-4 \
  --shared agents/runtime/execute.ts agents/runtime/persistence.ts agents/runtime/error-classification.ts tests/agents/runtime-execute.test.ts \
  --new agents/runtime/budget-reservation.ts tests/agents/budget-reservation.test.ts
node scripts/safety/stage-task-owned.mjs verify --task security-task-4
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

- [ ] **Step 4: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node scripts/ci/check-workflow-security.mjs
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/enterprise/workflow-security.test.ts tests/agents/provider-access.test.ts --reporter=verbose
node scripts/safety/stage-task-owned.mjs stage --task security-task-5 \
  --shared .github/workflows/ci.yml .github/workflows/provider-smoke.yml package.json \
  --new scripts/ci/check-workflow-security.mjs tests/enterprise/workflow-security.test.ts
node scripts/safety/stage-task-owned.mjs verify --task security-task-5
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

`assertServerRuntime` is a local portable `typeof window` assertion usable by
Next, Vitest, and `tsx`; do not add a bare `server-only` resolution dependency.
The transitive import graph is the compile-time enforcement.

- [ ] **Step 5: Verify and commit**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/api --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run typecheck
git diff --name-only -- agents app/api lib
node scripts/safety/stage-task-owned.mjs stage --task security-task-6 \
  --shared-from .artifacts/security/security-task-6-discovered-shared-paths.json \
  --new agents/observability/safe-error.ts lib/security/error-flow.ts lib/http/internal-error.ts lib/security/server-runtime.ts lib/security/privileged-import-graph.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts
node scripts/safety/stage-task-owned.mjs verify --task security-task-6
git commit -m "fix(security): seal error and privileged import boundaries"
```

Before Step 1, export the sorted existing sink/module/test paths from the
read-only inventory to the named ignored JSON, review it, and use the identical
file for `begin` and `stage`.

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
  npx --no-install vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
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
  npx --no-install vitest run tests/enterprise/production-mutator-inventory.test.ts --reporter=verbose
```

Tests inject fake clients/transports and assert zero writes for absent,
malformed, mismatched-operation, and mismatched-target approvals. No production
tool is invoked.

- [ ] **Step 6: Commit**

```bash
git diff --name-only -- scripts
node scripts/safety/stage-task-owned.mjs stage --task security-task-7 \
  --shared scripts/safety/tool-policy-manifest.json package.json \
  --shared-from .artifacts/security/security-task-7-discovered-shared-paths.json \
  --new scripts/ci/check-production-mutators.mjs scripts/safety/require-production-write-approval.mjs tests/enterprise/production-mutator-inventory.test.ts tests/safety/production-write-approval.test.mjs
node scripts/safety/stage-task-owned.mjs verify --task security-task-7
git commit -m "fix(security): compose production mutation interlocks"
```

Before Step 1, export the sorted existing manifest-reported mutator paths to the
named ignored JSON, review it, and use that identical inventory for `begin` and
`stage`.

### Task 8: Validate the reproduced dependency tree, fresh audit evidence, and compatibility

Task 0A owns dependency, lockfile, exact CLI artifact, and local-stack
bootstrap. This task does not reinstall or silently rewrite them.

**Files:**
- Create: `tests/enterprise/dependency-security.test.ts`
- Modify only if a named compatibility check fails: the exact source/config
  path tied to that failure

**Interfaces:**
- Requires exact direct pins: `next@16.2.12`,
  `eslint-config-next@16.2.12`, `supabase@2.109.1`
- Requires fresh production/full audit artifacts whose run metadata matches
  current HEAD and lockfile
- Requires zero production/full-tree high or critical advisories
- Prohibits lifecycle scripts except the reviewed offline Sharp tuple, audit
  suppression, stale artifact reuse, `npm audit fix`, and
  `npm audit fix --force`

- [ ] **Step 1: Write the dependency and evidence regressions**

Parse package/lock data and assert exact reviewed direct pins, one resolved
Next version, matching Next ESLint config, expected Sharp/PostCSS closure,
Supabase `2.109.1`, and no unexpected `tar` vulnerable range. Load fresh
runner-produced fixture artifacts and assert command/mode/label, unique run ID,
timestamps, actual child exit, JSON schema, count agreement, current
lockfile/HEAD hashes, and five-minute freshness. Reject copied baseline as
after/final, truncated output, registry error JSON, fabricated exit `0`,
advisory exit `1` without valid rows, exit greater than `1`, and stale output.

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
```

Expected: FAIL until the tests consume the Task 0/0A runner and exact
reproduced tree.

- [ ] **Step 2: Verify artifact and lockfile provenance without reinstalling**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- npm explain next
node scripts/safety/run-local-zero-spend.mjs local-only -- npm explain tar
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  ./node_modules/.bin/supabase --version
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/supabase-cli-artifact.test.mjs tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/npm-audit-runner.test.mjs
```

Expected Supabase version is exactly `2.109.1`; installer checksum, platform
matrix, binary mode/link, and local image inventory must still match. If the
tree is missing or drifted, return to Task 0A; do not use `npx`, a package
postinstall, or an ambient global binary.

If a compatibility gate specifically proves Sharp needs its install lifecycle,
allow only:

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm rebuild sharp --ignore-scripts=false
```

The tuple must use the already locked local package, retain the process-tree
guard, and make no external connection. Any other lifecycle tuple is rejected.

- [ ] **Step 3: Capture fresh final audit runs and validate gates**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs production --label final
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs full --label final
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/enterprise/dependency-security.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run db:doctor
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run typecheck
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run lint
node scripts/safety/run-local-zero-spend.mjs local-only -- npm test
node scripts/safety/run-local-zero-spend.mjs local-only -- npm run build
```

The last command must be recognized as the exact production build tuple and
receive `NODE_ENV=production`; tests remain `NODE_ENV=test`. Both final audit
runs must be newly created during this step, structurally valid, and zero
high/critical. A valid advisory exit `1` may describe lower severity findings
but does not satisfy the gate if any high/critical count is nonzero. Any audit
transport/timeout/parse/schema failure is release-blocking and cannot be
reported as clean.

- [ ] **Step 4: Stage only a proved compatibility patch and commit**

If no compatibility source/config change was required, commit only the new
test. Otherwise `stage-task-owned begin` must have recorded the exact shared
path before its edit.

```bash
node scripts/safety/stage-task-owned.mjs stage --task security-task-8 \
  --new tests/enterprise/dependency-security.test.ts \
  --shared-from .artifacts/security/security-task-8-compatibility-paths.json
node scripts/safety/stage-task-owned.mjs verify --task security-task-8
git commit -m "test(security): validate reproduced dependency evidence"
```

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
  npx --no-install vitest run tests/enterprise/ai-workload-graph.test.ts tests/enterprise/api-error-flow.test.ts tests/enterprise/privileged-import-graph.test.ts tests/enterprise/dependency-security.test.ts --reporter=verbose
```

If the paid-tool guard or manifest ownership contract is absent/failing, stop.
Do not duplicate its implementation in this task.

- [ ] **Step 2: Verify principals, envelopes, ledger, and redaction locally**

```bash
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npx --no-install vitest run tests/agents/principal.test.ts tests/agents/billable-envelope.test.ts tests/agents/pricing-snapshot.test.ts tests/agents/budget-reservation.test.ts tests/agents/error-redaction-boundary.test.ts tests/agents/langfuse-redaction.test.ts tests/lib/api-guard.test.ts --reporter=verbose
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  npm test -- --run tests/db/ai-budget-ledger.test.ts tests/db/ai-budget-privileges.test.ts tests/db/ai-budget-recovery.test.ts tests/api/internal-ai-budget-recovery.test.ts tests/db/rls.test.ts tests/db/rag-rls.test.ts
node scripts/safety/run-local-zero-spend.mjs local-only -- \
  node --test tests/safety/process-tree-isolation.test.mjs tests/safety/hostile-env-npm.test.mjs tests/safety/command-environment.test.mjs tests/safety/stage-task-owned.test.mjs tests/safety/clean-checkout-bootstrap.test.mjs tests/safety/supabase-cli-artifact.test.mjs tests/safety/npm-audit-runner.test.mjs
```

- [ ] **Step 3: Verify audited dependencies and full project gates**

```bash
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs production --label final
node scripts/safety/run-local-zero-spend.mjs npm-registry-readonly -- \
  node scripts/ci/run-npm-audit.mjs full --label final
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
- the evidence names fresh production/full audit run IDs, timestamps, actual
  exits, and matching HEAD/lockfile hashes; it never reuses Task 0A/Task 8
  artifacts;
- production headers were source-reviewed, not live-verified.

- [ ] **Step 6: Verify and safely stage the report**

```bash
rg -n "Critical|Important|Minor|\\$0\\.00|54322|release.blocked|not live-verified|guard:paid-ai-tools" docs/quality/security-audit-2026-07-25.md
git diff --check -- docs/quality/security-audit-2026-07-25.md
node scripts/safety/stage-task-owned.mjs stage --task security-task-9 \
  --new docs/quality/security-audit-2026-07-25.md
node scripts/safety/stage-task-owned.mjs verify --task security-task-9
git commit -m "docs(security): record fail-closed security evidence"
```

If `agents/README.md` or `ARCHITECTURE.md` became stale, update and commit each
in a separate path-specific documentation commit. Never stage them with the
evidence report in a shared worktree.
