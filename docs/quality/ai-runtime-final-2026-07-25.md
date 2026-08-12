# AI Runtime Zero-Spend Verification

**Evidence refreshed:** 2026-07-29
**Branch:** `codex/trophe-10x-quality`
**Provider spend:** USD `$0.00`
**Production access:** none
**Evidence class:** offline provider contracts and local automated tests

## Result

The AI runtime and provider boundary met the zero-spend contract exercised in
this workstream:

- AI-focused Vitest run: 39 files passed, one database-dependent file skipped;
  416 tests passed and 28 skipped.
- Offline provider-contract evaluation: 17 of 17 scenarios passed.
- OpenAI and Anthropic were exercised through injected fixture transports.
- OpenAI, Anthropic, DeepSeek, Voyage, Gemini, and Mistral credential variables
  were removed from the command environment.
- `TROPHE_ALLOW_PAID_AI` was removed from the command environment.
- The generated report records zero live transport attempts.
- The redaction sentinel is absent from every result and the serialized report.

These results do not measure live LLM quality. Nutrition accuracy remains
governed by the frozen local datasets and separately authorized live
benchmarks.

## Commands

```bash
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY \
  -u VOYAGE_API_KEY -u GEMINI_API_KEY -u MISTRAL_API_KEY \
  -u TROPHE_ALLOW_PAID_AI \
  npx vitest run tests/agents tests/api/food-parse.test.ts \
  tests/api/conversation.test.ts tests/api/photo-analyze-contract.test.ts \
  --reporter=verbose
```

Observed summary:

```text
Test Files  39 passed | 1 skipped (40)
Tests       416 passed | 28 skipped (444)
Exit        0
```

```bash
env -u OPENAI_API_KEY -u ANTHROPIC_API_KEY -u DEEPSEEK_API_KEY \
  -u VOYAGE_API_KEY -u GEMINI_API_KEY -u MISTRAL_API_KEY \
  -u TROPHE_ALLOW_PAID_AI npm run evals:offline:providers
```

Observed summary:

```text
offline provider-contract evaluation: 17/17 scenarios passed
Exit 0
```

Machine-readable evidence:
`docs/quality/ai-provider-contracts.json`.

## Route policy matrix

| Workload | Primary lane | Fallback | Offline coverage |
|---|---|---|---|
| `food_parse` | OpenAI GPT-5.6 Luna | Anthropic Haiku 4.5 | structured success, retry, cache, abort, malformed output, schema, fallback |
| `recipe_analyze` | OpenAI GPT-5.6 Luna | Anthropic Haiku 4.5 | shared provider/runtime contracts |
| `meal_suggest` | OpenAI GPT-5.6 Luna | Anthropic Haiku 4.5 | shared provider/runtime contracts |
| `shopping_extract` | OpenAI GPT-5.6 Luna | Anthropic Haiku 4.5 | shared provider/runtime contracts |
| `coach_insight` | Anthropic Haiku 4.5 | same compliance lane | provider, cache, response, and runtime contracts |
| `memory_extract` | Anthropic Haiku 4.5 | same compliance lane | provider, cache, response, and runtime contracts |
| `photo_analyze` | Anthropic Haiku 4.5 | none | route contract plus shared Anthropic transport |
| `factory_generate` | DeepSeek V4 Flash | none | governed provider and paid-tool boundary tests |
| `embed` / `memory_embed` | Voyage 4 | none | injected transport and paid-provider boundary tests |

## Contract scenarios

The 17-scenario fixture matrix covers:

- structured success for OpenAI and Anthropic;
- cache read and cache write token accounting for both providers;
- safe 403 normalization;
- bounded OpenAI 429 retry and 503 retry;
- abort propagation;
- malformed successful JSON;
- missing required tool output;
- Zod schema rejection;
- recoverable OpenAI-to-Anthropic fallback success;
- fallback exhaustion without a third attempt.

Expected failure scenarios pass only when the adapter returns the required
normalized category, attempt count, fallback state, usage, cost, and redaction
result. A mocked error is not counted as a successful model response.

## Runtime guarantees covered

- The primary and fallback share one monotonic end-to-end deadline.
- The exact abort signal reaches provider transports.
- Retry counts are bounded and restricted to retryable transport/status cases.
- Fallback is limited to timeout, rate-limit, and transient categories.
- Authentication, schema, budget, policy, invalid-input, and unknown errors do
  not enter fallback.
- Structured responses require the selected tool and Zod validation.
- Missing Anthropic tool output is now a typed `schema` failure rather than an
  unclassified generic error.
- Token usage includes uncached input, cache reads, cache writes, output, and
  reasoning tokens where the provider supplies them.
- Model-specific immutable pricing converts fixture usage into projected cost.
- Provider bodies and the sentinel are absent from the report.
- Persistence failures do not trigger duplicate provider work.
- Local live transport is denied unless the exact opt-in is present; direct
  batch tools require stricter bounded approval in addition.

## Remaining evidence boundary

This workstream deliberately made no live Luna, Anthropic, DeepSeek, Voyage,
Gemini, or Mistral call. It did not alter a nutrition golden tolerance. Live
model quality, provider latency, and production fallback rate require a
separately authorized, budget-bounded canary and are not claimed here.
