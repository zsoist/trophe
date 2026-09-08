import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createWorkoutSetService } from '../../agents/coach-assistant/set-service';
import { workoutSetResultSchema } from '../../agents/coach-assistant/set-actions';
import type { WorkoutSetOperation, WorkoutSetProposal } from '../../agents/coach-assistant/set-contracts';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const service = createWorkoutSetService(drizzle(pool));
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const conversationId = process.env.COACH_SET_CONVERSATION ?? randomUUID();
const sessionId = process.env.COACH_SET_SESSION ?? randomUUID();
const setId = process.env.COACH_SET_ID ?? randomUUID();
const foreignSessionId = randomUUID(), foreignSetId = randomUUID();
const actionIds: string[] = [], proposalIds: string[] = [];
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID() });
const execute = async (operation: WorkoutSetOperation) => workoutSetResultSchema.parse(await service.execute({ ...scope, operation }));
let installed = false, seeded = false, check = 'setup';
let priorConstraints: Array<{ name: string; definition: string }> = [];
const pass = () => process.stdout.write(`${JSON.stringify({ event: 'coach_workout_set_sql', check, outcome: 'passed' })}\n`);

async function read() {
  const result = await execute({ ...header(), operation: 'set.read', setId });
  assert.ok(result.ok && 'snapshot' in result); return result.snapshot;
}
async function propose(reps: number) {
  const snapshot = await read();
  const result = await execute({ ...header(), operation: 'set.propose', setId, resourceVersion: snapshot.version, after: { reps } });
  assert.ok(result.ok && 'proposal' in result); proposalIds.push(result.proposal.id); return result.proposal;
}
function apply(proposal: WorkoutSetProposal, actionId = randomUUID()): Extract<WorkoutSetOperation, { operation: 'set.apply' }> {
  actionIds.push(actionId);
  return { ...header(), operation: 'set.apply', setId, proposalId: proposal.id, hash: proposal.hash, actionId, resourceVersion: proposal.resource.version, reviewed: true };
}

async function removeAudit() {
  if (!actionIds.length) return;
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
    const rows = await connection.query("SELECT id FROM public.audit_log WHERE actor_id=$1 AND action='workout_set_reps_updated' AND table_name='workout_sets' AND record_id=$2 AND new_value->>'actionId'=ANY($3::text[])", [actorId, setId, actionIds]);
    const ids = rows.rows.map(row => row.id as string);
    if (ids.length) {
      await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
      const removed = await connection.query("DELETE FROM public.audit_log WHERE id=ANY($1::bigint[]) AND actor_id=$2 AND record_id=$3 AND action='workout_set_reps_updated' AND new_value->>'actionId'=ANY($4::text[]) RETURNING id", [ids, actorId, setId, actionIds]);
      assert.equal(removed.rowCount, ids.length);
      await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable');
    }
    await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}

