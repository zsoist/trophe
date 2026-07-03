/**
 * GET /api/super/users — every account with sign-in recency, activity volume,
 * and attributable AI spend. Optional per-user drill-down (?userId=).
 * super_admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-role';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const userId = request.nextUrl.searchParams.get('userId');

  // ── Drill-down: one user's recent activity ────────────────────────────────
  if (userId) {
    const [recentLogs, recentRuns, spendByTask] = await Promise.all([
      db.execute<{ food_name: string; calories: number | null; source: string | null; logged_date: string; meal_type: string | null }>(sql`
        SELECT food_name, calories, source, logged_date::text, meal_type
        FROM food_log WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC LIMIT 15`),
      db.execute<{ task: string; model: string; cost: number; latency_ms: number | null; status: string; created_at: string }>(sql`
        SELECT task_name AS task, model,
               coalesce(actual_cost_usd, estimated_cost_usd, cost_usd, 0)::float AS cost,
               latency_ms, status, created_at::text
        FROM agent_runs WHERE user_id = ${userId}::uuid
        ORDER BY created_at DESC LIMIT 15`),
      db.execute<{ task: string; cost: number; runs: number }>(sql`
        SELECT task_name AS task,
               coalesce(sum(coalesce(actual_cost_usd, estimated_cost_usd, cost_usd)), 0)::float AS cost,
               count(*)::int AS runs
        FROM agent_runs WHERE user_id = ${userId}::uuid
        GROUP BY 1 ORDER BY cost DESC`),
    ]);
    return NextResponse.json({
      recentLogs: recentLogs.rows,
      recentRuns: recentRuns.rows,
      spendByTask: spendByTask.rows,
    });
  }

  // ── Roster: one row per account, joined across auth + activity + spend ────
  // auth.users is readable here because the ops pool connects as postgres —
  // this endpoint is the only sanctioned reader (guarded by requireSuperAdmin).
  const users = await db.execute<{
    id: string; email: string | null; full_name: string | null; role: string | null;
    language: string | null; created_at: string; last_sign_in_at: string | null;
    logs_total: number; logs_30d: number; last_log_at: string | null;
    ai_cost_30d: number; ai_runs_30d: number; messages_30d: number; workouts_30d: number;
  }>(sql`
    SELECT
      u.id::text,
      u.email,
      p.full_name,
      p.role::text,
      p.language,
      u.created_at::text,
      u.last_sign_in_at::text,
      coalesce(fl.logs_total, 0)::int AS logs_total,
      coalesce(fl.logs_30d, 0)::int AS logs_30d,
      fl.last_log_at::text,
      coalesce(ar.cost_30d, 0)::float AS ai_cost_30d,
      coalesce(ar.runs_30d, 0)::int AS ai_runs_30d,
      coalesce(m.messages_30d, 0)::int AS messages_30d,
      coalesce(w.workouts_30d, 0)::int AS workouts_30d
    FROM auth.users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN LATERAL (
      SELECT count(*) AS logs_total,
             count(*) FILTER (WHERE logged_date >= CURRENT_DATE - 30) AS logs_30d,
             max(created_at) AS last_log_at
      FROM food_log WHERE user_id = u.id
    ) fl ON true
    LEFT JOIN LATERAL (
      SELECT sum(coalesce(actual_cost_usd, estimated_cost_usd, cost_usd)) AS cost_30d,
             count(*) AS runs_30d
      FROM agent_runs WHERE user_id = u.id AND created_at >= now() - interval '30 days'
    ) ar ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS messages_30d FROM messages
      WHERE client_id = u.id AND created_at >= now() - interval '30 days'
    ) m ON true
    LEFT JOIN LATERAL (
      SELECT count(*) AS workouts_30d FROM workout_sessions
      WHERE user_id = u.id AND session_date >= CURRENT_DATE - 30
    ) w ON true
    ORDER BY u.last_sign_in_at DESC NULLS LAST`);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    users: users.rows,
  });
}
