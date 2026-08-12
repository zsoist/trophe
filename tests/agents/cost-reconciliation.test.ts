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

  it('ignores non-completed generations', () => {
    expect(reconcileAiCosts([{ ...run, status: 'failed', recordedCostUsd: null }]).issues).toEqual([]);
  });

  it('reconciles transcription from provider token usage', () => {
    const result = reconcileAiCosts([{
      ...run,
      model: 'gpt-4o-mini-transcribe',
      tokensIn: 100,
      tokensOut: 25,
      recordedCostUsd: 100 * 1.25 / 1_000_000 + 25 * 5 / 1_000_000,
    }]);

    expect(result.issues).toEqual([]);
    expect(result.expectedTotalUsd).toBe(0.00025);
    expect(result.recordedTotalUsd).toBe(0.00025);
  });
});
