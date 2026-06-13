import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';
import { recordAuditEvent } from '@/lib/audit';

/**
 * GDPR Art. 7(3) — consent withdrawal (and status read). The Trust page promises
 * "withdraw at any time"; this is the server-side implementation.
 *
 * GET  → the caller's current consents
 * POST { purpose? } → withdraw consent (default purpose 'nutrition_processing')
 */
export async function GET(request: NextRequest) {
  const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const service = createSupabaseServiceClient();
  const { data } = await service
    .from('consents')
    .select('purpose, version, status, granted_at, withdrawn_at')
    .eq('user_id', guard.session.user.id);
  return NextResponse.json({ consents: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const body = (await request.json().catch(() => ({}))) as { purpose?: string };
  const purpose = body.purpose?.trim() || 'nutrition_processing';
  const userId = guard.session.user.id;
  const service = createSupabaseServiceClient();

  const { error } = await service
    .from('consents')
    .update({ status: 'withdrawn', withdrawn_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('purpose', purpose)
    .eq('status', 'granted');
  if (error) return NextResponse.json({ error: 'Could not withdraw consent' }, { status: 500 });

  await recordAuditEvent({
    actorId: userId,
    actorRole: guard.session.role,
    action: 'consent_withdrawn',
    tableName: 'consents',
    newValue: { purpose },
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({
    ok: true,
    purpose,
    note: 'Consent withdrawn. To also delete your data, request erasure from privacy settings.',
  });
}
