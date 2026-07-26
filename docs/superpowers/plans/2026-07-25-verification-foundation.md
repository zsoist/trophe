# Verification Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every release gate deterministic, bounded, diagnosable, and green without paid API or production access.

**Architecture:** A small Node verification orchestrator runs the existing canonical commands as isolated child processes, applies per-gate deadlines, terminates the process group on timeout, and writes a machine-readable summary. The existing commands remain independently runnable; the orchestrator adds diagnostics rather than replacing them.

**Tech Stack:** Node.js child processes, TypeScript, ESLint, Vitest 4, Next.js 16 production build.

## Global Constraints

- Provider spend is USD $0.00.
- Production is read-only.
- Do not change golden files, tolerances, or pass criteria.
- Keep `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` as the canonical gates.
- Work only on `codex/trophe-10x-quality`.

---

### Task 1: Re-baseline every gate independently

**Files:**
- Create: `artifacts/quality/verification-baseline-2026-07-25.md`

**Interfaces:**
- Consumes: repository scripts from `package.json`
- Produces: exact exit status, duration, and failure boundary for each gate

- [ ] **Step 1: Record toolchain and clean-tree state**

Run:

```bash
node --version
npm --version
git status --short --branch
```

Expected: branch is `codex/trophe-10x-quality`; no source changes beyond the
committed specification and plan documents.

- [ ] **Step 2: Run typecheck with a 10-minute outer deadline**

Run:

```bash
/usr/bin/time -p npm run typecheck
```

Expected: exit 0. If it stalls, capture a process sample before terminating it
and record the last observable phase.

- [ ] **Step 3: Run lint with a 10-minute outer deadline**

Run:

```bash
/usr/bin/time -p npm run lint -- --no-cache
```

Expected: exit 0.

- [ ] **Step 4: Run Vitest with deterministic worker diagnostics**

Run:

```bash
/usr/bin/time -p npm test -- --reporter=verbose
```

Expected: every suite completes. Record each failing file and test name exactly.

- [ ] **Step 5: Run the production build**

Run:

```bash
/usr/bin/time -p npm run build
```

Expected: exit 0 and no missing-module, type, or static-generation failure.

- [ ] **Step 6: Write the baseline artifact**

Use a table with columns `gate`, `command`, `exit`, `seconds`, `failure`, and
`environmental_dependency`. Do not convert a failure into a code change in this
task.

- [ ] **Step 7: Commit the evidence**

```bash
git add artifacts/quality/verification-baseline-2026-07-25.md
git commit -m "test: capture verification baseline"
```

### Task 2: Add a bounded release-gate orchestrator