async function main() {
  if (process.argv[2] === 'recover') {
    const actionId = process.env.COACH_SET_ACTION!;
    const result = await execute({ ...header(), operation: 'set.receipt', setId, actionId });
    assert.ok(result.ok && 'receipt' in result && result.receipt.status === 'applied' && result.receipt.actionId === actionId);
    const canonical = await read(); assert.equal(canonical.reps, 10);
    check = 'receipt_recovery_new_process'; pass(); return;
  }
  priorConstraints = (await pool.query<{ name: string; definition: string }>("SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname IN ('coach_action_proposals_action_check','coach_action_proposals_envelope_check') ORDER BY conname")).rows;
  await pool.query(await readFile('db/isolated/coach-workout-set-actions.sql', 'utf8')); installed = true;
  const exercise = (await pool.query<{ id: string; name: string }>('SELECT id,name FROM public.exercises WHERE is_template=true AND created_by IS NULL ORDER BY id LIMIT 1')).rows[0];
  assert.ok(exercise);
  await pool.query("INSERT INTO public.workout_sessions(id,user_id,name,session_date,workout_kind) VALUES($1,$2,'Coach set fixture',CURRENT_DATE,'strength'),($3,$4,'Foreign set fixture',CURRENT_DATE,'strength')", [sessionId, actorId, foreignSessionId, coachId]);
  await pool.query('INSERT INTO public.workout_sets(id,session_id,exercise_id,set_number,reps,weight_kg,is_warmup,is_pr) VALUES($1,$2,$3,3,8,80,false,false),($4,$5,$3,1,6,60,false,false)', [setId, sessionId, exercise.id, foreignSetId, foreignSessionId]);
  seeded = true;

  check = 'resolve_preview_identifies_one_latest_set_without_write';
  const resolved = await execute({ ...header(), operation: 'set.resolve' });
  assert.ok(resolved.ok && 'snapshot' in resolved); assert.equal(resolved.snapshot.setId, setId); assert.equal(resolved.snapshot.exerciseName, exercise.name);
  const preview = await propose(10); assert.equal(preview.before.reps, 8); assert.equal(preview.after.reps, 10); assert.deepEqual(await read(), resolved.snapshot); pass();

  check = 'concurrent_apply_one_mutation_one_receipt_and_readback';
  const operation = apply(preview);
  const results = await Promise.all([execute(operation), execute(operation)]);
  assert.ok(results.every(result => result.ok && 'receipt' in result)); assert.deepEqual(results[0], results[1]);
  assert.equal((await read()).reps, 10);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, operation.actionId])).rows[0].n, 1); pass();

  const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-workout-set-sql.ts', 'recover'], { stdio: 'inherit', env: {
    ...process.env, COACH_SET_CONVERSATION: conversationId, COACH_SET_SESSION: sessionId, COACH_SET_ID: setId, COACH_SET_ACTION: operation.actionId,
  } });
  assert.equal(recovery.status, 0);

  check = 'ordinary_writer_aba_invalidates_review';
  const stale = apply(await propose(12)); const beforeAba = await read();
  await pool.query('UPDATE public.workout_sets SET reps=9 WHERE id=$1', [setId]);
  await pool.query('UPDATE public.workout_sets SET reps=$2 WHERE id=$1', [setId, beforeAba.reps]);
  assert.deepEqual((await execute(stale)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();

  check = 'delete_recreate_tombstone_invalidates_review';
  const deleted = apply(await propose(11));
  await pool.query('DELETE FROM public.workout_sets WHERE id=$1', [setId]);
  await pool.query('INSERT INTO public.workout_sets(id,session_id,exercise_id,set_number,reps,weight_kg,is_warmup,is_pr) VALUES($1,$2,$3,3,10,80,false,false)', [setId, sessionId, exercise.id]);
  assert.deepEqual((await execute(deleted)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();

  check = 'completed_foreign_and_revoked_scope_fail_closed';
  const foreign = await execute({ ...header(), operation: 'set.read', setId: foreignSetId }); assert.ok(!foreign.ok && foreign.error === 'not_found');
  await pool.query('UPDATE public.workout_sessions SET completed_at=clock_timestamp() WHERE id=$1', [sessionId]);
  const completed = await execute({ ...header(), operation: 'set.read', setId }); assert.ok(!completed.ok && completed.error === 'session_completed');
  await pool.query('UPDATE public.workout_sessions SET completed_at=NULL WHERE id=$1', [sessionId]);
  await pool.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=$2', [organizationId, actorId]);
  const revoked = await execute({ ...header(), operation: 'set.receipt', setId, actionId: operation.actionId }); assert.ok(!revoked.ok && revoked.error === 'forbidden');
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES($1,$2,'client')", [organizationId, actorId]); pass();

  check = 'receipt_failure_rolls_back_set_revision_and_receipt';
  const doomed = apply(await propose(13)), canonical = await read();
  await pool.query('ALTER TABLE private.coach_action_receipts ADD CONSTRAINT isolated_set_receipt_failure CHECK(false) NOT VALID');
  try { const failed = await execute(doomed); assert.ok(!failed.ok && failed.error === 'uncertain'); }
  finally { await pool.query('ALTER TABLE private.coach_action_receipts DROP CONSTRAINT isolated_set_receipt_failure'); }
  assert.deepEqual(await read(), canonical);
  assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, doomed.actionId])).rowCount, 0); pass();

  check = 'authenticated_cannot_read_private_revision_or_ledger';
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await connection.query('SAVEPOINT revision_access');
    await assert.rejects(connection.query('SELECT * FROM private.coach_workout_set_versions'), { code: '42501' });
    await connection.query('ROLLBACK TO SAVEPOINT revision_access');
    await assert.rejects(connection.query('SELECT * FROM private.coach_action_receipts'), { code: '42501' });
  } finally { await connection.query('ROLLBACK'); connection.release(); }
  pass();

  check = 'workout_composer_real_auth_http';
  const root = process.env.RUNNER_TEMP;
  assert.ok(root && isAbsolute(root));
  const manifest = resolve(root, `coach-workout-set-actions-${randomUUID()}.json`);
  await writeFile(manifest, '{}', { mode: 0o600 });
  await pool.query("UPDATE public.profiles SET language='en' WHERE id=$1", [actorId]);
  await pool.query('UPDATE public.workout_sets SET reps=8 WHERE id=$1', [setId]);
  const http = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-workout-set.spec.ts'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      E2E_COACH_WORKOUT_SET: '1', E2E_CLIENT_ID: actorId, COACH_SET_ID: setId, COACH_SET_HTTP_ACTIONS: manifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'model', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_PREVIEW_USER_IDS: actorId, COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1',
      COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED: '1', AI_RATE_LIMIT_BYPASS_USER_IDS: actorId,
    },
  });
  const httpAction = JSON.parse(await readFile(manifest, 'utf8')) as { actionId?: unknown; proposalId?: unknown };
  assert.ok(httpAction && typeof httpAction === 'object'
    && typeof httpAction.actionId === 'string' && /^[a-f0-9-]{36}$/.test(httpAction.actionId)
    && typeof httpAction.proposalId === 'string' && /^[a-f0-9-]{36}$/.test(httpAction.proposalId));
  actionIds.push(httpAction.actionId); proposalIds.push(httpAction.proposalId);
  assert.equal(http.status, 0); pass();
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ event: 'coach_workout_set_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed && process.argv[2] !== 'recover') {
      await removeAudit();
      if (actionIds.length) await pool.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=ANY($2::uuid[])', [actorId, actionIds]);
      if (proposalIds.length) await pool.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND id=ANY($2::uuid[])', [actorId, proposalIds]);
      if (seeded) await pool.query('DELETE FROM public.workout_sessions WHERE id=ANY($1::uuid[])', [[sessionId, foreignSessionId]]);
      await pool.query('DROP TRIGGER coach_workout_set_revision ON public.workout_sets; DROP FUNCTION private.advance_coach_workout_set_version(); DROP TABLE private.coach_workout_set_versions;');
      for (const constraint of priorConstraints) {
        assert.ok(['coach_action_proposals_action_check', 'coach_action_proposals_envelope_check'].includes(constraint.name));
        await pool.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT ${constraint.name}; ALTER TABLE private.coach_action_proposals ADD CONSTRAINT ${constraint.name} ${constraint.definition}`);
      }
      pass();
    }
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ event: 'coach_workout_set_sql', check: 'cleanup', outcome: 'failed', ...(typeof (error as { code?: unknown }).code === 'string' ? { sqlstate: (error as { code: string }).code } : {}) })}\n`);
    process.exitCode = 1;
  }
  await pool.end();
});
