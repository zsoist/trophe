import { describe, expect, it } from 'vitest';
import { taskPolicies } from '@/agents/router/policies';
import { reconcileAiCosts } from '@/agents/runtime/cost-reconciliation';
import { estimateModelCostUsd } from '@/agents/router/pricing';

const run = {
  id: 'run-1',
  model: taskPolicies.food_parse.model,
  status: 'completed',
  tokensIn: 1_000_000,
  tokensOut: 1_000_000,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  recordedCostUsd: estimateModelCostUsd(taskPolicies.food_parse.model, 1_000_000, 1_000_000),
};

describe('AI cost reconciliation', () => {
  it('accepts correctly attributed known-model costs', () => {
    expect(reconcileAiCosts([run]).issues).toEqual([]);
  });

  it('rejects models missing from the pricing registry', () => {
    expect(reconcileAiCosts([{ ...run, model: 'future-unpriced-model' }]).issues[0].kind)
      .toBe('unknown_model');
  });

  it('rejects missing and materially drifting recorded costs', () => {
    const issues = reconcileAiCosts([
      { ...run, id: 'missing', recordedCostUsd: null },
      { ...run, id: 'drift', recordedCostUsd: 1 },
    ]).issues;
    expect(issues.map((issue) => issue.kind)).toEqual(['missing_cost', 'cost_drift']);
  });

  it('ignores non-completed generations with no authoritative spend evidence', () => {
    expect(reconcileAiCosts([{
      ...run,
      status: 'failed',
      tokensIn: 0,
      tokensOut: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      recordedCostUsd: null,
    }]).issues).toEqual([]);
  });

  it('includes failed attempts that carry authoritative usage and cost', () => {
    const failedPaidRun = { ...run, status: 'failed' };
    const result = reconcileAiCosts([failedPaidRun]);
    expect(result.issues).toEqual([]);
    expect(result.expectedTotalUsd).toBeGreaterThan(0);
    expect(result.recordedTotalUsd).toBe(failedPaidRun.recordedCostUsd);
  });

  it('reconciles Luna cache reads and writes with provider billing rates', () => {
    const cachedRun = {
      ...run,
      tokensIn: 1_000,
      tokensOut: 0,
      cacheReadTokens: 800,
      cacheWriteTokens: 100,
      recordedCostUsd: estimateModelCostUsd('gpt-5.6-luna', 1_000, 0, 800, 100),
    };
    expect(reconcileAiCosts([cachedRun]).issues).toEqual([]);
  });
});
