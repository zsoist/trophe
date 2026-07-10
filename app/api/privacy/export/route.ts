import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';

/**
 * GDPR Art. 20 — data portability. Self-service machine-readable export of the
 * authenticated user's own data. Synchronous JSON download (sufficient for the
 * beta scale). Fulfils the Trust-page promise + DPA §5(e). Read-only.
 *
 * GET /api/privacy/export → application/json attachment of all the user's rows.
 */

// Tables keyed by the user's own id, with the column that holds it.
const USER_TABLES: Array<{ table: string; column: string }> = [
  { table: 'profiles', column: 'id' },
  { table: 'client_profiles', column: 'user_id' },
  { table: 'food_log', column: 'user_id' },
  { table: 'measurements', column: 'user_id' },
  { table: 'water_log', column: 'user_id' },
  { table: 'workout_sessions', column: 'user_id' },
  { table: 'form_analyses', column: 'user_id' },
  { table: 'client_habits', column: 'client_id' },       // subject ref is client_id, not user_id
  { table: 'habit_checkins', column: 'user_id' },
  { table: 'daily_checkins', column: 'user_id' },
  { table: 'questionnaire_responses', column: 'client_id' }, // subject ref is client_id, not user_id
  { table: 'custom_foods', column: 'created_by' },
  { table: 'consents', column: 'user_id' },
  { table: 'data_requests', column: 'user_id' },
];

export async function GET(request: NextRequest) {
  const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;

  const userId = guard.session.user.id;
  const service = createSupabaseServiceClient();

  const data: Record<string, unknown> = {};
  for (const { table, column } of USER_TABLES) {
    const { data: rows, error } = await service.from(table).select('*').eq(column, userId);
    // Tolerate tables that don't exist in a given environment — never fail the
    // whole export over one optional table.
    data[table] = error ? { error: 'unavailable' } : (rows ?? []);
  }

  // Messages where the user is the client (their coach conversation).
  const { data: messages } = await service.from('messages').select('*').eq('client_id', userId);
  data['messages'] = messages ?? [];

  // workout_sets are session-keyed (no user_id column) — export the sets that
  // belong to the user's own sessions via the session ids fetched above.
  const ownSessions = data['workout_sessions'];
  const sessionIds = Array.isArray(ownSessions)
    ? (ownSessions as Array<{ id: string }>).map((s) => s.id).filter(Boolean)
    : [];
  if (sessionIds.length > 0) {
    const { data: sets, error: setsError } = await service
      .from('workout_sets')
      .select('*')
      .in('session_id', sessionIds);
    data['workout_sets'] = setsError ? { error: 'unavailable' } : (sets ?? []);
  } else {
    data['workout_sets'] = [];
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await service.from('audit_log').insert({
    actor_id: userId,
    actor_role: guard.session.role,
    action: 'privacy_export_downloaded',
    table_name: 'multiple',
    record_id: userId,
    new_value: { tables: Object.keys(data) },
    ip_address: ip,
    user_agent: request.headers.get('user-agent'),
  }).then(() => {}, () => {}); // best-effort, never blocks the export

  const payload = {
    exportedAt: new Date().toISOString(),
    subject: { userId, email: guard.session.user.email ?? null },
    format: 'trophe-data-export-v1',
    note: 'GDPR Art. 20 export of your personal data held by Trophē.',
    data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="trophe-export-${userId}.json"`,
      'cache-control': 'no-store',
    },
  });
}
