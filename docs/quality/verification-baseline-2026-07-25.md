# Verification baseline — 2026-07-25

## Scope and boundary

This is a read-only, zero-spend baseline of the canonical release gates on
`codex/trophe-10x-quality`. No provider credentials were inspected or used,
no provider requests were made intentionally, no production system was
contacted, and no golden tolerance or source code was changed.

## Environment

- Node: `v26.0.0`
- npm: `11.12.1`
- Initial branch/state: `## codex/trophe-10x-quality` with no modified or
  untracked files.
- Baseline parent commit: `c19d25bca098ea0a93c9d3e28d178e3246fa0890`
  (`docs: version quality evidence paths`)
- Deadline enforcement: each gate was wrapped with `timeout 600`; no gate
  reached the deadline, so no process sample or termination was required.

| gate | command | exit | seconds | failure | environmental_dependency |
| --- | --- | ---: | ---: | --- | --- |
| typecheck | `/usr/bin/time -p timeout 600 npm run typecheck` | 0 | 2.68 | None. `tsc --noEmit` completed. | Complete local dependency tree. |
| lint | `/usr/bin/time -p timeout 600 npm run lint -- --no-cache` | 0 | 10.48 | None (17 ESLint warnings: 14 `react-hooks/set-state-in-effect`, 1 `react-hooks/exhaustive-deps`, and 2 `@typescript-eslint/no-unused-vars`). | Complete local dependency tree. |
| test | `/usr/bin/time -p timeout 600 npm test -- --reporter=verbose` | 1 | 3.91 | `tests/agents/food-parse.accuracy.test.ts` failed: `unit conversion math > 100 explicit grams never multiply by the food default serving`; `normalizes Greek tablespoon for honey instead of using a 100g serving`; `uses a scoop portion for generic protein shake powder`; `uses a reviewed slice portion for implicit feta`. `tests/db/agent-runs-metadata.test.ts` failed: `agent_runs final outcome persistence > merges apiOutcome into the real JSONB row selected by generation ID`. All five failures end in `connect ECONNREFUSED 127.0.0.1:54322`. Summary: 2 failed, 75 passed, 1 skipped files; 5 failed, 546 passed, 64 skipped tests. | Local Supabase/Postgres at `127.0.0.1:54322` is unavailable. The accuracy suite also reports `DB not available` and skips its DB-backed lookup cases. |
| build | `/usr/bin/time -p timeout 600 npm run build` | 1 | 22.31 | Static generation failed for `/dashboard/messages` and `/coach/calendar`: `Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL`; Next build worker exited code 1. Compilation and TypeScript completed before prerendering failed. | The required public Supabase URL is absent from this worktree environment. The value was not inspected. |

## Observed non-failing diagnostics

- The build warns that Next.js selected the parent repository as its inferred
  workspace root because both the repository and this worktree have lockfiles.
- The build also warns that the `middleware` convention is deprecated and
  Serwist service-worker registration is manual. These diagnostics did not
  cause the failure.
- Vitest emitted a Node `module.register()` deprecation warning and expected
  test diagnostics for missing webhook configuration and mocked food-parse
  errors. They did not cause the five failed assertions above.

## Failure boundary

The compiler and linter are currently green. The test and build gates complete
quickly (rather than hanging) but cannot pass without their documented local
environmental dependencies. This baseline intentionally makes no repair.

## Dependency-tree root cause and preflight — Task 3

The original offloaded checkout remains the root-cause record for the earlier
compiler stall. Its TypeScript standard-library file was observed as:

```text
node_modules/typescript/lib/lib.es2016.full.d.ts
flags: compressed,dataless
```

In that checkout, TypeScript stalled even for a two-line source file when
standard libraries were enabled, while the matching `--noLib` invocation exited
normally. The macOS dataless-file count recorded from that original checkout is
33,117. This evidence is retained as an environmental diagnosis; no source
failure was inferred from it.

The current Task 3 worktree was already installed from the committed lockfile
and is healthy: `find node_modules -flags +dataless -print -quit` returned no
path and the full dataless count is 0. The healthy `node_modules` tree was not
moved or deleted to recreate the fault.

`scripts/ci/verify-release.mjs` now runs a bounded macOS-only dependency
preflight before the canonical gates. It streams `find node_modules -flags
+dataless -print0` only to count NUL-delimited path records; it neither
stores nor publishes a filename or any file contents. An offloaded result stops
before `typecheck`, writes the redacted `dependency_tree_offloaded` category
with its file count and `npm ci` repair instruction, and exits non-zero. Other
platforms report a healthy preflight without invoking macOS `find -flags`.

## Task 4 database prerequisite and resolved gate evidence

- **symptom:** Plain `npm test` produced five local `ECONNREFUSED
  127.0.0.1:54322` failures when the required local database was unavailable,
  while `npm run build` failed static generation because local public Supabase
  configuration was absent.
- **root_cause:** The documented unit-and-integration test contract depends on
  the bootstrapped local database, but the command had no single availability
  boundary. The original build failure was missing local public configuration,
  not a source-level build defect.
- **regression:** `tests/enterprise/database-preflight.test.ts` injects both a
  successful `SELECT 1` client and a rejected client. It proves the rejected
  result is exactly the redacted `database_unavailable` repair shape and that
  the client closes on both paths.
- **fix:** `scripts/test/require-database.mjs` bounds a `SELECT 1` preflight
  using `DATABASE_URL`, falling back only to the documented local URL outside
  production. `npm test` runs it before Vitest; `npm run test:vitest` remains
  the raw focused-test command for TDD. The unavailable CLI diagnostic exposes
  only `npm run db:bootstrap` as remediation.
- **local provisioning:** `npm run db:doctor` correctly reported the stopped
  local Supabase stack. The local stack was started and `npm run db:bootstrap`
  completed migrations, deterministic local/CI fixtures, schema verification,
  and explain-plan capture. Ignored `.env.local` holds only the local database
  URL, local public Supabase URL, local anonymous key, and local site URL.
- **verification:** `npx vitest run
  tests/enterprise/database-preflight.test.ts --reporter=verbose` passed 2
  tests; `npm test -- --reporter=verbose` passed 596 tests with 33 existing
  skips; and `npm run build` completed static generation for all 62 routes.

No unresolved source-level verification failure remains after documented local
provisioning. This evidence used no provider credentials or requests, no
production write, and no golden-tolerance change.
