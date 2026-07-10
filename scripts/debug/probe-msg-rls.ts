import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  // Sign in as the client (Daniel) via magic link → real JWT
  const { data: link } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'daniel@reyes.com' });
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: otp } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link!.properties!.hashed_token });
  const uid = otp!.user!.id;
  const jwt = otp!.session!.access_token;
  const asClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  // Find a COACH-authored message in Daniel's thread (or seed one via admin).
  let { data: coachMsg } = await admin.from('messages')
    .select('id, body, coach_id, client_id, sender_role').eq('client_id', uid).eq('sender_role', 'coach').limit(1).maybeSingle();
  let seeded = false;
  if (!coachMsg) {
    const { data: cp } = await admin.from('client_profiles').select('coach_id').eq('user_id', uid).maybeSingle();
    const { data: ins } = await admin.from('messages')
      .insert({ coach_id: cp!.coach_id, client_id: uid, sender_role: 'coach', body: 'RLS-PROBE original coach message' })
      .select('id, body, coach_id, client_id, sender_role').maybeSingle();
    coachMsg = ins!; seeded = true;
  }

  // ATTACK 1: client rewrites the coach message body
  const atk1 = await asClient.from('messages').update({ body: 'FORGED: take 5g of X daily' }).eq('id', coachMsg!.id).select('id');
  console.log('attack (rewrite coach body):', atk1.error ? `BLOCKED ✓ (${atk1.error.message.slice(0,50)})` : (atk1.data?.length ? 'ALLOWED ✗✗✗ CRITICAL' : 'BLOCKED ✓ (0 rows)'));

  // ATTACK 2: client re-points coach_id
  const atk2 = await asClient.from('messages').update({ coach_id: uid }).eq('id', coachMsg!.id).select('id');
  console.log('attack (hijack coach_id):', atk2.error ? `BLOCKED ✓ (${atk2.error.message.slice(0,50)})` : (atk2.data?.length ? 'ALLOWED ✗✗✗' : 'BLOCKED ✓ (0 rows)'));

  // LEGIT: client marks read_at (must still work)
  const ok = await asClient.from('messages').update({ read_at: new Date().toISOString() }).eq('id', coachMsg!.id).select('id');
  console.log('legit (mark read_at):', ok.error ? `BROKEN ✗ (${ok.error.message.slice(0,50)})` : 'ALLOWED ✓');

  // Verify body unchanged in DB
  const { data: after } = await admin.from('messages').select('body, coach_id').eq('id', coachMsg!.id).maybeSingle();
  console.log('body intact:', after!.body === coachMsg!.body ? 'YES ✓' : `NO ✗ (now: ${after!.body})`);
  console.log('coach_id intact:', after!.coach_id === coachMsg!.coach_id ? 'YES ✓' : 'NO ✗');

  if (seeded) await admin.from('messages').delete().eq('id', coachMsg!.id);
  console.log(seeded ? 'cleaned seeded probe message' : 'left existing message untouched');
}
main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