**Files:**
- Create: `scripts/ci/verify-release.mjs`
- Create: `tests/enterprise/verification-runner.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `runStep({ name, command, args, timeoutMs, cwd })`
- Produces: `npm run verify:bounded`
- Writes: `artifacts/quality/verification-summary.json`

- [ ] **Step 1: Write the failing runner tests**

Test an exported `runStep` with one command that exits 0, one that exits 7, and
one that exceeds a 50 ms deadline. Assert the timeout result is:

```ts
{
  name: 'slow',
  status: 'timed_out',
  exitCode: null,
  signal: 'SIGTERM',
}
```

Also assert that stdout/stderr are bounded to 64 KiB per step.

- [ ] **Step 2: Run the focused test**

```bash
npx vitest run tests/enterprise/verification-runner.test.ts --reporter=verbose
```

Expected: FAIL because `scripts/ci/verify-release.mjs` does not exist.

- [ ] **Step 3: Implement the runner**

Use `spawn(command, args, { cwd, detached: process.platform !== 'win32',
stdio: ['ignore', 'pipe', 'pipe'] })`. On timeout, terminate the process group
with `process.kill(-child.pid, 'SIGTERM')`, then use `SIGKILL` after a two-second
grace period. Return a serializable result containing duration and bounded
output.

- [ ] **Step 4: Add the canonical sequence**

Configure these exact steps:

```js
[
  ['typecheck', 'npm', ['run', 'typecheck'], 600_000],
  ['lint', 'npm', ['run', 'lint', '--', '--no-cache'], 600_000],
  ['test', 'npm', ['test', '--', '--reporter=verbose'], 900_000],
  ['build', 'npm', ['run', 'build'], 900_000],
]
```

Stop after the first failed or timed-out gate and write the JSON summary before
exiting non-zero.

- [ ] **Step 5: Add the package script**

Add:

```json
"verify:bounded": "node scripts/ci/verify-release.mjs"
```

- [ ] **Step 6: Run focused and full runner tests**

```bash
npx vitest run tests/enterprise/verification-runner.test.ts --reporter=verbose
npm run verify:bounded
```

Expected: focused test passes; bounded verification identifies the same first
failure as Task 1 or completes successfully.

- [ ] **Step 7: Commit**

```bash
git add scripts/ci/verify-release.mjs tests/enterprise/verification-runner.test.ts package.json
git commit -m "test: bound and diagnose release verification"
```

### Task 3: Repair the offloaded dependency tree

**Files:**
- Replace locally: `node_modules/` from the committed lockfile
- Modify: `scripts/ci/verify-release.mjs`
- Test: `tests/enterprise/verification-runner.test.ts`
- Modify: `artifacts/quality/verification-baseline-2026-07-25.md`

**Interfaces:**
- Detects: macOS `dataless` dependency placeholders before running gates
- Produces: a complete dependency tree from `package-lock.json`

- [ ] **Step 1: Preserve the root-cause evidence**

Record that TypeScript hangs even for a two-line file when standard libraries
are enabled, while `--noLib` exits normally. Record:

```text
node_modules/typescript/lib/lib.es2016.full.d.ts
flags: compressed,dataless
```

Also record the count of `dataless` files under `node_modules`.

- [ ] **Step 2: Add a failing macOS preflight test**

Inject a dependency-health probe result containing one `dataless` path. Assert
`verify-release.mjs` stops before typecheck and reports
`dependency_tree_offloaded` with the file count, never file contents.

- [ ] **Step 3: Prove red**

```bash
npx vitest run tests/enterprise/verification-runner.test.ts -t "offloaded dependency" --reporter=verbose
```

- [ ] **Step 4: Implement the preflight**

On macOS run:

```bash
find node_modules -flags +dataless -print
```

When any path is returned, exit before verification with a repair instruction.
On other operating systems the probe returns healthy without running `find
-flags`.

- [ ] **Step 5: Reinstall from the lockfile**

Move the incomplete dependency tree to a temporary directory outside the
repository, run `npm ci`, and verify:

```bash
find node_modules -flags +dataless -print -quit
```

Expected: no output.

- [ ] **Step 6: Prove TypeScript and Vitest start normally**

```bash
npm run typecheck
npx vitest run tests/agents/runtime-execute.test.ts --reporter=verbose
```

Expected: neither process blocks on dependency reads.

- [ ] **Step 7: Verify and commit the guard**

```bash
npx vitest run tests/enterprise/verification-runner.test.ts --reporter=verbose
git add scripts/ci/verify-release.mjs tests/enterprise/verification-runner.test.ts artifacts/quality/verification-baseline-2026-07-25.md
git commit -m "fix(test): detect offloaded dependency trees"
```

### Task 4: Fix any source-level failures exposed after dependency repair

**Files:**
- Modify: the exact source and test files named in
  `artifacts/quality/verification-baseline-2026-07-25.md`
- Modify: `artifacts/quality/verification-baseline-2026-07-25.md`

**Interfaces:**
- Consumes: deterministic compiler, lint, test, or build diagnostics
- Produces: one independently reviewed commit per root cause

- [ ] **Step 1: Reduce one recorded failure**

Use the exact file and test name from the baseline artifact. Run only that test
or compiler target.

- [ ] **Step 2: Add a regression that fails for the observed cause**

The assertion encodes the broken behavior. It must not increase a timeout, skip
a suite, mock success, or change a golden tolerance.

- [ ] **Step 3: Prove red, implement the minimum correction, and prove green**

Run the regression before and after the correction, then run its enclosing
canonical gate.

- [ ] **Step 4: Record and commit**

Append `symptom`, `root_cause`, `regression`, `fix`, and `verification` to the
baseline artifact. Commit only the files for this root cause.

- [ ] **Step 5: Repeat for every remaining source-level failure**

The task ends when the baseline artifact has no unresolved source-level failure.

### Task 5: Final verification evidence

**Files:**
- Create: `artifacts/quality/verification-final-2026-07-25.md`

- [ ] **Step 1: Run the bounded canonical sequence**

```bash
npm run verify:bounded
```

Expected: all four steps pass.

- [ ] **Step 2: Run the commands independently**

```bash
npm run typecheck
npm run lint -- --no-cache
npm test
npm run build
```

Expected: four exit-0 results.

- [ ] **Step 3: Record commit SHA and durations**

Include the exact SHA, Node/npm versions, per-gate durations, test counts, and
build route summary in the final artifact.

- [ ] **Step 4: Commit**

```bash
git add artifacts/quality/verification-final-2026-07-25.md artifacts/quality/verification-summary.json
git commit -m "test: record green release verification"
```
