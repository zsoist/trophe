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
