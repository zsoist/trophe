/**
 * POST /api/client/message
 * Client sends a quick message to their assigned coach.
 * Uses a server-only service client after verifying the caller.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const admin = createSupabaseServiceClient();

  // Auth check via Bearer token
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { data: { user }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { message } = await req.json() as { message: string };
  if (!message?.trim()) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  // Get client's assigned coach
  const { data: cp } = await admin
    .from('client_profiles')
    .select('coach_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!cp?.coach_id) {
    return NextResponse.json({ error: 'No coach assigned' }, { status: 400 });
  }

  const { error } = await admin.from('coach_notes').insert({
    coach_id:     cp.coach_id,
    client_id:    user.id,
    note:         `[Client message]: ${message.trim()}`,
    session_type: 'general',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
