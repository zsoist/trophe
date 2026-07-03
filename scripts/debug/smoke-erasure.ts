import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

/**
 * WP5 erasure smoke — END-TO-END on prod with a disposable seeded user.
 * Seeds a throwaway CLIENT account with rows in cascade tables AND the
 * straggler tables (habit_checkins NO-ACTION FK, agent_runs no-FK), runs
 * eraseUser dry-run → execute, then verifies zero residue. Self-cleaning by
 * design: the test IS the cleanup.
 *
 *   npx tsx scripts/debug/smoke-erasure.ts
 */
import { eraseUser } from '../../lib/privacy/erasure';
import { createClient } from '@supabase/supabase-js';

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
  process.env.SUPABASE_SERVICE_ROLE_KEY!.trim(),
  { auth: { persistSession: false } },
);

async function main() {
  const email = `erasure-smoke-${Date.now()}@trophe.app`;

  // ── Seed ────────────────────────────────────────────────────────────────
  const { data: created, error: createErr } = await service.auth.admin.createUser({
    email, email_confirm: true, password: `Smoke-${Date.now()}!x`,
  });
  if (createErr || !created.user) throw new Error(`createUser: ${createErr?.message}`);
  const uid = created.user.id;
  console.log(`[seed] auth user ${email} → ${uid}`);

  const ins = async (table: string, row: Record<string, unknown>) => {
    const { error } = await service.from(table).insert(row);
    if (error) throw new Error(`seed ${table}: ${error.message}`);
    console.log(`[seed] ${table} ok`);
  };

  // profiles may be auto-created by the signup trigger — upsert to be safe.
  const { error: profErr } = await service.from('profiles').upsert({
    id: uid, email, full_name: 'Erasure Smoke', role: 'client', language: 'en',
  });
  if (profErr) throw new Error(`seed profiles: ${profErr.message}`);
  console.log('[seed] profiles ok');

  const today = new Date().toISOString().slice(0, 10);
  await ins('food_log', { user_id: uid, logged_date: today, meal_type: 'lunch', food_name: 'smoke salad', calories: 100 });
  await ins('water_log', { user_id: uid, logged_date: today, amount_ml: 250 });
  // Straggler #1: NO ACTION FK — would block the profiles cascade if missed.
  const { data: habit } = await service.from('habits').select('id').limit(1).maybeSingle();
  if (habit) {
    const { data: ch, error: chErr } = await service.from('client_habits')
      .insert({ client_id: uid, habit_id: habit.id, status: 'active', sequence_number: 1, started_date: today, current_streak: 0 })
      .select('id').maybeSingle();
    if (chErr) throw new Error(`seed client_habits: ${chErr.message}`);
    await ins('habit_checkins', { user_id: uid, client_habit_id: ch!.id, checked_date: today, completed: true });
  } else {
    console.log('[seed] no habits exist — skipping habit_checkins arm');
  }
  // Straggler #2: no FK at all — a cascade would never touch this row.
  await ins('agent_runs', {
    user_id: uid, task_name: 'food_parse', provider: 'deepseek', model: 'smoke-test',
    tokens_in: 1, tokens_out: 1, cost_usd: 0, status: 'completed',
  });

  // ── Dry run ─────────────────────────────────────────────────────────────
  const dry = await eraseUser(uid, { dryRun: true });
  console.log('[dry-run]', JSON.stringify(dry.counts), 'errors:', dry.errors);
  if (dry.errors.length) throw new Error('dry-run reported errors');

  // ── Execute ─────────────────────────────────────────────────────────────
  const real = await eraseUser(uid, { dryRun: false });
  console.log('[execute]', JSON.stringify(real.counts), 'errors:', real.errors, 'authDeleted:', real.authUserDeleted);
  if (real.errors.length || !real.authUserDeleted) throw new Error('execution failed');

  // ── Verify zero residue ─────────────────────────────────────────────────
  let residue = 0;
  for (const [table, col] of [
    ['profiles', 'id'], ['food_log', 'user_id'], ['water_log', 'user_id'],
    ['habit_checkins', 'user_id'], ['client_habits', 'client_id'],
  ] as const) {
    const { count } = await service.from(table).select('*', { count: 'exact', head: true }).eq(col, uid);
    if (count) { console.log(`[VERIFY-FAIL] ${table} still has ${count} rows`); residue += count; }
  }
  const { data: anonRun } = await service.from('agent_runs')
    .select('user_id').eq('model', 'smoke-test').order('created_at', { ascending: false }).limit(1).maybeSingle();
  const anonOk = anonRun !== null && anonRun.user_id === null;
  console.log(`[verify] agent_runs anonymized (row kept, user_id NULL): ${anonOk}`);
  const { data: ghost } = await service.auth.admin.getUserById(uid);
  const authGone = !ghost?.user;
  console.log(`[verify] auth user gone: ${authGone}`);

  // Clean the anonymous smoke telemetry row itself (it's test data, not real cost).
  await service.from('agent_runs').delete().eq('model', 'smoke-test');

  if (residue === 0 && anonOk && authGone) {
    console.log('SMOKE PASSED — full erasure verified end-to-end on prod.');
  } else {
    console.log('SMOKE FAILED');
    process.exit(1);
  }
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
