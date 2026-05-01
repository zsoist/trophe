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
 *   gemini-2.5-flash  ~$0.075 in / $0.30 out
 *   claude-haiku-4-5  ~$0.25  in / $1.25  out
 *   claude-sonnet-4-5 ~$3.00  in / $15.00 out
 *
 * Expected monthly cost at 50 active users (50 meals/day, 1 coach call/day):
 *   food_parse:    50*50*200 tokens * $0.075/M = ~$0.019/day
 *   recipe:        50*5*500 tokens  * $0.25/M  = ~$0.031/day
 *   coach_insight: 50*1*800 tokens  * $3.00/M  = ~$0.12/day
 *   Total: ~$0.17/day (~$5/month) vs current all-Haiku ~$0.40/day
 *
 * To override a task globally: change its policy entry here.
 * To disable a task (force Anthropic): set provider to 'anthropic'.
 */

export type Provider = 'anthropic' | 'google' | 'openai';
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
}

export const taskPolicies: Record<TaskName, RoutingPolicy> = {
  food_parse: {
    provider: 'google',
    model: 'gemini-2.5-flash',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
  },
  recipe_analyze: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 4096,
    cacheSystem: true,
  },
  coach_insight: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20251022',
    costClass: 'mid',
    latencyClass: 'medium',
    maxTokens: 2048,
    cacheSystem: true,
  },
  meal_suggest: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
    cacheSystem: true,
  },
  photo_analyze: {
    provider: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 2048,
  },
  embed: {
    // Voyage v4 is called directly in agents/observability — not via this router.
    provider: 'openai',
    model: 'voyage-4',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
  },
  memory_extract: {
    // Sonnet 4.6 for nuanced fact extraction — runs async after each conversation turn.
    // Strict zod schema output: fact_text, fact_type, confidence, scope, expires_at.
    provider: 'anthropic',
    model: 'claude-sonnet-4-5-20251022',
    costClass: 'mid',
    latencyClass: 'medium',
    maxTokens: 1024,
    cacheSystem: true,
  },
  memory_embed: {
    // Voyage v4 — same embedding model as food/general embeddings for consistency.
    // Called directly via Voyage API in agents/memory/write.ts.
    provider: 'openai',
    model: 'voyage-4',
    costClass: 'cheap',
    latencyClass: 'fast',
    maxTokens: 0,
  },
};
