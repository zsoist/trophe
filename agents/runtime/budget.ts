import type { RoutingPolicy } from '@/agents/router/policies';

export function assertWithinRequestBudget(policy: RoutingPolicy, prompt: string): void {
  if (prompt.length > policy.maxInputChars) {
    throw new Error(`AI input exceeds ${policy.maxInputChars} character limit`);
  }
  if (policy.maxCostUsd <= 0) {
    throw new Error('AI task is disabled by its cost policy');
  }
}
