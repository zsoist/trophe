# Private coach assistant — COACH-01

This slice supports current plan versus recorded work, a rolling seven-calendar-day record summary, curated exercise instructions, and an ephemeral question for the human coach. It never mutates plans, food/workout records or messages. Answers are rendered from deterministic evidence statements. The model can select fact IDs and three allowed suggestion codes; arbitrary factual prose is rejected even if its references are valid.

`contracts.ts` is browser-safe. `run(raw, options)` returns the versioned envelope consumed by AG1. `handler.ts` owns body caps, authenticated preview allowlist, no-store responses and an end-to-end 45-second deadline. The route is a thin adapter over `guardAiRoute` and the existing pg pool.

## Private configuration

- `COACH_ASSISTANT_ENABLED=1`: explicitly enable the endpoint outside Vercel production. Production always returns 404 in this wave.
- `COACH_ASSISTANT_PREVIEW_USER_IDS`: comma-separated verified user IDs allowed to access the private slice. Empty denies everyone.
- `COACH_ASSISTANT_DATA_SOURCE=synthetic`: explicit server-only example fixture with fixed date 2026-09-06 in America/Bogota. User body fixtures and client selectors are rejected in synthetic mode. No real-query failure falls back to it.
- Otherwise read authorized records using the server-derived subject identity/timezone. A professional must be the currently assigned coach and share an organization; there is no global administrator bypass.
- `COACH_ASSISTANT_MODE=model`: deliberately returns `budget_blocked`. Default is a clearly labelled offline deterministic summary. AG1's account UI rejects synthetic responses and uses a separate, explicitly injected example adapter for UI previews.

## Data authority and bounds

`server-repository.ts` uses the existing pg pool. Its bounded authorization query selects identity, relationship, organization IDs, locale and timezone only. Content queries run in a read-only transaction with `SET LOCAL ROLE authenticated` and JWT claims derived from `guardAiRoute`, plus explicit subject/date predicates. Transactions roll back and release; cancellation destroys only that leased connection. Authorization is repeated before and after each data read. It must be validated against the actual database policies in isolated CI before real-data rollout.

At most four data tools read two active plans, 32 sessions with at most 200 sets each, 128 food entries, and one curated unowned library exercise. Each query uses a sentinel row to disclose truncation. Program days cap at21 and templates at20 exercises. Truncated sets/nutrition are labelled partial; conflicting duplicate IDs fail. Null nutrient values are unknown. Only sessions explicitly marked completed contribute to completed-session work. Missing or legacy completion state is not silently upgraded.

The daily plan/record comparison requires linked template IDs and same-calendar-day completed sessions. Repetition targets must be exact, not ranges. Ratios describe recorded versus planned sets, never adherence, muscle activation, fatigue or physiological measurements. Seven-day summaries do not compare a single day's plan against a week's work. External weight uses kg and deterministic pounds conversion. Source IDs remain in the authorized response; model input receives only fact IDs/statements/completeness, never profile identity, notes or the full history.

## Model, economics and privacy

The isolated `coach_assistant` router task selects Luna low, 2000 generated tokens including reasoning, no fallback, and **maxCostUsd:0**. Existing health-context and consumer tasks retain their routing. Optional effort/store forwarding in the shared OpenAI transport preserves default `none` for existing callers.

`invokeOfflineCoachModel` exercises the real structured dispatcher with a required injected fixture transport, one attempt, `store:false`, and configurable none/low/medium. There is no live runner in this wave. The developer-only `offlineModel` injection is accepted only with a synthetic repository, never through HTTP input.

Pricing checked 2026-09-07 UTC: standard short-context Luna $0.20/M input, $0.02/M cached read, $0.25/M cache write, $1.20/M output. Output includes reasoning once. `priceCoachUsage` returns null for missing/invalid usage. Historical runtime rates/records are unchanged. An8000-input/2000-output envelope is $0.004 uncached or $0.0044 if all input were cache writes; these are estimates, not measured spending.

The effective pilot allowance is **US$0** because the earlier program limit is lower than the proposed $5 ceiling. No paid request, new credential, or budget ledger mutation occurred. The existing paid mechanism does not provide an approved cumulative allowance for this new task, so live reservations/reconciliation are untested and blocked. Unknown failed/aborted live usage must remain reserved if a later authorized runner is introduced; this slice does not assume it is free.

Offline responses retain nothing in memory storage or `agent_conversation`, and emit no prompt/content logs. HTTP responses use no-store. `store:false` alone does not imply zero provider retention: abuse monitoring and cache retention remain governed by provider policy. Real sensitive data must not be sent to the model without the applicable provider/access decision.

Official sources: [Luna](https://developers.openai.com/api/docs/models/gpt-5.6-luna), [pricing](https://developers.openai.com/api/docs/pricing), [reasoning](https://developers.openai.com/api/docs/guides/reasoning), [function calling](https://developers.openai.com/api/docs/guides/function-calling), [structured output](https://developers.openai.com/api/docs/guides/structured-outputs), [cache](https://developers.openai.com/api/docs/guides/prompt-caching), [data controls](https://developers.openai.com/api/docs/guides/your-data).

## Verification status

The unit and injected-query fixtures exercise production module/handler/provider code without credentials or network. They prove contract behavior, deterministic arithmetic and adapter configuration, not real Luna quality/latency or deployed database RLS. AG4 owns separate adversarial tests/holdouts. Full repository typecheck/lint/test/build and isolated database integration remain AG1/CI gates: local dependency installation/build is blocked by the program's boot-disk admission threshold. The focused read-only toolchain runs Node20.20.2 and Vitest4.1.10 with a private cache and one worker.
