import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Append an immutable audit-log event. Best-effort and non-blocking: a logging
 * failure must never break the operation being audited. The `audit_log` table
 * has an append-only trigger (migration 0008) — these rows cannot be edited.
 *
 * Closes the DPA Annex II "audit-log coverage" claim for operational events
 * (client assignment, role change, coach notes) beyond just privacy requests.
 */
export async function recordAuditEvent(event: {
  actorId: string;
  actorRole: string;
  action: string;
  tableName: string;
  recordId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    const service = createSupabaseServiceClient();
    await service.from('audit_log').insert({
      actor_id: event.actorId,
      actor_role: event.actorRole,
      action: event.action,
      table_name: event.tableName,
      record_id: event.recordId ?? null,
      old_value: event.oldValue ?? null,
      new_value: event.newValue ?? null,
      ip_address: event.ip ?? null,
      user_agent: event.userAgent ?? null,
    });
  } catch (err) {
    console.error(`[audit] failed to record '${event.action}' (non-blocking):`, err);
  }
}
