# DeepSeek V4 Harness Evaluation

Date: 2026-06-08

## Decision

- Use `deepseek-v4-flash` as a candidate fallback for bounded text and strict structured-output tasks.
- Do not route latency-sensitive production traffic to `deepseek-v4-pro`.
- Keep photo analysis on a verified vision-capable provider.
- Promote any DeepSeek route only after task-specific shadow evals meet the existing quality gate.

## Observed Results

| Model | Load | Success | Structured validity | p95 | p99 | Cost |
|---|---:|---:|---:|---:|---:|---:|
| V4 Flash | 50 concurrent | 50/50 | 100% | 3.36s | 3.86s | $0.00189 |
| V4 Flash | 100 concurrent | 100/100 | 100% | 2.97s | 3.40s | $0.00373 |
| V4 Pro | 5 concurrent | 3/5 | 100% when completed | 14.31s | 14.31s | $0.00068 |
| V4 Pro | 25 concurrent | 16/25 | 100% when completed | 15.21s | 15.69s | $0.00317 |

All observed Pro failures were incomplete responses with `finish_reason=length`, not transport errors.

## Harness Improvements Implemented

- Strict structured tool calls use DeepSeek's beta endpoint and `strict: true`.
- Structured responses must finish with `tool_calls`.
- Text responses reject incomplete `length`, `content_filter`, and `insufficient_system_resource` finishes.
- Hashed `user_id` values isolate provider cache, safety, and scheduling state without sending raw user identifiers.
- Stress runner measures concurrency, failure rate, structured validity, latency percentiles, cache-read tokens, and estimated cost.

## Promotion Gates

DeepSeek Flash can become a production fallback for a task only when:

- Task-specific quality is at least equal to the current primary model.
- API failure rate is below 1% over at least 1,000 shadow requests.
- Structured validity is 100% for schema-bound tasks.
- p95 latency and cost meet that task's policy.
- Safety, abstention, multilingual, and grounding suites pass.

## Official API Findings

- DeepSeek documents account concurrency limits of 2,500 for Flash and 500 for Pro.
- `user_id` provides content-safety, KV-cache, and scheduling isolation.
- Context caching is automatic and exposes cache-hit token counts.
- Strict tool mode requires the beta endpoint and validates supported JSON Schema.
- Retryable service conditions include rate limiting and transient server overload; authentication and request-format failures must not retry.

Sources:

- https://api-docs.deepseek.com/quick_start/rate_limit/
- https://api-docs.deepseek.com/guides/kv_cache/
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/quick_start/error_codes
- https://api-docs.deepseek.com/api/create-chat-completion
