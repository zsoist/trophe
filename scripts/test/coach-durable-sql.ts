import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDurablePreferenceService } from '../../lib/workout/durable-preference-actions';
import { writeWorkoutPreferences } from '../../lib/workout/preference-service';
import { defaultWorkoutPreferences } from '../../lib/workout/preferences';
import type { CoachActionResult, CoachPreferenceOperation } from '../../agents/coach-assistant/contracts';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const database = drizzle(pool), service = createDurablePreferenceService(database);
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const conversationId = process.env.COACH_SQL_CONVERSATION ?? randomUUID();
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID() });
const fixtureActionIds: string[] = [];
const execute = (operation: CoachPreferenceOperation) => service.execute({ ...scope, operation });
async function propose(durationMinutes: 20 | 30 | 45 | 60) {
  const current = await service.read(scope);
  const result = await execute({ ...header(), operation: 'propose', action: 'preference.update', resourceVersion: current.version, after: { durationMinutes } });
  assert.equal(result.ok, true); assert.ok(result.proposal);
  return result.proposal;
}
function apply(proposal: NonNullable<CoachActionResult['proposal']>): CoachPreferenceOperation & { operation: 'apply' } {
  const actionId = randomUUID(); fixtureActionIds.push(actionId);
  return { ...header(), operation: 'apply', actionId, proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version };
}
let check = 'setup', installed = false;
function pass() { process.stdout.write(JSON.stringify({ event: 'coach_durable_sql', check, outcome: 'passed' }) + '\n'); }

// Only this guarded, disposable CI process may remove its own test audit rows.
// The append-only trigger remains enabled for every service assertion above.
async function cleanupFixtureAudit() {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
    const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
    assert.equal(await enabled(), 'O');
    const rows = await connection.query(`SELECT id FROM public.audit_log WHERE actor_id=$1 AND record_id=$1
      AND action='workout_preferences_updated' AND table_name='client_profiles' AND new_value->>'actionId'=ANY($2::text[])`, [actorId, fixtureActionIds]);
    const ids = rows.rows.map(row => row.id as string);
    if (ids.length) {
      // Demonstrate the exact cleanup conflict without committing a mutation.
      await connection.query('SAVEPOINT immutable_probe');
      await assert.rejects(connection.query('DELETE FROM public.audit_log WHERE id=$1', [ids[0]]), { code: 'P0001' });
      await connection.query('ROLLBACK TO SAVEPOINT immutable_probe');
      process.stdout.write(JSON.stringify({ event: 'coach_durable_sql', check: 'fixture_audit_immutable_probe', outcome: 'passed', sqlstate: 'P0001' }) + '\n');
      await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
      const removed = await connection.query(`DELETE FROM public.audit_log WHERE id=ANY($1::bigint[]) AND actor_id=$2 AND record_id=$2
        AND action='workout_preferences_updated' AND table_name='client_profiles' AND new_value->>'actionId'=ANY($3::text[]) RETURNING id`, [ids, actorId, fixtureActionIds]);
      assert.equal(removed.rowCount, ids.length);
      await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable');
    }
    assert.equal(await enabled(), 'O');
    await connection.query('COMMIT');
    process.stdout.write(JSON.stringify({ event: 'coach_durable_sql', check: 'fixture_audit_removed_trigger_restored', outcome: 'passed' }) + '\n');
  } catch (error) {
    await connection.query('ROLLBACK'); // DDL is transactional: a failed cleanup restores the trigger too.
    throw error;
  } finally { connection.release(); }
}

