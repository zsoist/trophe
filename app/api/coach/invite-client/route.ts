import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Coach generates a shareable client-invite link (plan B1). The client opens
 * /activate?token=… to create an account linked to this coach with Art.9 consent.
 *
 * POST { clientName?, clientEmail? } → { link, token }
 * GET  → this coach's recent invites
 */
const bodySchema = z.object({
  clientName: z.string().trim().min(1).max(120).optional(),
  clientEmail: z.string().trim().email().max(254).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const guard = await requireRole(['coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 });

  const service = createSupabaseServiceClient();
  const { data, error } = await service.from('client_invites').insert({
    coach_id: guard.session.user.id,
    client_name: parsed.data.clientName ?? null,
    client_email: parsed.data.clientEmail ?? null,
    expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
  }).select('token').maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Could not create invite' }, { status: 500 });

  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://trophe.app';
  return NextResponse.json({ token: data.token, link: `${base}/activate?token=${data.token}` }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const guard = await requireRole(['coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;
  const service = createSupabaseServiceClient();
  const { data } = await service.from('client_invites')
    .select('token, client_name, client_email, status, created_at')
    .eq('coach_id', guard.session.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  return NextResponse.json({ invites: data ?? [] });
}
