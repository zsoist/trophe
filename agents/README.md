# /agents — LLM Runtime Surface

Single source of truth for all LLM-backed features in Trophē v0.3.
Routes are thin adapters. Prompts are versioned files. Every call is traced.

_Last updated: 2026-06-15 (DeepSeek-first migration — all text tasks now on DeepSeek V4 Flash; Anthropic retained only for photo vision)_

---

## Architecture

```
agents/
  router/           # task → model policy selection
    index.ts        # pick(task) → { provider, model, options }
    policies.ts     # declarative taskPolicies map
  runtime/
    providers/
      deepseek.ts   # DeepSeek V4 Flash — PRIMARY for all text tasks (strict tool calling)
      text.ts       # text-task dispatch
      structured.ts # structured/tool-call output dispatch
  clients/          # thin API wrappers
    anthropic.ts    # Messages API — used ONLY for photo_analyze (vision)
    google.ts       # Gemini via @google/genai — legacy/fallback only (not on the text path)
  observability/
    langfuse.ts     # wraps every run() in a Langfuse generation span
    otel.ts         # gen_ai.* semconv attributes
  memory/
    read.ts         # kNN scope-filtered retrieval → system prompt injection
    write.ts        # post-turn fact extraction → memory_chunks upsert
    coach-blocks.ts # load + render Letta blocks into prompts
  food-parse/
    index.ts        # public run() — LLM identifies {name,qty,unit} only
    lookup.ts       # pgvector + pg_trgm hybrid retrieval → food_id + grams
  recipe-analyze/
    index.ts        # public run() — recipe text → per-ingredient macros
  insights/
    wearable-summary.ts  # 7-day HRV/sleep/training-load → coach text
  evals/
    run-all.ts      # aggregate eval runner (CI: npm run evals)
    multi-layer/
      schema-validation.ts   # layer 1: zod output schema check
      llm-judge.ts           # layer 2: LLM judges output quality (text tasks are DeepSeek-only per cost mandate — confirm judge model in code, do NOT assume Sonnet)
      regression.ts          # layer 3: golden-set comparison (549-set ~90% / 700-set 76.7% median-of-3)
  prompts/          # versioned prompt templates (git-diffable)
    food-parse.v3.md
    food-parse.v4.md
    recipe-analyze.v1.md
  schemas/          # input/output TypeScript types per agent
```

---

## Current agents

| Agent | Model (via router) | Cache | Status |
|-------|-------------------|-------|--------|
| `food-parse` | DeepSeek V4 Flash | — | ✅ v0.3 deterministic pipeline |
| `recipe-analyze` | DeepSeek V4 Flash | — | ✅ live |
| `photo-analyze` (inline route) | Anthropic Haiku 4.5 (vision) | — | ✅ live |
| `meal-suggest` (inline route) | DeepSeek V4 Flash | — | ✅ live |
| `coach-insight` / `wearable-summary` | DeepSeek V4 Flash | — | ✅ live |
| `memory-write` / `memory-extract` | DeepSeek V4 Flash | — | ✅ live |
| `shopping-extract` (inline route) | DeepSeek V4 Flash | — | ✅ live |

> Cost mandate (2026-06): 100% DeepSeek V4 Flash for ALL text tasks (migrated 2026-06-08). The ONLY non-DeepSeek calls are `photo_analyze` (Anthropic Haiku 4.5 vision) and embeddings (`embed`/`memory_embed` → Voyage voyage-4, 1024-dim).

---

## LLM router

```ts
// agents/router/policies.ts
const taskPolicies = {
  food_parse:      { provider: 'deepseek',  model: 'deepseek-v4-flash' },
  recipe_analyze:  { provider: 'deepseek',  model: 'deepseek-v4-flash' },
  coach_insight:   { provider: 'deepseek',  model: 'deepseek-v4-flash' },
  meal_suggest:    { provider: 'deepseek',  model: 'deepseek-v4-flash' },
  memory_extract:  { provider: 'deepseek',  model: 'deepseek-v4-flash' },
  shopping_extract:{ provider: 'deepseek',  model: 'deepseek-v4-flash' },
  photo_analyze:   { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }, // vision only
  embed:           { provider: 'voyage',    model: 'voyage-4' },
  memory_embed:    { provider: 'voyage',    model: 'voyage-4' },
};
// taskFallbacks: every text task falls back to deepseek-v4-flash (retry, longer timeout) — NOT Gemini/Anthropic.
```

**Never hardcode models in agent files.** Always call `router.pick(task)`.

---

## Agent output contract

