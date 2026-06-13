import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/durable-rate-limit';

/**
 * Client activation via a coach invite token (plan B1).
 * Validates the invite, creates a client account LINKED to the inviting coach,
 * and records Art.9 consent (mandatory — the form cannot proceed without it).
 *
 * POST /api/auth/activate-client
 * Body: { token, email, password, full_name, consent: true }
 */
const schema = z.object({
  token: z.string().uuid(),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  full_name: z.string().trim().min(1).max(120),
  consent: z.literal(true), // Art.9 explicit consent is required to activate
}).strict();

/** GET ?token= → resolve the inviting coach's name (for the activation screen). */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ valid: false }, { status: 400 });
  const service = createSupabaseServiceClient();
  const { data: invite } = await service
    .from('client_invites')
    .select('coach_id, status, expires_at, client_name')
    .eq('token', token)
    .maybeSingle();
  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ valid: false });
  }
  const { data: coach } = await service.from('profiles').select('full_name').eq('id', invite.coach_id).maybeSingle();
  return NextResponse.json({ valid: true, coachName: coach?.full_name ?? 'your coach', clientName: invite.client_name ?? null });
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rate = await consumeRateLimit(`activate-client:${ip}`, 10, 3600);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many requests — try again later' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  }

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Valid invite, email, 8+ char password, name, and consent are required' }, { status: 400 });
  }
  const { token, email, password, full_name } = parsed.data;
  const service = createSupabaseServiceClient();

  // 1. Validate the invite (pending + not expired).
  const { data: invite } = await service
    .from('client_invites')
    .select('id, coach_id, status, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!invite || invite.status !== 'pending' || new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This invite is invalid or has expired. Ask your coach for a new link.' }, { status: 400 });
  }

  try {
    // 2. Create the client auth user (role forced to client).
    const { data: authData, error: authErr } = await service.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name, role: 'client' },
    });
    if (authErr || !authData.user) {
      const msg = authErr?.message ?? 'Activation failed';
      if (msg.includes('already been registered') || msg.includes('already exists')) {
        return NextResponse.json({ error: 'Email already registered. Log in, then ask your coach to link you.' }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    const userId = authData.user.id;

    // 3. Profile + client_profile LINKED to the inviting coach.
    const { error: pErr } = await service.from('profiles').insert({ id: userId, full_name, email, role: 'client' });
    if (pErr) { await service.auth.admin.deleteUser(userId); throw new Error(`Profile: ${pErr.message}`); }
    const { error: cpErr } = await service.from('client_profiles').insert({
      user_id: userId, coach_id: invite.coach_id, coaching_phase: 'onboarding',
    });
    if (cpErr) { await service.from('profiles').delete().eq('id', userId); await service.auth.admin.deleteUser(userId); throw new Error(`Client profile: ${cpErr.message}`); }

    // 4. Art.9 consent (required) — verifiable record (additive, but we asserted consent:true).
    await service.from('consents').insert({
      user_id: userId, purpose: 'nutrition_processing', version: '1.0', status: 'granted',
      evidence: { source: 'client-activation', coach_id: invite.coach_id, ip, capturedAt: new Date().toISOString() },
    }).then(({ error }) => { if (error) console.error('[activate] consent write failed (non-blocking):', error.message); }, () => {});

    // 5. Mark the invite accepted.
    await service.from('client_invites').update({ status: 'accepted', accepted_user_id: userId }).eq('id', invite.id);

    return NextResponse.json({ success: true, user_id: userId });
  } catch (err) {
    console.error('Client activation error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
