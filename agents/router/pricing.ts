import { taskPolicies } from './policies';

export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
}

export const modelPricing: Record<string, ModelPricing> = {
  [taskPolicies.food_parse.model]: {
    inputPerMillion: 0.075,
    outputPerMillion: 0.30,
  },
  [taskPolicies.recipe_analyze.model]: {
    // claude-haiku-4-5: $1.00/M in, $5.00/M out, cache read $0.10/M
    // Also used by meal_suggest (same model string, shared entry).
    inputPerMillion: 1.00,
    outputPerMillion: 5.00,
    cacheReadPerMillion: 0.10,
  },
  [taskPolicies.coach_insight.model]: {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheReadPerMillion: 0.30,
  },
  // meal_suggest now uses claude-haiku-4-5 (same as recipe_analyze).
  // Pricing entry shared — keyed by model string, not task name.
  // Old gemini-2.0-flash entry removed (model deprecated June 1, 2026).
  [taskPolicies.memory_embed.model]: {
    inputPerMillion: 0.12,
    outputPerMillion: 0,
  },
};

export function estimateModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
): number {
  const pricing = modelPricing[model];
  if (!pricing) return 0;

  const billableInputTokens = Math.max(0, inputTokens - cacheReadTokens);
  const inputCost = billableInputTokens * pricing.inputPerMillion / 1_000_000;
  const outputCost = outputTokens * pricing.outputPerMillion / 1_000_000;
  const cacheCost = cacheReadTokens * (pricing.cacheReadPerMillion ?? pricing.inputPerMillion) / 1_000_000;

  return inputCost + outputCost + cacheCost;
}
