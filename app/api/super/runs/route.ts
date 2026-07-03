/**
 * GET /api/super/runs — paginated, filterable agent_runs feed for the command
 * center (status / task / model / window), with full error messages.
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
  all: "'epoch'::timestamptz",
};

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const p = request.nextUrl.searchParams;
  const windowKey = WINDOWS[p.get('window') ?? ''] ? (p.get('window') as string) : '24h';
  const status = p.get('status') || null; // 'failed' matches every non-completed, non-pending status
  const task = p.get('task') || null;
  const model = p.get('model') || null;
  const limit = Math.min(Math.max(parseInt(p.get('limit') ?? '50', 10) || 50, 1), 200);
  const offset = Math.max(parseInt(p.get('offset') ?? '0', 10) || 0, 0);

  const conds: SQL[] = [sql.raw(`created_at >= ${WINDOWS[windowKey]}`)];
  if (status === 'failed') conds.push(sql`status NOT IN ('completed', 'pending')`);
  else if (status) conds.push(sql`status = ${status}`);
  if (task) conds.push(sql`task_name = ${task}`);
  if (model) conds.push(sql`model = ${model}`);
  const where = sql.join(conds, sql` AND `);

  const [rows, total] = await Promise.all([
    db.execute<{
      id: string; task: string; provider: string | null; model: string;
      status: string; cost: number; tokens_in: number; tokens_out: number;
      cache_read: number; latency_ms: number | null; fallback_from: string | null;
      error: string | null; user_id: string | null; created_at: string;
    }>(sql`
      SELECT id::text, task_name AS task, provider, model, status,
             coalesce(actual_cost_usd, estimated_cost_usd, cost_usd, 0)::float AS cost,
             coalesce(tokens_in, 0) AS tokens_in, coalesce(tokens_out, 0) AS tokens_out,
             coalesce(cache_read_tokens, 0) AS cache_read,
             latency_ms, fallback_from, error_message AS error,
             user_id::text, created_at::text
      FROM agent_runs WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}`),
    db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM agent_runs WHERE ${where}`),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    rows: rows.rows,
    total: total.rows[0]?.n ?? 0,
    limit,
    offset,
  });
}
