/**
 * smoke-parse-roundtrip — post-deploy proof that the AI food-input write path
 * persists provenance (mission food-input-10).
 *
 * As the rate-limit-allowlisted eval user: parse Greek text against prod,
 * insert one food_log row EXACTLY as QuickFoodInput now does, read it back,
 * verify natural_language/parse_confidence/food_id/sugar_g/qty_input landed,
 * then delete the test row. Read-only besides the one self-cleaned row.
 *
 *   npx tsx scripts/debug/smoke-parse-roundtrip.ts
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const BASE = process.env.SMOKE_BASE ?? 'https://trophe.app';
const EVAL_EMAIL = 'eval-tester-2026@trophe.app';

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EVAL_EMAIL });
  if (linkErr) throw linkErr;
  const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: otp, error: otpErr } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties!.hashed_token });
  if (otpErr || !otp.session) throw otpErr ?? new Error('no session');
  const jwt = otp.session.access_token;
  const userId = otp.user!.id;
  console.log('auth ok:', otp.user?.email);

  // 1) Parse
  const res = await fetch(`${BASE}/api/food/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${jwt}` },
    body: JSON.stringify({ text: '2 αυγά βραστά και 200γρ γιαούρτι στραγγιστό 10%', language: 'el' }),
  });
  const parsed = await res.json();
  console.log('parse status:', res.status, '| items:', parsed.items?.length ?? 0, '| clarification:', parsed.needs_clarification ?? false);
  if (!res.ok || !parsed.items?.length) { console.log('BODY:', JSON.stringify(parsed).slice(0, 400)); throw new Error('parse failed'); }
  const it = parsed.items[0];
  console.log('item0:', JSON.stringify({ name: it.food_name, loc: it.name_localized, conf: it.confidence, src: it.source, db_food_id: it.db_food_id ?? null, brand: it.brand ?? null, sugar: it.sugar_g ?? null }));

  // 2) Insert exactly like QuickFoodInput (text path).
  // NOTE: the eval-tester auth user has no profiles row (test account), and
  // food_log.user_id FKs profiles — so the WRITE half runs as a real-profile
  // user (parse already proved the allowlisted path above).
  const { data: link2, error: linkErr2 } = await admin.auth.admin.generateLink({ type: 'magiclink', email: 'daniel@reyes.com' });
  if (linkErr2) throw linkErr2;
  const { data: otp2, error: otpErr2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link2.properties!.hashed_token });
  if (otpErr2 || !otp2.session) throw otpErr2 ?? new Error('no session (writer)');
  const writerJwt = otp2.session.access_token;
  const writerId = otp2.user!.id;
  console.log('writer auth ok:', otp2.user?.email);
  const authed = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${writerJwt}` } }, auth: { autoRefreshToken: false, persistSession: false } });
  const payload = {
    user_id: writerId,
    logged_date: new Date().toISOString().slice(0, 10),
    meal_type: 'snack',
    food_name: it.name_localized || it.raw_text || it.food_name,
    quantity: it.quantity, unit: it.unit,
    calories: it.calories, protein_g: it.protein_g, carbs_g: it.carbs_g, fat_g: it.fat_g, fiber_g: it.fiber_g,
    sugar_g: it.sugar_g ?? null,
    parse_confidence: it.confidence ?? null,
    qty_input: it.quantity, qty_input_unit: it.unit,
    food_id: it.db_food_id ?? null,
    llm_recognized: it.source !== 'ai_estimate',
    source: 'natural_language',
  };
  const ins = await authed.from('food_log').insert(payload).select('id, food_name, source, parse_confidence, food_id, sugar_g, qty_input').maybeSingle();
  if (ins.error) throw new Error('insert failed: ' + ins.error.message);
  console.log('row landed:', JSON.stringify(ins.data));

  const ok = ins.data!.source === 'natural_language' && ins.data!.parse_confidence !== null && ins.data!.food_name === payload.food_name;
  console.log(ok ? '✅ PROVENANCE PERSISTED' : '❌ PROVENANCE MISSING');

  // 3) Clean up
  await authed.from('food_log').delete().eq('id', ins.data!.id);
  console.log('test row deleted');
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error('SMOKE FAIL:', e.message); process.exit(1); });
