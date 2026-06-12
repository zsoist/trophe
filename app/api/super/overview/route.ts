/**
 * GET /api/super/overview — Super-admin command center data.
 * One round trip aggregating the whole platform: people, activity, AI spend,
 * data health, ops signals. super_admin only.
 */
import { NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-role';
import { db } from '@/db/client';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const [people, activity, aiCosts, aiByTask, aiErrors, dataHealth, recentSignups, recentFailures] =
    await Promise.all([
      db.execute<{ role: string; n: number }>(sql`
        SELECT role, count(*)::int AS n FROM profiles GROUP BY role ORDER BY n DESC`),
      db.execute<{
        logs_today: number; logs_7d: number; active_clients_7d: number;
        messages_7d: number; checkins_7d: number; appts_upcoming: number;
        workouts_7d: number; prs_7d: number;
      }>(sql`
        SELECT
          (SELECT count(*)::int FROM food_log WHERE logged_date = CURRENT_DATE) AS logs_today,
          (SELECT count(*)::int FROM food_log WHERE logged_date >= CURRENT_DATE - 7) AS logs_7d,
          (SELECT count(DISTINCT user_id)::int FROM food_log WHERE logged_date >= CURRENT_DATE - 7) AS active_clients_7d,
          (SELECT count(*)::int FROM messages WHERE created_at >= now() - interval '7 days') AS messages_7d,
          (SELECT count(*)::int FROM habit_checkins WHERE checked_date >= CURRENT_DATE - 7) AS checkins_7d,
          (SELECT count(*)::int FROM appointments WHERE status = 'booked' AND starts_at >= now()) AS appts_upcoming,
          (SELECT count(*)::int FROM workout_sessions WHERE session_date >= CURRENT_DATE - 7) AS workouts_7d,
          (SELECT count(*)::int FROM workout_sets ws JOIN workout_sessions s ON s.id = ws.session_id
           WHERE ws.is_pr = true AND s.session_date >= CURRENT_DATE - 7) AS prs_7d`),
      db.execute<{ window: string; cost: number; tokens_in: number; tokens_out: number; runs: number }>(sql`
        SELECT w.win AS window,
               coalesce(sum(r.cost_usd), 0)::float AS cost,
               coalesce(sum(r.tokens_in), 0)::bigint::int AS tokens_in,
               coalesce(sum(r.tokens_out), 0)::bigint::int AS tokens_out,
               count(r.id)::int AS runs
        FROM (VALUES ('today', CURRENT_DATE::timestamptz),
                     ('7d', now() - interval '7 days'),
                     ('30d', now() - interval '30 days')) AS w(win, since)
        LEFT JOIN agent_runs r ON r.created_at >= w.since
        GROUP BY w.win`),
      db.execute<{ task: string; cost: number; runs: number }>(sql`
        SELECT task_name AS task, coalesce(sum(cost_usd), 0)::float AS cost, count(*)::int AS runs
        FROM agent_runs
        WHERE created_at >= now() - interval '7 days'
        GROUP BY task_name ORDER BY cost DESC LIMIT 10`),
      db.execute<{ errors_24h: number; runs_24h: number }>(sql`
        SELECT
          count(*) FILTER (WHERE status != 'completed')::int AS errors_24h,
          count(*)::int AS runs_24h
        FROM agent_runs WHERE created_at >= now() - interval '24 hours'`),
      db.execute<{ source: string; n: number; embedded: number }>(sql`
        SELECT source::text, count(*)::int AS n,
               count(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
        FROM foods GROUP BY source ORDER BY n DESC`),
      db.execute<{ full_name: string; role: string; created_at: string }>(sql`
        SELECT full_name, role, created_at::text FROM profiles
        ORDER BY created_at DESC LIMIT 8`),
      db.execute<{ task: string; status: string; error: string | null; created_at: string }>(sql`
        SELECT task_name AS task, status, left(coalesce(error_message, ''), 160) AS error, created_at::text
        FROM agent_runs WHERE status != 'completed'
        ORDER BY created_at DESC LIMIT 8`),
    ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    people: people.rows,
    activity: activity.rows[0] ?? {},
    aiCosts: aiCosts.rows,
    aiByTask: aiByTask.rows,
    aiErrors: aiErrors.rows[0] ?? {},
    foods: dataHealth.rows,
    recentSignups: recentSignups.rows,
    recentFailures: recentFailures.rows,
  });
}
