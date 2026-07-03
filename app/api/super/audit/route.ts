/**
 * GET /api/super/audit — audit_log viewer + GDPR data_requests queue.
 * The audit table has existed since W5 with RLS super_admin-only; this is its
 * first read surface. super_admin only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/auth/require-role';
import { db } from '@/db/client';
import { sql, type SQL } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const p = request.nextUrl.searchParams;
  const action = p.get('action') || null;
  const table = p.get('table') || null;
  const limit = Math.min(Math.max(parseInt(p.get('limit') ?? '100', 10) || 100, 1), 500);

  const conds: SQL[] = [sql`true`];
  if (action) conds.push(sql`action = ${action}`);
  if (table) conds.push(sql`table_name = ${table}`);
  const where = sql.join(conds, sql` AND `);

  const [events, actions, dataRequests, corrections] = await Promise.all([
    db.execute<{
      id: number; actor: string | null; actor_role: string | null; action: string;
      table_name: string | null; record_id: string | null; ip: string | null; created_at: string;
    }>(sql`
      SELECT a.id, p.full_name AS actor, a.actor_role::text, a.action,
             a.table_name, a.record_id::text, a.ip_address AS ip, a.created_at::text
      FROM audit_log a LEFT JOIN profiles p ON p.id = a.actor_id
      WHERE ${where}
      ORDER BY a.created_at DESC LIMIT ${limit}`),
    db.execute<{ action: string; n: number }>(sql`
      SELECT action, count(*)::int AS n FROM audit_log GROUP BY 1 ORDER BY n DESC LIMIT 20`),
    db.execute<{
      id: string; user_name: string | null; request_type: string; status: string;
      requested_at: string; due_at: string | null; completed_at: string | null;
    }>(sql`
      SELECT d.id::text, p.full_name AS user_name, d.request_type, d.status,
             d.requested_at::text, d.due_at::text, d.completed_at::text
      FROM data_requests d LEFT JOIN profiles p ON p.id = d.user_id
      ORDER BY d.requested_at DESC LIMIT 50`),
    db.execute<{ n: number; last_at: string | null }>(sql`
      SELECT count(*)::int AS n, max(created_at)::text AS last_at FROM food_parse_corrections`),
  ]);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    events: events.rows,
    actionFacets: actions.rows,
    dataRequests: dataRequests.rows,
    corrections: corrections.rows[0] ?? { n: 0, last_at: null },
  });
}
