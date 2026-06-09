export interface ModelPricing {
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

// Keyed by exact model string. After the 2026-06-08 DeepSeek migration all
// text tasks route to deepseek-v4-flash — do NOT use computed keys here
// (they would silently overwrite with the last task's pricing if models ever
// converge again, as happened with the coach_insight/$3/$15 duplicate).
export const modelPricing: Record<string, ModelPricing> = {
  'deepseek-v4-flash': {
    inputPerMillion: 0.14,
    outputPerMillion: 0.28,
    cacheReadPerMillion: 0.0028,
  },
  'deepseek-v4-pro': {
    inputPerMillion: 0.435,
    outputPerMillion: 0.87,
    cacheReadPerMillion: 0.003625,
  },
  'gemini-2.5-flash': {
    inputPerMillion: 0.30,
    outputPerMillion: 2.50,
  },
  'claude-haiku-4-5-20251001': {
    inputPerMillion: 1.00,
    outputPerMillion: 5.00,
    cacheReadPerMillion: 0.10,
    cacheWritePerMillion: 1.25,
  },
  'claude-sonnet-4-6': {
    inputPerMillion: 3.00,
    outputPerMillion: 15.00,
    cacheReadPerMillion: 0.30,
    cacheWritePerMillion: 3.75,
  },
  'voyage-4': {
    inputPerMillion: 0.06,
    outputPerMillion: 0,
  },
};

export function estimateModelCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
): number {
  const pricing = modelPricing[model];
  if (!pricing) return 0;

  const billableInputTokens = Math.max(0, inputTokens - cacheReadTokens - cacheWriteTokens);
  const inputCost = billableInputTokens * pricing.inputPerMillion / 1_000_000;
  const outputCost = outputTokens * pricing.outputPerMillion / 1_000_000;
  const cacheCost = cacheReadTokens * (pricing.cacheReadPerMillion ?? pricing.inputPerMillion) / 1_000_000;
  const cacheWriteCost = cacheWriteTokens * (pricing.cacheWritePerMillion ?? pricing.inputPerMillion) / 1_000_000;

  return inputCost + outputCost + cacheCost + cacheWriteCost;
}
