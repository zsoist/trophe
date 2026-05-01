/**
 * POST /api/client/message
 * Client sends a quick message to their assigned coach.
 * Uses service role to insert into coach_notes (bypasses RLS).
 */
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url        = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) return NextResponse.json({ error: 'Missing env' }, { status: 500 });

  const admin = createClient(url, serviceKey);

  // Auth check via Bearer token
  const auth = req.headers.get('Authorization') ?? '';
  const token = auth.replace('Bearer ', '');
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
