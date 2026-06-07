import { describe, expect, it } from 'vitest';
import { assertWithinRequestBudget } from '@/agents/runtime/budget';
import { estimateUsageCost } from '@/agents/runtime/cost';
import { taskPolicies } from '@/agents/router/policies';

describe('AI runtime governance', () => {
  it('rejects prompts above the task input ceiling', () => {
    const policy = taskPolicies.meal_suggest;
    expect(() => assertWithinRequestBudget(policy, 'x'.repeat(policy.maxInputChars + 1)))
      .toThrow(/exceeds/);
  });

  it('allows prompts within the task input ceiling', () => {
    expect(() => assertWithinRequestBudget(taskPolicies.meal_suggest, 'normal prompt'))
      .not.toThrow();
  });

  it('estimates cost from authoritative provider token usage', () => {
    const cost = estimateUsageCost('claude-haiku-4-5-20251001', {
      inputTokens: 1_000,
      outputTokens: 500,
      cacheReadTokens: 100,
    });
    expect(cost).toBeGreaterThan(0);
    expect(Number.isFinite(cost)).toBe(true);
  });

  it('charges Anthropic cache writes at the cache-write rate', () => {
    const standard = estimateUsageCost('claude-haiku-4-5-20251001', {
      inputTokens: 1_000,
      outputTokens: 0,
    });
    const cacheWrite = estimateUsageCost('claude-haiku-4-5-20251001', {
      inputTokens: 1_000,
      outputTokens: 0,
      cacheWriteTokens: 1_000,
    });

    expect(cacheWrite).toBeGreaterThan(standard);
    expect(cacheWrite).toBeCloseTo(0.00125, 8);
  });

  it('attributes Voyage embedding tasks to Voyage', () => {
    expect(taskPolicies.embed.provider).toBe('voyage');
    expect(taskPolicies.memory_embed.provider).toBe('voyage');
  });

  it('defines governance limits and a prompt version for every task', () => {
    for (const policy of Object.values(taskPolicies)) {
      expect(policy.timeoutMs).toBeGreaterThan(0);
      expect(policy.maxInputChars).toBeGreaterThan(0);
      expect(policy.maxCostUsd).toBeGreaterThan(0);
      expect(policy.promptVersion.length).toBeGreaterThan(0);
    }
  });
});
