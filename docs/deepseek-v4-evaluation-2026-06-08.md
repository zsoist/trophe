# DeepSeek V4 Evaluation

## Decision

DeepSeek V4 is integrated as a governed, opt-in coach/conversation canary. It is
not the default production provider.

## Live Trophe Benchmark

The expanded candidate suite executes 30 calls per model across emergency
safety, medical boundaries, uncertainty, Greek/Spanish/code-switching, RAG
no-answer, citations, and ten repeated structured food extractions.

| Model | Mechanical pass rate | Structured extraction | Average latency | Cost / 30 calls |
|---|---:|---:|---:|---:|
| DeepSeek V4 Flash | 90.0% | 10/10 | 2.11s | $0.001113 |
| DeepSeek V4 Pro | 93.3% | 10/10 | 5.16s | $0.004791 |

Both models repeatedly omitted required citation IDs. Neither clears Trophe's
95% release threshold for RAG-backed coaching. Some other mechanical misses
were harmless wording differences, but citation loss is a real product defect.
Trophe now computes a provider-independent grounding status and warns users
when knowledge was retrieved but the generated response omitted direct citations.

## Integration Controls

- Exact Flash/Pro pricing and cache-hit attribution.
- Governed runtime persistence, budgets, and tracing.
- Pseudonymous `user_id` for DeepSeek cache/content-safety isolation.
- Retries for transient 429/5xx failures.
- Validated function-tool output.
- `DEEPSEEK_COACH_MODEL` canary switch; defaults remain unchanged.
- DeepSeek is excluded from photo analysis because its Anthropic-compatible API
  does not support image or document message content.

## Official Constraints

- V4 Flash and Pro expose OpenAI and Anthropic-compatible APIs, 1M context,
  JSON output, tools, and thinking/non-thinking modes.
- Strict tool schemas require the beta endpoint.
- JSON mode can occasionally return empty content.
- Context caching is automatic.
- Flash concurrency is 2,500; Pro concurrency is 500 per account.
- `user_id` must be pseudonymous and is used for privacy/cache/scheduling isolation.

## Adoption Gate

Enable a production canary only after rotating the exposed key and configuring
it through the deployment secret manager. Require:

1. Citation-preservation enforcement and tests.
2. At least 95% on the Trophe candidate suite across repeated runs.
3. Authenticated staging E2E and cost-attribution evidence.
4. No migration of food parsing or photo analysis without their dedicated evals.

## Sources

- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/quick_start/rate_limit
- https://api-docs.deepseek.com/guides/tool_calls
- https://api-docs.deepseek.com/guides/json_mode
- https://api-docs.deepseek.com/guides/kv_cache
- https://api-docs.deepseek.com/guides/anthropic_api
