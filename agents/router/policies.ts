/**
 * Trophē v0.3 — LLM routing policies.
 *
 * Maps agent tasks to (provider, model) pairs. Chosen from the Phase 3
 * operator decisions in the plan:
 *   - food_parse   → Gemini 2.5 Flash  (cost-optimised, fast, good at extraction)
 *   - recipe       → Haiku 4.5         (well-calibrated for recipe JSON)
 *   - coach_insight→ Sonnet 4.6        (nuanced coaching language)
 *   - embed        → Voyage voyage-4   (1024-dim, MTEB 67, matches OpenBrain)
 *
 * Costs ($/M tokens, approximate 2026-05):
 *   gemini-2.5-flash  ~$0.30 in / $2.50 out
 *   claude-haiku-4-5  ~$1.00 in / $5.00 out
 *   claude-sonnet-4-6 ~$3.00 in / $15.00 out
 *
 * Expected monthly cost at 50 active users (50 meals/day, 1 coach call/day):
 *   food_parse:    50*50*200 tokens * $0.30/M  = ~$0.075/day
 *   recipe:        50*5*500 tokens  * $0.25/M  = ~$0.031/day
 *   coach_insight: 50*1*800 tokens  * $3.00/M  = ~$0.12/day
 *   Total: ~$0.23/day (~$7/month) before output tokens and cache discounts
 *
 * To override a task globally: change its policy entry here.
 * To disable a task (force Anthropic): set provider to 'anthropic'.
 */

export type Provider = 'anthropic' | 'google' | 'openai' | 'voyage';
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
  | 'memory_embed';   // Phase 5: embed memory fact text for kNN retrieval

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
    provider: 'google',
    model: 'gemini-2.5-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    timeoutMs: 20_000, maxInputChars: 12_000, maxCostUsd: 0.02, promptVersion: 'food-parse-v4',
  },
  recipe_analyze: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    cacheSystem: true,
    timeoutMs: 25_000, maxInputChars: 30_000, maxCostUsd: 0.05, promptVersion: 'recipe-analyze-v1',
  },
  coach_insight: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-6',
    costClass: 'mid',
    latencyClass: 'medium',
    maxTokens: 2048,
    cacheSystem: true,
    timeoutMs: 30_000, maxInputChars: 40_000, maxCostUsd: 0.25, promptVersion: 'coach-insight-v1',
  },
  meal_suggest: {
    // Migrated from gemini-2.0-flash (deprecated June 1, 2026) to Haiku 4.5.
    // Eval: 50/50 (100%) on 10-prompt suite with tool_choice enforcement.
    // See agents/evals/run-meal-suggest.ts and commit fe0ad58.
    // Uses tool_use + tool_choice for structural guarantee (no regex extraction).
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    cacheSystem: true,
    timeoutMs: 25_000, maxInputChars: 8_000, maxCostUsd: 0.05, promptVersion: 'meal-suggest-v1',
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
    // Constrained Gemini decoding makes fact extraction structurally reliable
    // while keeping this per-turn background task inexpensive and fast.
    provider: 'google',
    model: 'gemini-2.5-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 1024,
    timeoutMs: 20_000, maxInputChars: 30_000, maxCostUsd: 0.03, promptVersion: 'memory-extract-v2',
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
};
