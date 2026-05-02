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
    inputPerMillion: 0.25,
    outputPerMillion: 1.25,
    cacheReadPerMillion: 0.03,
  },
  [taskPolicies.coach_insight.model]: {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheReadPerMillion: 0.30,
  },
  [taskPolicies.meal_suggest.model]: {
    // gemini-2.0-flash — legacy model, will be upgraded to 2.5-flash after eval
    inputPerMillion: 0.10,
    outputPerMillion: 0.40,
  },
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
