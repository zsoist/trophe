/**
 * Trophē v0.3 — LLM routing policies.
 *
 * Maps agent tasks to (provider, model) pairs.
 * Cost strategy (2026-06): DeepSeek-first for ALL text tasks.
 * Gemini/Anthropic reserved ONLY for vision (photo_analyze).
 *
 *   - food_parse   → DeepSeek V4 Flash  (cheapest structured output)
 *   - recipe       → DeepSeek V4 Flash
 *   - coach_insight→ Anthropic Haiku 4.5 (health-context compliance boundary)
 *   - meal_suggest → DeepSeek V4 Flash
 *   - photo_analyze→ Anthropic Haiku 4.5 (needs vision/multimodal)
 *   - embed        → Voyage voyage-4
 *
 * Costs ($/M tokens, approximate 2026-06):
 *   deepseek-v4-flash ~$0.14 in / $0.28 out (+ prompt cache discounts)
 *   gemini-2.5-flash  ~$0.30 in / $2.50 out
 *   claude-haiku-4-5  ~$1.00 in / $5.00 out
 *
 * Expected monthly cost at 50 active users (50 meals/day):
 *   food_parse:    50*50*200 tokens * $0.14/M  = ~$0.035/day
 *   recipe:        50*5*500 tokens  * $0.14/M  = ~$0.018/day
 *   coach_insight: 50*1*800 tokens  * $0.14/M  = ~$0.006/day
 *   Total: ~$0.06/day (~$1.8/month) — 75% cheaper than before
 *
 * To override a task globally: change its policy entry here.
 * To disable a task (force Anthropic): set provider to 'anthropic'.
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
  | 'shopping_extract'; // Extract grocery line-items from a week's meal-plan text

export interface RoutingPolicy {
  provider: Provider;
  model: string;
  costClass: CostClass;
  latencyClass: LatencyClass;
  maxTokens: number;
  /** Enable Anthropic prompt-cache on system prompt (ignored for non-Anthropic). */
  cacheSystem?: boolean;
  timeoutMs: number;
  maxInputChars: number;
  maxCostUsd: number;
  promptVersion: string;
}

export const taskPolicies: Record<TaskName, RoutingPolicy> = {
  food_parse: {
    // Migrated to DeepSeek V4 Flash (2026-06-08): $0.14/$0.28 vs Gemini $0.30/$2.50.
    // ~90% cost reduction on output tokens. Structured via tool calling (/beta strict).
    // Fallback: Gemini Flash (constrained decoding) — see taskFallbacks.
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    // 1024 bounds worst-case decode (each output token ~12ms): a typical 1-3 item
    // parse is ~150-400 tok; a 5-item meal w/ per-item reasoning ~700. 1024 keeps
    // headroom while halving the p99 decode ceiling vs 2048. (latency plan A1)
    maxTokens: 1024,
    timeoutMs: 20_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v4',
  },
  recipe_analyze: {
    // Migrated to DeepSeek V4 Flash (2026-06-08): $0.14/$0.28 vs Haiku $1/$5.
    // Fallback: Anthropic Haiku 4.5 — see taskFallbacks.
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    timeoutMs: 25_000, maxInputChars: 30_000, maxCostUsd: 0.02, promptVersion: 'recipe-analyze-v1',
  },
  coach_insight: {
    // Contains direct identifiers and health-context fields. Keep this traffic
    // off DeepSeek pending the three-lane bake-off and formal vendor review.
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    cacheSystem: true,
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 40_000, maxCostUsd: 0.08, promptVersion: 'coach-insight-v2-haiku-compliance',
  },
  meal_suggest: {
    // Migrated to DeepSeek V4 Flash (2026-06-08): $0.14/$0.28 per M tokens
    // vs Haiku 4.5 at $1.00/$5.00. ~85% cost reduction.
    // Uses strict tool calling (/beta) for structural guarantee.
    // Fallback: Anthropic Haiku 4.5 (see taskFallbacks below).
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 8_000, maxCostUsd: 0.02, promptVersion: 'meal-suggest-v2-deepseek',
  },
  photo_analyze: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
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
    model: 'claude-haiku-4-5-20251001',
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
    // DeepSeek V4 Flash (cost mandate) — structured extraction of grocery items
    // from a week's worth of free-text meal-plan cells. Strict tool calling.
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'shopping-extract-v1',
  },
};

// ── Provider fallback chains ─────────────────────────────────────────────
//
// When a primary provider fails (network, rate-limit, outage), executeAiTask
// retries once with the fallback policy before surfacing the error.
//
// Design: all text tasks primary on DeepSeek, fallback to Gemini or Anthropic.
// Photo stays on Anthropic (vision), no fallback needed (Gemini vision is the backup).

export const taskFallbacks: Partial<Record<TaskName, RoutingPolicy>> = {
  food_parse: {
    // Fallback: DeepSeek V4 Flash with longer timeout (same model, retry on transient errors)
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v4-fallback',
  },
  recipe_analyze: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    cacheSystem: true,
    timeoutMs: 25_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'recipe-analyze-v1-fallback',
  },
  coach_insight: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    cacheSystem: true,
    timeoutMs: 45_000, maxInputChars: 40_000, maxCostUsd: 0.10, promptVersion: 'coach-insight-v2-haiku-compliance-fallback',
  },
  meal_suggest: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 25_000, maxInputChars: 8_000, maxCostUsd: 0.05, promptVersion: 'meal-suggest-v1-fallback',
  },
  memory_extract: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 1024,
    timeoutMs: 30_000, maxInputChars: 30_000, maxCostUsd: 0.08, promptVersion: 'memory-extract-v4-haiku-compliance-fallback',
  },
  shopping_extract: {
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 30_000, maxInputChars: 12_000, maxCostUsd: 0.05, promptVersion: 'shopping-extract-v1-fallback',
  },
};
