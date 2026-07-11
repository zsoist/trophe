# Consumer Luna canary plan — 2026-07-11

This is a plan only. It does not authorize merge, deployment, routing mutation, or production writes.

## Scope and rollback point

- Lane: consumer `food_parse` only, primary GPT-5.6 Luna and fallback Claude Haiku 4.5.
- Observation period: seven full days after an independently authorized production deployment.
- Pre-change rollback deploy ID: `dpl_D4PvE3J6sDegkn3HFQXpZHchq7nV`.
- Rollback means promoting that exact deployment after a human confirms a trigger. No automatic rollback is authorized.

## Segmentation and daily instrument

- Segment Langfuse and `agent_runs` by task, provider, model, prompt version, fallback status, and metadata `canarySegment=consumer-luna-week-1`.
- The API accepts the canary header only for a user listed in `AI_RATE_LIMIT_BYPASS_USER_IDS`; ordinary users cannot spoof the segment. Langfuse receives a stable SHA-256 pseudonymous user key, never the raw UUID.
- Run the frozen 30-probe production suite with `npm run evals:nutrition` once daily at 04:30 UTC. Compare accuracy with the frozen-May scorer and the pre-canary 63.3% (19/30) production comparator.
- Run `npm run evals:food-parse:watchlist` immediately afterward against the deployed production endpoint. This suite requires env-configured eval identity and never uses a hardcoded account.
- Both runners must pass the `/api/health` routing preflight proving deployed Luna → Haiku policy before results are accepted.
- The watch-list is `tests/fixtures/food-parse-luna-watchlist.json`: ten fully DB-backed DeepSeek-exclusive Phase 2 cases, including four explicitly Greek-tagged cases.
- Store each daily report under `artifacts/watchlist/`. The watch-list is a named-loss monitor for seed/alias mitigation; do not substitute its score for the frozen 30-probe rollback instrument.

## Rollback triggers

Escalate and roll back when either condition is confirmed on production evidence:

1. Frozen 30-probe daily accuracy falls by more than 5 percentage points from the 63.3% pre-canary production baseline.
2. Malformed or empty food-parse outputs exceed 1% of final request outcomes in the segmented production lane. Query only `agent_runs` rows where `metadata.apiOutcome` is present; this excludes intermediate primary/fallback attempts and counts the final API result once.

Provider transport success alone is not quality evidence. Investigate isolated case failures, latency changes, and fallback volume even when neither rollback threshold fires.

## Daily record

Before deployment, provision the production-environment `OPENAI_API_KEY` GitHub secret and run the manual provider-smoke workflow; it must prove Luna generation ID and non-zero token usage. Record the date, deploy ID, watch-list pass count, malformed rate, p50/p95 latency, fallback rate, affected case IDs, Langfuse segment link, and operator decision. At day seven, write a keep/rollback/extend recommendation; do not silently extend the canary.
