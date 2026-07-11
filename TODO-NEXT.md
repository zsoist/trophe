# TODO-NEXT — current priorities as of 2026-07-11

Read this before changing routing, evals, factory generators, or production state.

## Current Phase 3 state

- Consumer structured-text lane: GPT-5.6 Luna primary, Claude Haiku 4.5 fallback.
- Health-context lane: `coach_insight` and `memory_extract` remain Claude Haiku 4.5.
- Factory lane: DeepSeek V4 Flash, synthetic-only, governed through `executeAiTask` / `agent_runs`.
- Phase 2 evidence: `artifacts/phase2/phase2-decision-report.md`.
- Daily regression asset: `tests/fixtures/food-parse-luna-watchlist.json`.
- Canary plan: `docs/ops/consumer-luna-canary-plan-2026-07-11.md`.
- Rollback point for a separately authorized deployment: `dpl_D4PvE3J6sDegkn3HFQXpZHchq7nV`.

## Human approval gates

1. Review the Phase 3 draft PR diff and full verification evidence.
2. Decide merge separately. This work order does not authorize merge.
3. Decide deployment separately after merge review. Every approval is per deploy.
4. Assemble the 10–15 real-meal photo golden set with Daniela before resuming the vision arm.

## Separate next work order — do not bundle

Curate the Greek/Colombian seed and alias batch using Pattern 3: proposed list, manual human review pause, idempotent migration, and post-write verification. Start with the ten watch-list cases and separately inspect the four Greek-tagged cases. Bad reference data must not be auto-approved.

## Standing rules

- `agent_runs` is the canonical AI-cost and attribution table; `api_usage_log` is legacy compatibility only.
- Production writes are read-only unless a work order explicitly authorizes a migration or deployment.
- Production branch is `main`; pushing to it auto-deploys.
- Paid factory/simulator jobs run outside UTC 01:00–04:00 and 06:00–10:00.
- Eval identity is environment-configured; never hardcode a tester email or UUID.
- Golden tolerance or criteria changes require an adjacent `tolerance_justification` in the same commit.
- Every gate states its data source. Local bootstrap data is not evidence of production state.
