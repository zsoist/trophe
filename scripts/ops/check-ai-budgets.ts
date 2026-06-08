import { resolveDbConfig, withPool, writeArtifact } from '../db/_shared';

const monthlyBudgetUsd = Number(process.env.AI_MONTHLY_BUDGET_USD ?? '50');
const maxFailureRate = Number(process.env.AI_MAX_FAILURE_RATE ?? '0.05');
const maxPendingMinutes = Number(process.env.AI_MAX_PENDING_MINUTES ?? '15');
/** Minimum call volume before enforcing failure rate — avoids false alarms on tiny samples (e.g. CI with 1-3 test calls). */
const minCallsForFailureRate = Number(process.env.AI_MIN_CALLS_FAILURE_RATE ?? '10');

withPool(resolveDbConfig(), async (pool) => {
  const result = await pool.query<{
    total_calls: string;
    failed_calls: string;
    stale_pending_calls: string;
    missing_cost_calls: string;
    total_cost_usd: string;
  }>(`
    SELECT
      COUNT(*)::text AS total_calls,
      COUNT(*) FILTER (WHERE status = 'failed')::text AS failed_calls,
      COUNT(*) FILTER (
        WHERE status = 'pending' AND created_at < NOW() - ($1::text || ' minutes')::interval
      )::text AS stale_pending_calls,
      COUNT(*) FILTER (
        WHERE status = 'completed'
          AND actual_cost_usd IS NULL
          AND estimated_cost_usd IS NULL
          AND cost_usd IS NULL
      )::text AS missing_cost_calls,
      COALESCE(SUM(COALESCE(actual_cost_usd, estimated_cost_usd, cost_usd, 0)), 0)::text AS total_cost_usd
    FROM agent_runs
    WHERE created_at >= date_trunc('month', NOW())
  `, [maxPendingMinutes]);

  const row = result.rows[0];
  const totalCalls = Number(row.total_calls);
  const failedCalls = Number(row.failed_calls);
  const stalePendingCalls = Number(row.stale_pending_calls);
  const missingCostCalls = Number(row.missing_cost_calls);
  const totalCostUsd = Number(row.total_cost_usd);
  const failureRate = totalCalls ? failedCalls / totalCalls : 0;
  const failures: string[] = [];

  if (totalCostUsd > monthlyBudgetUsd) failures.push(`monthly spend $${totalCostUsd.toFixed(2)} exceeds $${monthlyBudgetUsd.toFixed(2)}`);
  if (totalCalls >= minCallsForFailureRate && failureRate > maxFailureRate) {
    failures.push(`failure rate ${(failureRate * 100).toFixed(1)}% exceeds ${(maxFailureRate * 100).toFixed(1)}% (${failedCalls}/${totalCalls} calls)`);
  }
  if (stalePendingCalls > 0) failures.push(`${stalePendingCalls} stale pending generation(s)`);
  if (missingCostCalls > 0) failures.push(`${missingCostCalls} completed generation(s) missing cost attribution`);

  const report = { totalCalls, failedCalls, stalePendingCalls, missingCostCalls, totalCostUsd, failureRate, failures };
  writeArtifact('ai-budget-check.json', JSON.stringify(report, null, 2));
  if (failures.length) throw new Error(failures.join('; '));
  const rateNote = totalCalls < minCallsForFailureRate
    ? `${(failureRate * 100).toFixed(1)}% failures (below ${minCallsForFailureRate}-call threshold, not enforced)`
    : `${(failureRate * 100).toFixed(1)}% failures`;
  console.log(`AI budget gate passed: ${totalCalls} calls, $${totalCostUsd.toFixed(4)}, ${rateNote}.`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
