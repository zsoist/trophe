import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';
import {
  EXPORT_PAGE_SIZE,
  SUBJECT_EXPORT_TABLES,
} from '@/lib/privacy/export-manifest';

/**
 * GDPR Art. 20 — data portability. Self-service machine-readable export of the
 * authenticated client's own subject data. Synchronous JSON download
 * (sufficient for the beta scale). Staff/coach requests require the manual
 * redaction workflow because coach-authored rows also contain client PHI.
 * Fulfils the Trust-page promise + DPA §5(e). Read-only.
 *
 * GET /api/privacy/export → application/json attachment of all the user's rows.
 */

type ServiceClient = ReturnType<typeof createSupabaseServiceClient>;

async function mapPool<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
}

async function fetchAllSubjectRows(
  service: ServiceClient,
  table: string,
  column: string,
  userId: string,
): Promise<{ rows: unknown[]; error: boolean }> {
  const allRows: unknown[] = [];
  for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await service
      .from(table)
      .select('*')
      .eq(column, userId)
      .range(from, from + EXPORT_PAGE_SIZE - 1);
    if (error) return { rows: [], error: true };
    allRows.push(...(data ?? []));
    if (!data || data.length < EXPORT_PAGE_SIZE) break;
  }
  return { rows: allRows, error: false };
}

async function fetchWorkoutSets(
  service: ServiceClient,
  sessionIds: string[],
): Promise<{ rows: unknown[]; error: boolean }> {
  const allRows: unknown[] = [];
  for (let chunkStart = 0; chunkStart < sessionIds.length; chunkStart += 100) {
    const chunk = sessionIds.slice(chunkStart, chunkStart + 100);
    for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
      const { data, error } = await service
        .from('workout_sets')
        .select('*')
        .in('session_id', chunk)
        .range(from, from + EXPORT_PAGE_SIZE - 1);
      if (error) return { rows: [], error: true };
      allRows.push(...(data ?? []));
      if (!data || data.length < EXPORT_PAGE_SIZE) break;
    }
  }
  return { rows: allRows, error: false };
}

export async function GET(request: NextRequest) {
  const guard = await requireRole(['client'], { request });
  if (guard instanceof NextResponse) return guard;

  const userId = guard.session.user.id;
  const service = createSupabaseServiceClient();

  const data: Record<string, unknown> = {};
  const unavailableTables: string[] = [];
  await mapPool(SUBJECT_EXPORT_TABLES, 6, async ({ table, column }) => {
    const result = await fetchAllSubjectRows(service, table, column, userId);
    if (result.error) {
      unavailableTables.push(table);
      data[table] = { error: 'unavailable' };
    } else {
      data[table] = result.rows;
    }
  });

  // workout_sets are session-keyed (no user_id column) — export the sets that
  // belong to the user's own sessions via the session ids fetched above.
  const ownSessions = data['workout_sessions'];
  const sessionIds = Array.isArray(ownSessions)
    ? (ownSessions as Array<{ id: string }>).map((s) => s.id).filter(Boolean)
    : [];
  if (sessionIds.length > 0) {
    const sets = await fetchWorkoutSets(service, sessionIds);
    if (sets.error) {
      unavailableTables.push('workout_sets');
      data['workout_sets'] = { error: 'unavailable' };
    } else {
      data['workout_sets'] = sets.rows;
    }
  } else {
    data['workout_sets'] = [];
  }

  // Include the user's chat uploads as short-lived download links. Paths are
  // scoped to {coach_id}/{client_id}, with coach ids taken only from this
  // subject's exported message rows.
  const messages = data['messages'];
  const coachIds = new Set(
    Array.isArray(messages)
      ? (messages as Array<{ coach_id?: string }>).map((row) => row.coach_id).filter(Boolean)
      : [],
  );
  const attachments: Array<{
    path: string;
    name: string;
    createdAt: string | null;
    updatedAt: string | null;
    metadata: unknown;
    downloadUrl: string | null;
  }> = [];
  const bucket = service.storage.from('chat-attachments');
  let attachmentUnavailable = false;
  for (const coachId of coachIds) {
    const prefix = `${coachId}/${userId}`;
    for (let offset = 0; ; offset += EXPORT_PAGE_SIZE) {
      const { data: objects, error: listError } = await bucket.list(prefix, {
        limit: EXPORT_PAGE_SIZE,
        offset,
      });
      if (listError) {
        attachmentUnavailable = true;
        break;
      }
      for (const object of objects ?? []) {
        const path = `${prefix}/${object.name}`;
        const { data: signed, error: signError } = await bucket.createSignedUrl(path, 3_600);
        if (signError) attachmentUnavailable = true;
        attachments.push({
          path,
          name: object.name,
          createdAt: object.created_at ?? null,
          updatedAt: object.updated_at ?? null,
          metadata: object.metadata ?? null,
          downloadUrl: signed?.signedUrl ?? null,
        });
      }
      if (!objects || objects.length < EXPORT_PAGE_SIZE) break;
    }
  }
  data['chat_attachments'] = attachments;
  if (attachmentUnavailable) unavailableTables.push('chat_attachments');

  unavailableTables.sort();
  const complete = unavailableTables.length === 0;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  await service.from('audit_log').insert({
    actor_id: userId,
    actor_role: guard.session.role,
    action: 'privacy_export_downloaded',
    table_name: 'multiple',
    record_id: userId,
    new_value: { tables: Object.keys(data), complete, unavailableTables },
    ip_address: ip,
    user_agent: request.headers.get('user-agent'),
  }).then(() => {}, () => {}); // best-effort, never blocks the export

  const payload = {
    exportedAt: new Date().toISOString(),
    subject: { userId, email: guard.session.user.email ?? null },
    format: 'trophe-data-export-v2',
    complete,
    unavailableTables,
    attachmentLinksExpireInSeconds: 3_600,
    note: complete
      ? 'GDPR Art. 20 export of your personal data held by Trophē.'
      : 'Partial GDPR Art. 20 export. The unavailableTables list identifies data that could not be included; please retry or contact support.',
    data,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: complete ? 200 : 206,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="trophe-export-${userId}.json"`,
      'cache-control': 'no-store',
    },
  });
}
