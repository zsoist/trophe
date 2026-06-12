/**
 * POST /api/client/message
 * Client sends a quick message to their assigned coach.
 * Uses a server-only service client after verifying the caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { consumeRateLimit } from '@/lib/durable-rate-limit';

const bodySchema = z.object({
  message: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(req: NextRequest) {
  const admin = createSupabaseServiceClient();

  // Auth check via Bearer token
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
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

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid message (1-2000 characters)' }, { status: 400 });
  }
  const { message } = parsed.data;

  // Get client's assigned coach
  const { data: cp } = await admin
    .from('client_profiles')
    .select('coach_id')
    .eq('user_id', user.id)
    .maybeSingle();

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

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
