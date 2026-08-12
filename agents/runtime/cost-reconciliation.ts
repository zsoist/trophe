import { estimateModelCostUsd, modelPricing } from '@/agents/router/pricing';

export interface ReconciliationRun {
  id: string;
  model: string;
  status: string;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  recordedCostUsd: number | null;
}

export interface ReconciliationIssue {
  id: string;
  model: string;
  kind: 'unknown_model' | 'missing_cost' | 'cost_drift';
  recordedCostUsd: number | null;
  expectedCostUsd: number | null;
  relativeDrift: number | null;
}

export function reconcileAiCosts(
  runs: ReconciliationRun[],
  maxRelativeDrift = 0.05,
): { issues: ReconciliationIssue[]; expectedTotalUsd: number; recordedTotalUsd: number } {
  const issues: ReconciliationIssue[] = [];
  let expectedTotalUsd = 0;
  let recordedTotalUsd = 0;

  for (const run of runs) {
    if (run.status !== 'completed') continue;
    const pricing = modelPricing[run.model];
    if (!pricing) {
      issues.push({
        id: run.id, model: run.model, kind: 'unknown_model',
        recordedCostUsd: run.recordedCostUsd, expectedCostUsd: null, relativeDrift: null,
      });
      continue;
    }

    if (pricing.billingUnit === 'audio_minute') {
      if (run.recordedCostUsd == null) {
        issues.push({
          id: run.id, model: run.model, kind: 'missing_cost',
          recordedCostUsd: null, expectedCostUsd: null, relativeDrift: null,
        });
        continue;
      }
      recordedTotalUsd += run.recordedCostUsd;
      expectedTotalUsd += run.recordedCostUsd;
      continue;
    }

    const expected = estimateModelCostUsd(
      run.model, run.tokensIn, run.tokensOut, run.cacheReadTokens, run.cacheWriteTokens,
    );
    expectedTotalUsd += expected;

    if (run.recordedCostUsd == null) {
      issues.push({
        id: run.id, model: run.model, kind: 'missing_cost',
        recordedCostUsd: null, expectedCostUsd: expected, relativeDrift: null,
      });
      continue;
    }

    recordedTotalUsd += run.recordedCostUsd;
    const denominator = Math.max(expected, 0.000000001);
    const relativeDrift = Math.abs(run.recordedCostUsd - expected) / denominator;
    if (relativeDrift > maxRelativeDrift) {
      issues.push({
        id: run.id, model: run.model, kind: 'cost_drift',
        recordedCostUsd: run.recordedCostUsd, expectedCostUsd: expected, relativeDrift,
      });
    }
  }

  return { issues, expectedTotalUsd, recordedTotalUsd };
}
