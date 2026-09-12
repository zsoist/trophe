/**
 * Trophē v0.3 — LLM routing policies.
 *
 * Maps agent tasks to (provider, model) pairs.
 * Product generative traffic uses one governed Luna lane. Synthetic factory
 * generation and dedicated embeddings/transcription remain separate policies.
 *
 *   - food_parse   → OpenAI GPT-5.6 Luna (Phase 2 quality winner)
 *   - recipe       → OpenAI GPT-5.6 Luna
 *   - coach_insight→ OpenAI GPT-5.6 Luna (health-context text)
 *   - meal_suggest → OpenAI GPT-5.6 Luna
 *   - photo_analyze→ OpenAI GPT-5.6 Luna (text + image input)
 *   - embed        → Voyage voyage-4
 *
 * Costs ($/M tokens, approximate 2026-06):
 *   gpt-5.6-luna      $0.20 in / $1.20 out (official 2026-09-08)
 *   deepseek-v4-flash ~$0.14 in / $0.28 out (+ prompt cache discounts)
 *   gemini-2.5-flash  ~$0.30 in / $2.50 out
 *   claude-haiku-4-5  ~$1.00 in / $5.00 out (historical rows only)
 *
 * Product traffic uses Luna for generative text and vision. The specialized
 * transcription lane remains on its dedicated audio model.
 */

export type Provider = 'anthropic' | 'google' | 'openai' | 'voyage' | 'deepseek';
export type CostClass = 'cheap' | 'mid' | 'high';
export type LatencyClass = 'fast' | 'medium' | 'slow';

export type TaskName =
  | 'food_parse'
  | 'recipe_analyze'
  | 'coach_insight'
  | 'coach_assistant' // Private grounded assistant; live budget disabled in initial wave
  | 'meal_suggest'
  | 'photo_analyze'
  | 'embed'
  | 'memory_extract'  // Phase 5: extract structured facts from conversation turns
  | 'memory_embed'    // Phase 5: embed memory fact text for kNN retrieval
  | 'shopping_extract' // Extract grocery line-items from a week's meal-plan text
  | 'transcribe'
  | 'factory_generate'; // Synthetic eval-data generation; never consumer traffic

export interface RoutingPolicy {
  provider: Provider;
  model: string;
  /** Task-specific OpenAI effort; existing tasks retain their adapter default. */
  reasoningEffort?: 'none' | 'low' | 'medium';
  costClass: CostClass;
  latencyClass: LatencyClass;
  maxTokens: number;
  /** Enable Anthropic prompt-cache on system prompt (ignored for non-Anthropic). */
  cacheSystem?: boolean;
  /** Allow the configured fallback after a primary timeout. */
  fallbackOnTimeout?: boolean;
  timeoutMs: number;
  maxInputChars: number;
  maxCostUsd: number;
  promptVersion: string;
}

export const LUNA_MODEL = 'gpt-5.6-luna' as const;
/** Historical ledger/evaluation identifier; no live policy selects it. */
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001' as const;
export const TRANSCRIPTION_MODEL = 'gpt-4o-mini-transcribe' as const;
const DEEPSEEK_FACTORY_MODEL = 'deepseek-v4-flash';

