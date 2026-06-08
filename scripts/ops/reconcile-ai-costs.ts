import { reconcileAiCosts } from '../../agents/runtime/cost-reconciliation';
import { resolveDbConfig, withPool, writeArtifact } from '../db/_shared';

const days = Number(process.env.AI_RECONCILIATION_DAYS ?? '30');
const maxRelativeDrift = Number(process.env.AI_MAX_COST_DRIFT ?? '0.05');

withPool(resolveDbConfig(), async (pool) => {
  const result = await pool.query<{
    id: string;
    model: string;
    status: string;
    tokens_in: number;
    tokens_out: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    recorded_cost_usd: number | null;
  }>(`
    SELECT id::text, model, status, tokens_in, tokens_out, cache_read_tokens, cache_write_tokens,
      COALESCE(actual_cost_usd, estimated_cost_usd, cost_usd)::float8 AS recorded_cost_usd
    FROM agent_runs
    WHERE created_at >= NOW() - ($1::text || ' days')::interval
  `, [days]);

  const report = reconcileAiCosts(result.rows.map((row) => ({
    id: row.id,
    model: row.model,
    status: row.status,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    cacheReadTokens: row.cache_read_tokens,
    cacheWriteTokens: row.cache_write_tokens,
    recordedCostUsd: row.recorded_cost_usd,
  })), maxRelativeDrift);

  const artifact = { days, maxRelativeDrift, checkedRuns: result.rows.length, ...report };
  writeArtifact('ai-cost-reconciliation.json', JSON.stringify(artifact, null, 2));
  if (report.issues.length) {
    const summary = Object.entries(Object.groupBy(report.issues, (issue) => issue.kind))
      .map(([kind, issues]) => `${issues?.length ?? 0} ${kind}`)
      .join(', ');
    throw new Error(`AI cost reconciliation failed: ${summary}`);
  }
  console.log(`AI cost reconciliation passed: ${result.rows.length} runs, $${report.recordedTotalUsd.toFixed(6)} recorded.`);
}).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
