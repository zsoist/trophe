/**
 * GET /api/super/costs — AI spend analytics for the command center.
 * Filterable by window / provider / model / task / status; grouped breakdown,
 * daily series, cache economics, and the most expensive individual runs.
 * super_admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-role';
import { db } from '@/db/client';
import { sql, type SQL } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

const WINDOWS: Record<string, string> = {
  '24h': "now() - interval '24 hours'",
  '7d': "now() - interval '7 days'",
  '30d': "now() - interval '30 days'",
  '90d': "now() - interval '90 days'",
  all: "'epoch'::timestamptz",
};

const GROUP_COLS: Record<string, string> = {
  provider: 'provider',
  model: 'model',
  task: 'task_name',
  user: "coalesce(user_id::text, 'system')",
  status: 'status',
};

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const p = request.nextUrl.searchParams;
  const windowKey = WINDOWS[p.get('window') ?? ''] ? (p.get('window') as string) : '7d';
  const groupBy = GROUP_COLS[p.get('groupBy') ?? ''] ? (p.get('groupBy') as string) : 'model';
  const provider = p.get('provider') || null;
  const model = p.get('model') || null;
  const task = p.get('task') || null;
  const status = p.get('status') || null;

  // Composable WHERE — every filter is parameterized; the window/group column
  // names come from fixed allowlists above, never from user input.
  const conds: SQL[] = [sql.raw(`created_at >= ${WINDOWS[windowKey]}`)];
  if (provider) conds.push(sql`provider = ${provider}`);
  if (model) conds.push(sql`model = ${model}`);
  if (task) conds.push(sql`task_name = ${task}`);
  if (status) conds.push(sql`status = ${status}`);
  const where = sql.join(conds, sql` AND `);
  const groupCol = sql.raw(GROUP_COLS[groupBy]);

  const [totals, breakdown, daily, topRuns, facets] = await Promise.all([
    db.execute<{
      runs: number; cost: number; tokens_in: number; tokens_out: number;
      cache_read: number; cache_write: number; failed: number; fallbacks: number;
      p50: number | null; p95: number | null; p99: number | null;
    }>(sql`
      SELECT count(*)::int AS runs,
             coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, cost_usd)), 0)::float AS cost,
             coalesce(sum(tokens_in), 0)::bigint::float AS tokens_in,
             coalesce(sum(tokens_out), 0)::bigint::float AS tokens_out,
             coalesce(sum(cache_read_tokens), 0)::bigint::float AS cache_read,
             coalesce(sum(cache_write_tokens), 0)::bigint::float AS cache_write,
             count(*) FILTER (WHERE status NOT IN ('completed', 'pending'))::int AS failed,
             count(*) FILTER (WHERE fallback_from IS NOT NULL)::int AS fallbacks,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float AS p50,
             percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float AS p95,
             percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms)::float AS p99
      FROM agent_runs WHERE ${where}`),
    db.execute<{ key: string; runs: number; cost: number; tokens_in: number; tokens_out: number; avg_latency: number | null; failed: number }>(sql`
      SELECT coalesce(${groupCol}::text, '(none)') AS key,
             count(*)::int AS runs,
             coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, cost_usd)), 0)::float AS cost,
             coalesce(sum(tokens_in), 0)::bigint::float AS tokens_in,
             coalesce(sum(tokens_out), 0)::bigint::float AS tokens_out,
             round(avg(latency_ms))::float AS avg_latency,
             count(*) FILTER (WHERE status NOT IN ('completed', 'pending'))::int AS failed
      FROM agent_runs WHERE ${where}
      GROUP BY 1 ORDER BY cost DESC LIMIT 30`),
    db.execute<{ day: string; cost: number; runs: number }>(sql`
      SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
             coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, cost_usd)), 0)::float AS cost,
             count(*)::int AS runs
      FROM agent_runs WHERE ${where}
      GROUP BY 1 ORDER BY 1`),
    db.execute<{ id: string; task: string; model: string; cost: number; tokens_in: number; tokens_out: number; latency_ms: number | null; status: string; created_at: string }>(sql`
      SELECT id::text, task_name AS task, model,
             coalesce(actual_cost_usd, estimated_cost_usd, cost_usd, 0)::float AS cost,
             coalesce(tokens_in, 0) AS tokens_in, coalesce(tokens_out, 0) AS tokens_out,
             latency_ms, status, created_at::text
      FROM agent_runs WHERE ${where}
      ORDER BY coalesce(actual_cost_usd, estimated_cost_usd, cost_usd, 0) DESC LIMIT 10`),
    // Facet values for the filter selects (full table, cheap on indexed cols)
    db.execute<{ providers: string[]; models: string[]; tasks: string[] }>(sql`
      SELECT array(SELECT DISTINCT provider FROM agent_runs WHERE provider IS NOT NULL ORDER BY 1) AS providers,
             array(SELECT DISTINCT model FROM agent_runs WHERE model IS NOT NULL ORDER BY 1) AS models,
             array(SELECT DISTINCT task_name FROM agent_runs WHERE task_name IS NOT NULL ORDER BY 1) AS tasks`),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    window: windowKey,
    groupBy,
    totals: totals.rows[0] ?? {},
    breakdown: breakdown.rows,
    daily: daily.rows,
    topRuns: topRuns.rows,
    facets: facets.rows[0] ?? { providers: [], models: [], tasks: [] },
  });
}