```ts
interface RunResult<T> {
  ok: boolean;
  output?: T;
  error?: string;
  telemetry: {
    model: string;
    provider: string;
    tokensIn: number;
    tokensOut: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    latencyMs: number;
    langfuseTraceId: string;
  };
}
```

Every route MUST pass `telemetry` to `logAPIUsage()` so cost and cache-hit rates appear in `/admin/costs`.

---

## Food-parse pipeline (v0.3 — deterministic accuracy)

**v0.2 (broken)**: LLM emitted invented macro numbers → ~81% accuracy (historical v0.2 figure; not current — see benchmark below).

**v0.3 (fixed)**:
```
User input: "200g feta, 1 banana"
  → LLM (DeepSeek V4 Flash): identifies {food_name:"feta cheese", qty:200, unit:"g"}
     LLM NEVER sees or emits macro numbers
  → lookup.ts:
      1. tsvector keyword filter (GIN index on search_text)
      2. cosine kNN on embedding (HNSW pgvector, 1024-dim Voyage v4)
      3. metadata rerank (source quality, region, name similarity)
      → food_id + grams_per_unit from food_unit_conversions
  → macros: grams × food.kcal_per_100g / 100 (pure arithmetic)
  → food_log.food_id FK set, food_log.qty_g set, food_log.parse_confidence set
```

**Benchmark (2026-06-15)**: validated 549-set ~90% pass; harder Greek-weighted 700-set 76.7% pass (median-of-3 vs prod); pooled macro-MAPE 16.0% (after the 2026-06-14 deterministic reduction, was 22.4%); v2 210-set ~94-95%. Cal MAPE ~17%, Fat MAPE ~25% (hardest macro). The 700-case benchmark is ON-DEMAND only (no nightly cron, as of WP3). Sub-10% MAPE requires fine-tuning + Michael-validated Greek ranges, not prompt/retrieval tweaks. Confirm the actual CI threshold in `tests/agents/food-parse.accuracy.test.ts` before quoting a hard gate.

---

## Prompt versioning (strict rule)

1. Create `prompts/<agent>.v1.md` for the initial version.
2. When changing rules, output shape, or adding reference data: copy to `v<N+1>.md`.
3. Update the import in `<agent>/index.ts`. **Never edit an in-use prompt file in place.**
4. Old versions stay in the repo — rollback = change the import back.
5. The filename appears in every PR diff — version bumps are visible + reviewable.

---

## Prompt caching

`clients/anthropic.ts` supports `cacheSystem: true` which wraps the system prompt in `cache_control: { type: 'ephemeral' }`.

**Requirements**:
- Prefix must be ≥2048 tokens
- Stable prefix: rules + USDA reference values + FOOD_DATABASE constants
- Cache TTL: ~5 minutes
- Cache hit: ~10% of normal input cost → ~70% spend reduction at steady state

**Use when**: system prompt ≥2048 tokens AND requests arrive in bursts (typical user sessions).
**Skip when**: isolated single calls or prompts < 2048 tokens.

---

## Observability

Every `run()` call:
1. Creates a Langfuse generation span (`LANGFUSE_HOST`; production uses the configured Langfuse endpoint, local dev can use `http://localhost:3002`)
2. Emits OTel GenAI semconv attributes: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.response.finish_reasons`
3. Writes a row to `agent_runs` table with `langfuse_trace_id` FK for explainability

---

## Adding a new agent

1. **Prompt**: `agents/prompts/<agent>.v1.md`. Use `{PLACEHOLDER}` for runtime-injected content. Keep stable prefix ≥2048 tokens for caching.
2. **Schema**: `agents/schemas/<agent>.ts` — input + output TypeScript types + zod validators.
3. **Agent**: `agents/<agent>/index.ts` — exports `run(input): Promise<RunResult<Output>>`. Calls `router.pick()`, wraps with Langfuse span.
4. **Route**: `app/api/<path>/route.ts` — validate input, call `run()`, call `logAPIUsage(telemetry)`, return response. Target: <60 lines.
5. **Test**: `tests/agents/<agent>.test.ts` — golden cases. At least schema-validation and regression layers.
6. **Evals**: add to `agents/evals/run-all.ts`.

---

## Input sanitization (all AI routes)

```ts
// Applied in every route before calling run()
const safe = input
  .slice(0, MAX_CHARS)                          // food-parse: 500, recipe: 4000
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');  // strip control chars
```

`guardAiRoute(req)` also enforces authenticated access and 60 req/15 min per user. Returns 429 + `Retry-After`.
