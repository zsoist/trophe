# /agents — LLM Runtime Surface

Single source of truth for all LLM-backed features in Trophē v0.3.
Routes are thin adapters. Prompts are versioned files. Every call is traced.

_Last updated: 2026-05-03 (B2B readiness hardening)_

---

## Architecture

```
agents/
  router/           # task → model policy selection
    index.ts        # pick(task) → { provider, model, options }
    policies.ts     # declarative taskPolicies map
  clients/          # thin API wrappers
    anthropic.ts    # Messages API + cache_control support
    google.ts       # Gemini via @google/genai
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
      llm-judge.ts           # layer 2: Sonnet judges output quality
      regression.ts          # layer 3: Nikos golden set comparison
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
| `food-parse` | Gemini 2.5 Flash | — | ✅ v0.3 deterministic pipeline |
| `recipe-analyze` | Haiku 4.5 | ephemeral (system) | ✅ live |
| `photo-analyze` (inline route) | Haiku 4.5 | — | ✅ live |
| `meal-suggest` (inline route) | Haiku 4.5 | — | ✅ live |
| `coach-insight` / `wearable-summary` | Sonnet 4.5 | — | ✅ live |
| `memory-write` | Sonnet 4.5 | — | ✅ live |

---

## LLM router

```ts
// agents/router/policies.ts
const taskPolicies = {
  food_parse:    { provider: 'google',    model: 'gemini-2.5-flash' },
  recipe_analyze:{ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', cacheSystem: true },
  coach_insight: { provider: 'anthropic', model: 'claude-sonnet-4-5-20251022' },
  embed:         { provider: 'voyage',    model: 'voyage-large-2' },
};
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

**v0.2 (broken)**: LLM emitted invented macro numbers → ~81% accuracy on Nikos golden set.

**v0.3 (fixed)**:
```
User input: "200g feta, 1 banana"
  → LLM (Gemini Flash): identifies {food_name:"feta cheese", qty:200, unit:"g"}
     LLM NEVER sees or emits macro numbers
  → lookup.ts:
      1. tsvector keyword filter (GIN index on search_text)
      2. cosine kNN on embedding (HNSW pgvector, 1024-dim Voyage v4)
      3. metadata rerank (source quality, region, name similarity)
      → food_id + grams_per_unit from food_unit_conversions
  → macros: grams × food.kcal_per_100g / 100 (pure arithmetic)
  → food_log.food_id FK set, food_log.qty_g set, food_log.parse_confidence set
```

**CI hard gate**: ≥95% on Nikos golden set (`tests/agents/food-parse.accuracy.test.ts`).

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
