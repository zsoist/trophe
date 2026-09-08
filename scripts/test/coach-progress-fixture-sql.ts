/** Installs and removes the Progress delta only in the verified loopback database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';
import { Pool } from 'pg';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
  && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
const sqlManifest = resolve(root, `coach-progress-sql-${randomUUID()}.json`), httpManifest = resolve(root, `coach-progress-http-${randomUUID()}.json`), conversationId = randomUUID();
await writeFile(sqlManifest, JSON.stringify({ measurementIds: [], conversationIds: [conversationId], actionIds: [] }), { mode: 0o600 }); await writeFile(httpManifest, '[]', { mode: 0o600 });
const pool = new Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
let installed = false, check = 'baseline';
let baselineConstraint = '', baselineProfile: unknown, baselineMembership: unknown, baselineMeasurements: unknown[] = [], baselineReceipts: unknown[] = [], baselineProposals: unknown[] = [], baselineAudit: unknown[] = [], baselinePolicies: unknown[] = [];
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_progress_fixture_sql', check, outcome: 'passed' }) + '\n');
const rows = async (text: string, values: unknown[] = []) => (await pool.query(text, values)).rows;
async function main() {
  assert.equal((await pool.query("SELECT to_regclass('private.coach_measurement_scope_versions') AS relation")).rows[0].relation, null);
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.measurements'::regclass")).rows[0].relrowsecurity, true);
  baselineConstraint = (await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname='coach_action_proposals_action_check'")).rows[0]?.definition; assert.ok(baselineConstraint);
  baselineProfile = (await rows('SELECT to_jsonb(p) AS row FROM public.profiles p WHERE id=$1', [actorId]))[0]?.row;
  baselineMembership = (await rows('SELECT to_jsonb(m) AS row FROM public.organization_members m WHERE user_id=$1 AND org_id=$2', [actorId, organizationId]))[0]?.row;
  baselineMeasurements = await rows('SELECT to_jsonb(m) AS row FROM public.measurements m WHERE user_id=ANY($1::uuid[]) ORDER BY id', [[actorId, coachId]]);
  baselineReceipts = await rows('SELECT to_jsonb(r) AS row FROM private.coach_action_receipts r WHERE actor_id=$1 ORDER BY id', [actorId]);
  baselineProposals = await rows('SELECT to_jsonb(p) AS row FROM private.coach_action_proposals p WHERE actor_id=$1 ORDER BY id', [actorId]);
  baselineAudit = await rows('SELECT to_jsonb(a) AS row FROM public.audit_log a WHERE actor_id=$1 ORDER BY id', [actorId]);
  baselinePolicies = await rows("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='measurements' ORDER BY policyname");
  const ddl = await readFile('db/isolated/coach-progress-actions.sql', 'utf8'); const connection = await pool.connect();
  try { await connection.query('BEGIN'); await connection.query(ddl); await connection.query("UPDATE public.profiles SET language='en',timezone='America/Bogota' WHERE id=$1", [actorId]); await connection.query('COMMIT'); installed = true; }
  catch (error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
  check = 'progress_service_real_sql';
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-progress-sql.ts'], { stdio: 'inherit', timeout: 120000, env: { ...process.env, COACH_PROGRESS_SQL_MANIFEST: sqlManifest, COACH_PROGRESS_CONVERSATION: conversationId } });
  assert.equal(child.status, 0); pass();
  check = 'progress_ui_real_auth_http';
  const ui = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach-progress.config.ts', '--workers=1', 'e2e/coach-progress.spec.ts'], { stdio: 'inherit', timeout: 240000,
    env: { ...process.env, E2E_COACH_PROGRESS: '1', E2E_CLIENT_ID: actorId, COACH_PROGRESS_HTTP_THREADS: httpManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED: '1', NEXT_PUBLIC_COACH_PROGRESS_ACTIONS_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED: '1',
      COACH_ASSISTANT_CHAT_HISTORY_ENABLED: '0', COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '0', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '0', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(ui.status, 0); pass();
}

main().catch(error => { process.stderr.write(JSON.stringify({ event: 'coach_progress_fixture_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1; }).finally(async () => {
  try {
    if (installed) {
      const sql: unknown = JSON.parse(await readFile(sqlManifest, 'utf8')), http: unknown = JSON.parse(await readFile(httpManifest, 'utf8'));
      assert.ok(sql && typeof sql === 'object' && Array.isArray((sql as { measurementIds?: unknown }).measurementIds) && Array.isArray((sql as { conversationIds?: unknown }).conversationIds));
      assert.ok(Array.isArray(http) && http.length <= 4 && http.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)));
      const ids = (sql as { measurementIds: string[] }).measurementIds, conversations = [...new Set([...(sql as { conversationIds: string[] }).conversationIds, ...http])];
      assert.ok(ids.length <= 32 && ids.every(id => /^[a-f0-9-]{36}$/.test(id))); assert.ok(conversations.length <= 6 && conversations.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)));
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        const proposals = (await connection.query("SELECT id FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND action='measurement.create'", [actorId, organizationId, conversations])).rows.map(row => row.id);
        const allIds = [...new Set([...ids, ...proposals])];
        const actions = proposals.length ? (await connection.query('SELECT action_id FROM private.coach_action_receipts WHERE actor_id=$1 AND proposal_id=ANY($2::uuid[])', [actorId, proposals])).rows.map(row => row.action_id) : [];
        await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
        const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
        assert.equal(await enabled(), 'O'); await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
        if (allIds.length) await connection.query("DELETE FROM public.audit_log WHERE actor_id=$1 AND table_name='measurements' AND action='measurement_created' AND record_id=ANY($2::uuid[])", [actorId, allIds]);
        await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable'); assert.equal(await enabled(), 'O');
        if (proposals.length) { await connection.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND proposal_id=ANY($2::uuid[]) AND action_id=ANY($3::uuid[])', [actorId, proposals, actions]); await connection.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND id=ANY($2::uuid[])', [actorId, proposals]); }
        if (allIds.length) await connection.query('DELETE FROM public.measurements WHERE id=ANY($1::uuid[]) AND user_id=ANY($2::uuid[])', [allIds, [actorId, coachId]]);
        await connection.query('UPDATE public.profiles SET language=$2,timezone=$3 WHERE id=$1', [actorId, (baselineProfile as Record<string, unknown>).language, (baselineProfile as Record<string, unknown>).timezone]);
        await connection.query('DROP TRIGGER coach_measurement_mutation_revision ON public.measurements; DROP TRIGGER coach_measurement_no_truncate ON public.measurements; DROP TRIGGER coach_measurement_profile_revision ON public.profiles; DROP TRIGGER coach_measurement_client_revision ON public.client_profiles; DROP TRIGGER coach_measurement_membership_revision ON public.organization_members;');
        await connection.query('DROP FUNCTION private.coach_measurement_mutation_revision(); DROP FUNCTION private.coach_measurement_no_truncate(); DROP FUNCTION private.coach_measurement_auth_revision(); DROP FUNCTION private.coach_measurement_bump(uuid); DROP TABLE private.coach_measurement_scope_versions; DROP FUNCTION private.coach_measurement_revision_guard();');
        await connection.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check; ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check ${baselineConstraint}`);
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
      assert.equal((await pool.query("SELECT to_regclass('private.coach_measurement_scope_versions') AS relation")).rows[0].relation, null);
      assert.equal((await pool.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname='coach_action_proposals_action_check'")).rows[0].definition, baselineConstraint);
      assert.deepEqual((await rows('SELECT to_jsonb(p) AS row FROM public.profiles p WHERE id=$1', [actorId]))[0]?.row, baselineProfile);
      assert.deepEqual((await rows('SELECT to_jsonb(m) AS row FROM public.organization_members m WHERE user_id=$1 AND org_id=$2', [actorId, organizationId]))[0]?.row, baselineMembership);
      assert.deepEqual(await rows('SELECT to_jsonb(m) AS row FROM public.measurements m WHERE user_id=ANY($1::uuid[]) ORDER BY id', [[actorId, coachId]]), baselineMeasurements);
      assert.deepEqual(await rows('SELECT to_jsonb(r) AS row FROM private.coach_action_receipts r WHERE actor_id=$1 ORDER BY id', [actorId]), baselineReceipts);
      assert.deepEqual(await rows('SELECT to_jsonb(p) AS row FROM private.coach_action_proposals p WHERE actor_id=$1 ORDER BY id', [actorId]), baselineProposals);
      assert.deepEqual(await rows('SELECT to_jsonb(a) AS row FROM public.audit_log a WHERE actor_id=$1 ORDER BY id', [actorId]), baselineAudit);
      assert.deepEqual(await rows("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='measurements' ORDER BY policyname"), baselinePolicies);
      check = 'progress_schema_and_rows_removed_baseline_preserved'; pass();
    }
  } catch (error) { const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined; process.stderr.write(JSON.stringify({ event: 'coach_progress_fixture_sql', check: 'cleanup', outcome: 'failed', ...(typeof code === 'string' ? { sqlstate: code } : {}) }) + '\n'); process.exitCode = 1; }
  await pool.end();
});
