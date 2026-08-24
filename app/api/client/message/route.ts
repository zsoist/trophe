/**
 * POST /api/client/message
 * Client sends a quick message to their assigned coach.
 * Uses a server-only service client after verifying the caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
}).strict();

function bearerToken(req: NextRequest): string {
  const auth = req.headers.get('Authorization') ?? '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export async function GET(req: NextRequest) {
  const admin = createSupabaseServiceClient();
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: clientProfile, error: assignmentError } = await admin
    .from('client_profiles')
    .select('coach_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (assignmentError) {
    console.error('[client-coach] assignment lookup failed', safeErrorMetadata(assignmentError));
    return NextResponse.json({ error: 'Coach identity is temporarily unavailable.' }, { status: 503 });
  }
  if (!clientProfile?.coach_id) {
    return NextResponse.json({ coachName: null }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  const { data: coach, error: coachError } = await admin
    .from('profiles')
    .select('full_name')
    .eq('id', clientProfile.coach_id)
    .maybeSingle();

  if (coachError) {
    console.error('[client-coach] identity lookup failed', safeErrorMetadata(coachError));
    return NextResponse.json({ error: 'Coach identity is temporarily unavailable.' }, { status: 503 });
  }

  return NextResponse.json(
    { coachName: coach?.full_name?.trim() || null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const admin = createSupabaseServiceClient();

  // Auth check via Bearer token
  const token = bearerToken(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Durable rate limit: 30 messages / 15 min per user (spam guard)
  const rate = await consumeRateLimit(`client-message:${user.id}`, 30, 900);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many messages — slow down a little' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid message (1-2000 characters)' }, { status: 400 });
  }
  const { message } = parsed.data;

  // Get client's assigned coach
  const { data: cp, error: profileError } = await admin
    .from('client_profiles')
    .select('coach_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    console.error('[client-message] coach lookup failed', safeErrorMetadata(profileError));
    return NextResponse.json(
      { error: 'Message could not be sent — please try again.' },
      { status: 503 },
    );
  }
  if (!cp?.coach_id) {
    return NextResponse.json({ error: 'No coach assigned' }, { status: 400 });
  }

  // Phase 1 messaging: quick messages land in the unified messages thread.
  const { error } = await admin.from('messages').insert({
    coach_id:    cp.coach_id,
    client_id:   user.id,
    sender_role: 'client',
    body:        message.trim(),
  });

  if (error) {
    console.error('[client-message] insert failed', safeErrorMetadata(error));
    return NextResponse.json(
      { error: 'Message could not be sent — please try again.' },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true });
}
