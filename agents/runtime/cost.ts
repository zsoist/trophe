import { estimateModelCostUsd } from '@/agents/router/pricing';
import type { AiUsage } from './types';

export function estimateUsageCost(model: string, usage: AiUsage): number {
  if (
    typeof usage.actualCostUsd === 'number'
    && Number.isFinite(usage.actualCostUsd)
    && usage.actualCostUsd >= 0
  ) {
    return usage.actualCostUsd;
  }
  return estimateModelCostUsd(
    model,
    usage.inputTokens,
    usage.outputTokens,
    usage.cacheReadTokens ?? 0,
    usage.cacheWriteTokens ?? 0,
  );
}
