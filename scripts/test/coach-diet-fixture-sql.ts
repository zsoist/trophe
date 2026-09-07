// Disposable parent for the independently reviewed diet service assertions.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
  && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!;
assert.match(actorId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const pool = new Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
let installed = false, check = 'baseline';
let baselineConstraints: Array<{ name: string; definition: string }> = [];
let baselinePolicies: unknown[] = [], baselineProfile: unknown;
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
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_diet_fixture_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query('DROP TRIGGER coach_food_preference_revision ON public.client_profiles; DROP FUNCTION private.advance_coach_food_preference_version(); DROP TABLE private.coach_food_preference_versions; ALTER TABLE public.client_profiles DROP COLUMN food_preferences;');
        for (const constraint of baselineConstraints) {
          assert.ok(['coach_action_proposals_action_check', 'coach_action_proposals_envelope_check'].includes(constraint.name));
          await connection.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT ${constraint.name}; ALTER TABLE private.coach_action_proposals ADD CONSTRAINT ${constraint.name} ${constraint.definition}`);
        }
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
      assert.deepEqual(await constraints(), baselineConstraints); assert.deepEqual(await policies(), baselinePolicies); assert.deepEqual(await profile(), baselineProfile);
      assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.client_profiles'::regclass")).rows[0].relrowsecurity, true);
      check = 'diet_schema_removed_original_profile_and_policies_preserved'; pass();
    }
  } catch { process.stderr.write('Isolated diet schema cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