async function main() {
  if (process.argv[2] === 'recover') {
    check = 'receipt_recovery_new_process';
    const result = await execute({ ...header(), operation: 'receipt', actionId: process.env.COACH_SQL_ACTION! });
    assert.equal(result.ok, true); assert.equal(result.receipt?.id, process.env.COACH_SQL_RECEIPT); pass(); return;
  }
  await pool.query('UPDATE public.client_profiles SET workout_preferences=$2::jsonb WHERE user_id=$1', [actorId, JSON.stringify(defaultWorkoutPreferences)]);
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES ($1,$2,'client'),($1,$3,'coach') ON CONFLICT(org_id,user_id) DO UPDATE SET role=EXCLUDED.role", [organizationId, actorId, coachId]);
  await pool.query(await readFile('db/isolated/coach-durable-actions.sql', 'utf8')); installed = true;

  check = 'concurrent_same_action_one_mutation_receipt';
  const before = await service.read(scope), proposal = await propose(45), operation = apply(proposal);
  const results = await Promise.all([execute(operation), execute(operation)]);
  assert.ok(results.every(result => result.ok)); assert.equal(results[0].receipt?.id, results[1].receipt?.id);
  const after = await service.read(scope); assert.equal(after.preferences.durationMinutes, 45); assert.equal(BigInt(after.version), BigInt(before.version) + BigInt(1));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, operation.actionId])).rows[0].count, 1); pass();

  check = 'receipt_recovery_new_process';
  const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-durable-sql.ts', 'recover'], { stdio: 'inherit', env: { ...process.env, COACH_SQL_CONVERSATION: conversationId, COACH_SQL_ACTION: operation.actionId, COACH_SQL_RECEIPT: results[0].receipt!.id } });
  assert.equal(recovery.status, 0);

  check = 'changed_payload_idempotency_conflict';
  assert.equal((await execute({ ...operation, hash: 'f'.repeat(64) })).error, 'idempotency_conflict'); pass();

  check = 'competing_versions_only_one_applies';
  const left = apply(await propose(20)), right = apply(await propose(60));
  const competing = await Promise.all([execute(left), execute(right)]);
  assert.equal(competing.filter(result => result.ok).length, 1); assert.equal(competing.filter(result => result.error === 'version_conflict').length, 1); pass();

  check = 'manual_writer_and_ABA_invalidate_proposal';
  const prior = await service.read(scope), stale = apply(await propose(30));
  const changed = prior.preferences.durationMinutes === 45 ? 60 : 45;
  await writeWorkoutPreferences(database, { actorId, subjectId: actorId, role: 'client', preferences: { ...prior.preferences, durationMinutes: changed } });
  await writeWorkoutPreferences(database, { actorId, subjectId: actorId, role: 'client', preferences: prior.preferences });
  assert.equal((await execute(stale)).error, 'version_conflict'); assert.equal(BigInt((await service.read(scope)).version), BigInt(prior.version) + BigInt(2)); pass();

  check = 'receipt_insert_failure_rolls_back_preferences_revision';
  const rollbackBefore = await service.read(scope), doomed = apply(await propose(30));
  await pool.query('ALTER TABLE private.coach_action_receipts ADD CONSTRAINT isolated_receipt_failure CHECK(false) NOT VALID');
  try {
    assert.equal((await execute(doomed)).error, 'uncertain');
    assert.deepEqual(await service.read(scope), rollbackBefore);
    assert.equal((await execute({ ...header(), operation: 'receipt', actionId: doomed.actionId })).error, 'not_found');
  } finally { await pool.query('ALTER TABLE private.coach_action_receipts DROP CONSTRAINT isolated_receipt_failure'); }
  pass();

  check = 'foreign_subject_org_and_revoked_receipt_denied';
  assert.equal((await service.execute({ ...scope, subjectId: coachId, operation })).error, 'forbidden');
  assert.equal((await service.execute({ ...scope, organizationId: randomUUID(), operation })).error, 'forbidden');
  await pool.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=$2', [organizationId, actorId]);
  assert.equal((await execute({ ...header(), operation: 'receipt', actionId: operation.actionId })).error, 'forbidden');
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES ($1,$2,'client')", [organizationId, actorId]); pass();

  check = 'direct_authenticated_table_access_denied';
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await assert.rejects(connection.query('SELECT * FROM private.coach_action_receipts'), { code: '42501' });
  } finally { await connection.query('ROLLBACK'); connection.release(); }
  pass();

  check = 'persistent_pilot_budget';
  const pilot = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-pilot-budget-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(pilot.status, 0);

  check = 'reviewed_food_quantity_transactions';
  const food = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-food-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(food.status, 0);

  check = 'reviewed_photo_food_transactions';
  const photoFood = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-photo-food-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(photoFood.status, 0);

  check = 'persistent_memory_transactions';
  const memory = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-memory-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(memory.status, 0);

  check = 'reviewed_diet_preference_transactions';
  const diet = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-diet-fixture-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(diet.status, 0);

  check = 'reviewed_progress_measurement_transactions';
  const progress = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-progress-fixture-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(progress.status, 0);

  check = 'durable_global_ui_real_auth_http';
  const root = process.env.RUNNER_TEMP;
  assert.ok(root && isAbsolute(root));
  const manifest = resolve(root, `coach-durable-actions-${randomUUID()}.json`);
  await writeFile(manifest, '[]', { mode: 0o600 });
  const httpEnv = { ...process.env, E2E_COACH_DURABLE: '1', E2E_COACH_WEEK: '0', COACH_SQL_HTTP_ACTIONS: manifest,
    E2E_CLIENT_ID: actorId, NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0',
    COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
    COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED: '1', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId,
  };
  const http = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-durable.spec.ts'], { stdio: 'inherit', env: httpEnv });
  // The test writes observed IDs before forwarding an apply, including failed cases.
  const httpActionIds = JSON.parse(await readFile(manifest, 'utf8'));
  assert.ok(Array.isArray(httpActionIds) && httpActionIds.length <= 16 && httpActionIds.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)));
  fixtureActionIds.push(...httpActionIds);
  assert.equal(http.status, 0); pass();
  check = 'isolated_engine_real_auth_http';
  const engine = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-engine.spec.ts'], {
    stdio: 'inherit', env: { ...httpEnv, E2E_COACH_DURABLE: '0', E2E_COACH_ENGINE: '1', COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1', AI_RATE_LIMIT_BYPASS_USER_IDS: actorId },
  });
  assert.equal(engine.status, 0); pass();
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_durable_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      await cleanupFixtureAudit();
      await pool.query('DROP TRIGGER coach_preference_revision ON public.client_profiles; DROP FUNCTION private.advance_coach_preference_version(); DROP TABLE private.coach_action_receipts; DROP TABLE private.coach_action_proposals; DROP TABLE private.coach_preference_versions;');
      process.stdout.write(JSON.stringify({ event: 'coach_durable_sql', check: 'isolated_delta_removed', outcome: 'passed' }) + '\n');
    }
  } catch (error) {
    const code = (error as { code?: unknown })?.code;
    process.stderr.write(JSON.stringify({ event: 'coach_durable_sql', check: 'isolated_cleanup', outcome: 'failed', ...(typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? { sqlstate: code } : {}) }) + '\n'); process.exitCode = 1;
  }
  await pool.end();
});
