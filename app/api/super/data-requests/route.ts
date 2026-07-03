import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireSuperAdmin } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { eraseUser } from '@/lib/privacy/erasure';

/**
 * POST /api/super/data-requests — GDPR request FULFILMENT (WP5).
 * Operator actions on data_requests rows, from the command center Audit tab:
 *   - start:            pending → in_progress
 *   - erasure_dry_run:  report per-table row counts, ZERO writes
 *   - execute_erasure:  run lib/privacy/erasure (client accounts only),
 *                       then mark the request completed
 *   - complete:         mark completed (export/correction/restriction handled
 *                       out-of-band; export is self-service GET /api/privacy/export)
 *   - reject:           mark rejected with a reason
 * Every action is audit-logged. super_admin only.
 */

const bodySchema = z.object({
  requestId: z.string().uuid(),
  action: z.enum(['start', 'erasure_dry_run', 'execute_erasure', 'complete', 'reject']),
  reason: z.string().max(2_000).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid fulfilment action' }, { status: 400 });
  const { requestId, action, reason } = parsed.data;

  const service = createSupabaseServiceClient();
  const { data: req } = await service
    .from('data_requests')
    .select('id, user_id, request_type, status')
    .eq('id', requestId)
    .maybeSingle();
  if (!req) return NextResponse.json({ error: 'Request not found' }, { status: 404 });

  const audit = (auditAction: string, detail: Record<string, unknown>) =>
    service.from('audit_log').insert({
      actor_id: guard.session.user.id,
      actor_role: guard.session.role,
      action: auditAction,
      table_name: 'data_requests',
      record_id: req.id,
      new_value: detail,
      ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: request.headers.get('user-agent'),
    }).then(() => {}, () => {});

  if (action === 'start') {
    if (req.status !== 'pending') return NextResponse.json({ error: `Cannot start from '${req.status}'` }, { status: 409 });
    await service.from('data_requests')
      .update({ status: 'in_progress', processed_by: guard.session.user.id })
      .eq('id', req.id);
    await audit('privacy_request_started', { request_type: req.request_type });
    return NextResponse.json({ ok: true, status: 'in_progress' });
  }

  if (action === 'erasure_dry_run') {
    if (req.request_type !== 'deletion') return NextResponse.json({ error: 'Dry-run only applies to deletion requests' }, { status: 409 });
    const result = await eraseUser(req.user_id, { dryRun: true });
    await audit('privacy_erasure_dry_run', { counts: result.counts, errors: result.errors, role: result.role });
    return NextResponse.json({ ok: true, result });
  }

  if (action === 'execute_erasure') {
    if (req.request_type !== 'deletion') return NextResponse.json({ error: 'Erasure only applies to deletion requests' }, { status: 409 });
    if (!['pending', 'in_progress'].includes(req.status)) {
      return NextResponse.json({ error: `Cannot erase from '${req.status}'` }, { status: 409 });
    }
    const result = await eraseUser(req.user_id, { dryRun: false });
    if (result.errors.length > 0) {
      await audit('privacy_erasure_failed', { counts: result.counts, errors: result.errors, role: result.role });
      return NextResponse.json({ ok: false, result }, { status: 422 });
    }
    // NB: data_requests.user_id cascades away with the profile — the request
    // row may already be gone. Update is best-effort; the audit row (SET NULL
    // survivor) is the durable evidence.
    await service.from('data_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString(), processed_by: guard.session.user.id })
      .eq('id', req.id);
    await audit('privacy_erasure_executed', {
      counts: result.counts, authUserDeleted: result.authUserDeleted, erased_user: result.userId,
    });
    return NextResponse.json({ ok: true, result });
  }

  if (action === 'complete') {
    await service.from('data_requests')
      .update({ status: 'completed', completed_at: new Date().toISOString(), processed_by: guard.session.user.id, notes: reason ?? undefined })
      .eq('id', req.id);
    await audit('privacy_request_completed', { request_type: req.request_type, reason: reason ?? null });
    return NextResponse.json({ ok: true, status: 'completed' });
  }

  // reject
  if (!reason) return NextResponse.json({ error: 'Rejection requires a reason' }, { status: 400 });
  await service.from('data_requests')
    .update({ status: 'rejected', processed_by: guard.session.user.id, notes: reason })
    .eq('id', req.id);
  await audit('privacy_request_rejected', { request_type: req.request_type, reason });
  return NextResponse.json({ ok: true, status: 'rejected' });
}