export const taskPolicies: Record<TaskName, RoutingPolicy> = {
  coach_assistant: {
    provider: 'openai', model: LUNA_MODEL, reasoningEffort: 'low',
    costClass: 'cheap', latencyClass: 'fast', maxTokens: 2000,
    timeoutMs: 45000, maxInputChars: 6500, maxCostUsd: 0.0044,
    promptVersion: 'coach-assistant.v3',
  },
  food_parse: {
    // Phase 2 decision: Luna won the canonical frozen-May instrument, produced
    // zero malformed outputs, and keeps consumer data in the compliance lane.
    // Evidence: artifacts/phase2/phase2-decision-report.md.
    provider: 'openai',
    model: LUNA_MODEL,
    costClass: 'mid',
    latencyClass: 'fast',
    // 1024 bounds worst-case decode (each output token ~12ms): a typical 1-3 item
    // parse is ~150-400 tok; a 5-item meal w/ per-item reasoning ~700. 1024 keeps
    // headroom while halving the p99 decode ceiling vs 2048. (latency plan A1)
    maxTokens: 1024,
    timeoutMs: 15_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v9-luna',
  },
  recipe_analyze: {
    provider: 'openai',
    model: LUNA_MODEL,
    costClass: 'mid',
    latencyClass: 'fast',
    maxTokens: 4096,
    timeoutMs: 25_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'recipe-analyze-v1',
  },
  coach_insight: {
    // Contains direct identifiers and health-context fields. Keep this traffic
    // in the product Luna lane; the adapter remains grounded and text-only.
    provider: 'openai',
    model: LUNA_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    reasoningEffort: 'low',
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 40_000, maxCostUsd: 0.08, promptVersion: 'coach-insight-v3-luna',
  },
  meal_suggest: {
    provider: 'openai',
    model: LUNA_MODEL,
    costClass: 'mid',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 8_000, maxCostUsd: 0.02, promptVersion: 'meal-suggest-v2-luna',
  },
  photo_analyze: {
    provider: 'openai',
    model: LUNA_MODEL,
    reasoningEffort: 'low',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    // Keep enough room below the 45s application boundary for governed
    // accounting while allowing the observed ~31s vision response to finish.
    timeoutMs: 35_000, maxInputChars: 10_000_000, maxCostUsd: 0.08, promptVersion: 'photo-analyze-v1',
  },
  embed: {
    // Voyage v4 is called directly in agents/observability — not via this router.
    provider: 'voyage',
    model: 'voyage-4',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
    timeoutMs: 15_000, maxInputChars: 100_000, maxCostUsd: 0.02, promptVersion: 'embed-v1',
  },
  memory_extract: {
    // Extracts allergies, goals, measurements, mood, and user-authored text
    // through the provider-neutral structured adapter. Keep it in Luna.
    provider: 'openai',
    model: LUNA_MODEL,
    reasoningEffort: 'low',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 1024,
    timeoutMs: 20_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'memory-extract-v5-luna',
  },
  memory_embed: {
    // Voyage v4 — same embedding model as food/general embeddings for consistency.
    // Called directly via Voyage API in agents/memory/write.ts.
    provider: 'voyage',
    model: 'voyage-4',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
    timeoutMs: 15_000, maxInputChars: 30_000, maxCostUsd: 0.01, promptVersion: 'memory-embed-v1',
  },
  shopping_extract: {
    provider: 'openai',
    model: LUNA_MODEL,
    costClass: 'mid',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'shopping-extract-v1',
  },
  transcribe: {
    provider: 'openai',
    model: TRANSCRIPTION_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
    timeoutMs: 20_000,
    maxInputChars: 256,
    // Model hard maximum: 16K input × $1.25/M + 2K output × $5/M.
    // A 30-second recording is normally far below this fail-closed ceiling.
    maxCostUsd: 0.03,
    promptVersion: 'transcribe-v1',
  },
  factory_generate: {
    // Synthetic-only lane. Generator scripts must consume this exact object
    // and execute through the governed runtime so every call reaches agent_runs.
    provider: 'deepseek',
    model: DEEPSEEK_FACTORY_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    timeoutMs: 45_000, maxInputChars: 40_000, maxCostUsd: 0.05, promptVersion: 'factory-generate-v1',
  },
};

/** Production policy object consumed directly by food-parse simulators. */
export const foodParseSimulatorPolicy = taskPolicies.food_parse;

/** Factory policy object consumed directly by synthetic-data generators. */
export const factoryPolicy = taskPolicies.factory_generate;

/** Product traffic has no Anthropic fallback; failures stay in the Luna lane. */
export const taskFallbacks: Partial<Record<TaskName, RoutingPolicy>> = {};
