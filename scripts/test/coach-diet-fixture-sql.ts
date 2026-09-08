// Disposable parent for the independently reviewed diet service assertions.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
  && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!;
assert.match(actorId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
assert.match(process.env.COACH_SQL_ORG ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const pool = new Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
let installed = false, check = 'baseline';
let baselineConstraints: Array<{ name: string; definition: string }> = [];
let baselinePolicies: unknown[] = [], baselineProfile: unknown;
let parentReceipts: unknown[] = [], parentProposals: unknown[] = [];
let uiManifest: string | undefined;
const ledger = async (table: 'coach_action_receipts' | 'coach_action_proposals') => (await pool.query(`SELECT * FROM private.${table} WHERE actor_id=$1 ORDER BY id`, [actorId])).rows;
const constraints = async () => (await pool.query<{ name: string; definition: string }>("SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname IN ('coach_action_proposals_action_check','coach_action_proposals_envelope_check') ORDER BY conname")).rows;
const policies = async () => (await pool.query("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='client_profiles' ORDER BY policyname")).rows;
const profile = async () => (await pool.query('SELECT to_jsonb(cp) AS row FROM public.client_profiles cp WHERE user_id=$1', [actorId])).rows[0]?.row;
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_diet_fixture_sql', check, outcome: 'passed' }) + '\n');
async function main() {
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='client_profiles' AND column_name='food_preferences'")).rows[0].n, 0);
  assert.equal((await pool.query("SELECT to_regclass('private.coach_food_preference_versions') AS relation")).rows[0].relation, null);
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.client_profiles'::regclass")).rows[0].relrowsecurity, true);
  baselineProfile = await profile(); assert.ok(baselineProfile);
  baselineConstraints = await constraints(); assert.equal(baselineConstraints.length, 2);
  baselinePolicies = await policies();
  parentReceipts = structuredClone(await ledger('coach_action_receipts'));
  parentProposals = structuredClone(await ledger('coach_action_proposals'));
  const ddl = await readFile('db/isolated/coach-food-profile.sql', 'utf8');
  const actions = await readFile('db/isolated/coach-food-preference-actions.sql', 'utf8');
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query(ddl); await connection.query(actions); await connection.query('COMMIT'); installed = true;
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
  check = 'undeclared_default_and_strict_json';
  assert.deepEqual((await profile()).food_preferences, { version: 1, dietPattern: null });
  for (const invalid of [null, {}, [], { version: 1 }, { version: 1, dietPattern: 'keto' }, { version: 1, dietPattern: null, allergy: 'nuts' }, { version: '1', dietPattern: null }]) {
    const probe = await pool.connect();
    try {
      await probe.query('BEGIN');
      await assert.rejects(probe.query('UPDATE public.client_profiles SET food_preferences=$2::jsonb WHERE user_id=$1', [actorId, JSON.stringify(invalid)]), { code: '23514' });
    } finally { await probe.query('ROLLBACK'); probe.release(); }
  }
  pass();
  check = 'reviewed_diet_lifecycle';
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-diet-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(child.status, 0); pass();
  check = 'diet_ui_real_auth_http';
  const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
  uiManifest = resolve(root, `coach-diet-threads-${randomUUID()}.json`);
  await writeFile(uiManifest, '[]', { mode: 0o600 });
  const ui = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-diet.spec.ts'], {
    stdio: 'inherit', env: { ...process.env, E2E_COACH_DIET: '1', E2E_CLIENT_ID: actorId, COACH_DIET_HTTP_THREADS: uiManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED: '1', NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '0', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '1', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(ui.status, 0); pass();
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_diet_fixture_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      const threads: unknown = uiManifest ? JSON.parse(await readFile(uiManifest, 'utf8')) : [];
      assert.ok(Array.isArray(threads) && threads.length <= 4 && threads.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)));
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        if (threads.length) {
          const rows = await connection.query("SELECT id FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND action='food.preference.update'", [actorId, process.env.COACH_SQL_ORG, threads]);
          const proposals = rows.rows.map(row => row.id);
          const receipts = await connection.query('SELECT action_id FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND proposal_id=ANY($4::uuid[])', [actorId, process.env.COACH_SQL_ORG, threads, proposals]);
          const actions = receipts.rows.map(row => row.action_id);
          await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
          const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
          assert.equal(await enabled(), 'O');
          await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
          await connection.query("DELETE FROM public.audit_log WHERE actor_id=$1 AND record_id=$1 AND table_name='client_profiles' AND action='food_preference_updated' AND new_value->>'actionId'=ANY($2::text[])", [actorId, actions]);
          await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable'); assert.equal(await enabled(), 'O');
          await connection.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND proposal_id=ANY($4::uuid[]) AND action_id=ANY($5::uuid[])', [actorId, process.env.COACH_SQL_ORG, threads, proposals, actions]);
          await connection.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND id=ANY($4::uuid[])', [actorId, process.env.COACH_SQL_ORG, threads, proposals]);
          await connection.query('UPDATE public.client_profiles SET updated_at=$2::timestamptz WHERE user_id=$1', [actorId, (baselineProfile as Record<string, unknown>).updated_at]);
        }
        await connection.query('DROP TRIGGER coach_food_preference_revision ON public.client_profiles; DROP FUNCTION private.advance_coach_food_preference_version(); DROP TABLE private.coach_food_preference_versions; ALTER TABLE public.client_profiles DROP COLUMN food_preferences;');
        for (const constraint of baselineConstraints) {
          assert.ok(['coach_action_proposals_action_check', 'coach_action_proposals_envelope_check'].includes(constraint.name));
          await connection.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT ${constraint.name}; ALTER TABLE private.coach_action_proposals ADD CONSTRAINT ${constraint.name} ${constraint.definition}`);
        }
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
      assert.deepEqual(await constraints(), baselineConstraints); assert.deepEqual(await policies(), baselinePolicies); assert.deepEqual(await profile(), baselineProfile);
      assert.deepEqual(await ledger('coach_action_receipts'), parentReceipts); assert.deepEqual(await ledger('coach_action_proposals'), parentProposals);
      assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.client_profiles'::regclass")).rows[0].relrowsecurity, true);
      check = 'diet_schema_removed_original_profile_and_policies_preserved'; pass();
    }
  } catch { process.stderr.write('Isolated diet schema cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
