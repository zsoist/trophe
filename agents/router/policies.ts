/**
 * Trophē v0.3 — LLM routing policies.
 *
 * Maps agent tasks to (provider, model) pairs.
 * Three-lane strategy (2026-07): consumer, health-context, and factory
 * traffic are intentionally separated by policy and compliance posture.
 *
 *   - food_parse   → OpenAI GPT-5.6 Luna (Phase 2 quality winner)
 *   - recipe       → OpenAI GPT-5.6 Luna
 *   - coach_insight→ Anthropic Haiku 4.5 (health-context compliance boundary)
 *   - meal_suggest → OpenAI GPT-5.6 Luna
 *   - photo_analyze→ Anthropic Haiku 4.5 (needs vision/multimodal)
 *   - embed        → Voyage voyage-4
 *
 * Costs ($/M tokens, approximate 2026-06):
 *   gpt-5.6-luna      ~$1.00 in / $6.00 out
 *   deepseek-v4-flash ~$0.14 in / $0.28 out (+ prompt cache discounts)
 *   gemini-2.5-flash  ~$0.30 in / $2.50 out
 *   claude-haiku-4-5  ~$1.00 in / $5.00 out
 *
 * To override a task globally: change its policy entry here.
 */

export type Provider = 'anthropic' | 'google' | 'openai' | 'voyage' | 'deepseek';
export type CostClass = 'cheap' | 'mid' | 'high';
export type LatencyClass = 'fast' | 'medium' | 'slow';

export type TaskName =
  | 'food_parse'
  | 'recipe_analyze'
  | 'coach_insight'
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

const LUNA_MODEL = 'gpt-5.6-luna';
const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const DEEPSEEK_FACTORY_MODEL = 'deepseek-v4-flash';

export const taskPolicies: Record<TaskName, RoutingPolicy> = {
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
    fallbackOnTimeout: true,
    timeoutMs: 15_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v8-luna',
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
    // off DeepSeek pending the three-lane bake-off and formal vendor review.
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    cacheSystem: true,
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 40_000, maxCostUsd: 0.08, promptVersion: 'coach-insight-v2-haiku-compliance',
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
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 10_000_000, maxCostUsd: 0.08, promptVersion: 'photo-analyze-v1',
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
    // Extracts allergies, goals, measurements, mood, and user-authored text.
    // Keep this traffic off DeepSeek pending formal vendor review.
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 1024,
    timeoutMs: 20_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'memory-extract-v4-haiku-compliance',
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
    model: 'gpt-transcribe',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
    timeoutMs: 20_000,
    maxInputChars: 256,
    maxCostUsd: 0.00225,
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

// ── Provider fallback chains ─────────────────────────────────────────────
//
// When a primary provider fails (network, rate-limit, outage), executeAiTask
// retries once with the fallback policy before surfacing the error.
//
// Consumer text stays inside the Luna → Haiku chain. DeepSeek is deliberately
// absent from every consumer fallback and remains confined to factory_generate.

export const taskFallbacks: Partial<Record<TaskName, RoutingPolicy>> = {
  food_parse: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    cacheSystem: true,
    maxTokens: 1024,
    timeoutMs: 25_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v8-haiku-fallback',
  },
  recipe_analyze: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    cacheSystem: true,
    timeoutMs: 25_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'recipe-analyze-v1-fallback',
  },
  coach_insight: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    cacheSystem: true,
    timeoutMs: 45_000, maxInputChars: 40_000, maxCostUsd: 0.10, promptVersion: 'coach-insight-v2-haiku-compliance-fallback',
  },
  meal_suggest: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 8_000, maxCostUsd: 0.05, promptVersion: 'meal-suggest-v1-fallback',
  },
  memory_extract: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 1024,
    timeoutMs: 30_000, maxInputChars: 30_000, maxCostUsd: 0.08, promptVersion: 'memory-extract-v4-haiku-compliance-fallback',
  },
  shopping_extract: {
    provider: 'anthropic',
    model: HAIKU_MODEL,
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 12_000, maxCostUsd: 0.05, promptVersion: 'shopping-extract-v1-fallback',
  },
};
