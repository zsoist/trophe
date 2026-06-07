import { estimateModelCostUsd } from '@/agents/router/pricing';
import type { AiUsage } from './types';

export function estimateUsageCost(model: string, usage: AiUsage): number {
  return estimateModelCostUsd(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens ?? 0,
  );
}
