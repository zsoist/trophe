import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';

const requestSchema = z.object({
  type: z.enum(['export', 'deletion', 'correction', 'restriction']),
  notes: z.string().max(2_000).optional(),
}).strict();

export async function GET(request: NextRequest) {
  const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const service = createSupabaseServiceClient();
  const { data, error } = await service
    .from('data_requests')
    .select('id, request_type, status, requested_at, due_at, completed_at, result_uri')
    .eq('user_id', guard.session.user.id)
    .order('requested_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Unable to load privacy requests' }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid privacy request' }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: membership } = await service
    .from('organization_members')
    .select('org_id')
    .eq('user_id', guard.session.user.id)
    .maybeSingle();
  const dueAt = new Date();
  dueAt.setDate(dueAt.getDate() + 30);
  const { data, error } = await service.from('data_requests').insert({
    user_id: guard.session.user.id,
    organization_id: membership?.org_id ?? null,
    request_type: parsed.data.type,
    notes: parsed.data.notes,
    due_at: dueAt.toISOString(),
    status: 'pending',
  }).select('id, request_type, status, requested_at, due_at').maybeSingle();
  if (error) return NextResponse.json({ error: 'Unable to create privacy request' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Privacy request was not created' }, { status: 500 });
  await service.from('audit_log').insert({
    actor_id: guard.session.user.id,
    actor_role: guard.session.role,
    action: `privacy_${parsed.data.type}_requested`,
    table_name: 'data_requests',
    record_id: data.id,
    new_value: { due_at: data.due_at, organization_id: membership?.org_id ?? null },
    ip_address: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    user_agent: request.headers.get('user-agent'),
  });
  return NextResponse.json({ request: data }, { status: 201 });
}
