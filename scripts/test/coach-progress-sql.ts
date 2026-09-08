/** Child of the disposable Progress fixture. Never installs or drops schema. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { executeProgressAction, progressResultSchema, type ProgressOperation } from '../../agents/coach-assistant/progress-actions';
import { createProgressService } from '../../agents/coach-assistant/progress-service';
import { createServerRepository } from '../../agents/coach-assistant/server-repository';
import type { MeasurementProposal, ProgressResult } from '../../agents/coach-assistant/progress-contracts';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
  && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const manifest = process.env.COACH_PROGRESS_SQL_MANIFEST!; assert.ok(manifest);
const conversationId = process.env.COACH_PROGRESS_CONVERSATION ?? randomUUID();
const pool = new Pool({ connectionString: target.toString(), max: 8, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const database = drizzle(pool), service = createProgressService(database), repository = createServerRepository(pool);
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const tracked = { measurementIds: [] as string[], conversationIds: [conversationId], actionIds: [] as string[] };
const save = () => writeFileSync(manifest, JSON.stringify(tracked), { mode: 0o600 }); save();
let check = 'schema_precondition';
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_progress_sql', check, outcome: 'passed' }) + '\n');
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID(), clientId: actorId });
const execute = async (operation: ProgressOperation) => progressResultSchema.parse(await executeProgressAction(actorId, operation, repository, service, new AbortController().signal));
async function read(days: 30 | 90 | 365 = 90) { const result = await execute({ ...header(), operation: 'progress.read', days }); assert.ok(result.ok && 'snapshot' in result); return result.snapshot; }
async function propose(input?: { measuredDate: string; weightKg: number; bodyFatPct: number | null; waistCm: number | null }) {
  const before = await read(); const after = input ?? { measuredDate: before.window.end, weightKg: 76.25, bodyFatPct: 18.5, waistCm: 81.25 };
  const result = await execute({ ...header(), operation: 'measurement.propose', resourceVersion: before.version, after, inputSource: 'explicit_user' });
  assert.ok(result.ok && 'proposal' in result); return result.proposal;
}
function apply(proposal: MeasurementProposal) { const actionId = randomUUID(); tracked.actionIds.push(actionId); save(); return { ...header(), operation: 'measurement.apply' as const, proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version, actionId, reviewed: true as const }; }
const revision = async (subject = actorId) => (await pool.query('SELECT revision::text FROM private.coach_measurement_scope_versions WHERE subject_id=$1', [subject])).rows[0]?.revision as string;
const add = async (owner: string, daysAgo: number, weight: number) => { const id = randomUUID(); tracked.measurementIds.push(id); save(); await pool.query("INSERT INTO public.measurements(id,user_id,measured_date,weight_kg,body_fat_pct,waist_cm) VALUES($1,$2,(statement_timestamp() AT TIME ZONE 'America/Bogota')::date-$3::int,$4,NULL,NULL)", [id, owner, daysAgo, weight]); return id; };

async function main() {
  if (process.argv[2] === 'recover') {
    const result = await execute({ ...header(), operation: 'measurement.receipt', actionId: process.env.COACH_PROGRESS_ACTION! });
    assert.ok(result.ok && 'receipt' in result); assert.equal(result.receipt.id, process.env.COACH_PROGRESS_RECEIPT); check = 'receipt_recovered_in_new_node_process'; pass(); return;
  }
  assert.equal((await pool.query("SELECT to_regclass('private.coach_measurement_scope_versions') IS NOT NULL AS ready")).rows[0].ready, true);
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='private.coach_measurement_scope_versions'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgname LIKE 'coach_measurement_%' AND tgenabled='O'")).rows[0].n, 7);
  await assert.rejects(pool.query('TRUNCATE public.measurements'), { code: 'P0001' });
  await assert.rejects(pool.query("INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at) VALUES($1,$2,$2,$3,$4,'measurement.delete',$5,'1','{}'::jsonb,now()+interval '1 minute')", [randomUUID(), actorId, organizationId, conversationId, 'a'.repeat(64)]), { code: '23514' });
  pass();

  check = 'calendar_windows_dst_and_units';
  const offsets = [0, 0, 29, 30, 89, 90, 364, 365];
  for (let index = 0; index < offsets.length; index++) await add(actorId, offsets[index], 70 + index);
  const thirty = await read(30), ninety = await read(90), year = await read(365);
  assert.equal(thirty.measurements.length, 3); assert.equal(ninety.measurements.length, 5); assert.equal(year.measurements.length, 7);
  assert.deepEqual(thirty.trends.find(item => item.metric === 'weightKg'), { metric: 'weightKg', unit: 'kg', observations: 3, days: 2, first: { date: thirty.window.start, value: 72, sourceIds: [tracked.measurementIds[2]] }, last: { date: thirty.window.end, value: 70.5, sourceIds: tracked.measurementIds.slice(0, 2) }, change: -1.5, aggregation: 'daily_mean', status: 'available' });
  const dst = await pool.query("SELECT ('2026-03-08 04:30+00'::timestamptz AT TIME ZONE 'America/New_York')::date::text AS before,('2026-03-08 07:30+00'::timestamptz AT TIME ZONE 'America/New_York')::date::text AS after");
  assert.deepEqual(dst.rows[0], { before: '2026-03-07', after: '2026-03-08' });
  const invalid = await executeProgressAction(actorId, { ...header(), operation: 'progress.read', days: 31 }, repository, service, new AbortController().signal); assert.deepEqual(invalid, { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'invalid_input' });
  for (const after of [{ measuredDate: year.window.end, weightKg: 0, bodyFatPct: null, waistCm: null }, { measuredDate: year.window.end, weightKg: 70, bodyFatPct: 101, waistCm: null }, { measuredDate: year.window.end, weightKg: 70, bodyFatPct: null, waistCm: -1 }]) {
    assert.deepEqual(await executeProgressAction(actorId, { ...header(), operation: 'measurement.propose', resourceVersion: year.version, after, inputSource: 'explicit_user' }, repository, service, new AbortController().signal), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'invalid_input' });
  }
  const edges = await propose({ measuredDate: year.window.end, weightKg: 70, bodyFatPct: 0, waistCm: null }); assert.equal(edges.after.bodyFatPct, 0); pass();

  check = 'native_crud_owner_transfer_and_aba_revision';
  const beforeCrud = BigInt(await revision()), native = await add(actorId, 1, 78);
  await pool.query('UPDATE public.measurements SET weight_kg=79 WHERE id=$1', [native]); await pool.query('DELETE FROM public.measurements WHERE id=$1', [native]);
  assert.equal(BigInt(await revision()), beforeCrud + BigInt(3));
  const stale = await propose(), beforeAba = await read(); const moved = await add(actorId, 2, 77);
  await pool.query('UPDATE public.measurements SET user_id=$2 WHERE id=$1', [moved, coachId]); await pool.query('UPDATE public.measurements SET user_id=$2 WHERE id=$1', [moved, actorId]);
  assert.notEqual((await read()).version, beforeAba.version); assert.deepEqual(await execute(apply(stale)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();

  check = 'concurrent_apply_idempotency_and_lost_response';
  const proposal = await propose(), operation = apply(proposal), results = await Promise.all([execute(operation), execute(operation)]);
  assert.deepEqual(results[0], results[1]); const applied = results[0]; assert.ok(applied.ok && 'receipt' in applied); tracked.measurementIds.push(proposal.id); save();
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.measurements WHERE id=$1', [proposal.id])).rows[0].n, 1);
  assert.deepEqual(await execute(operation), applied); assert.deepEqual(await execute({ ...header(), operation: 'measurement.receipt', actionId: operation.actionId }), applied);
  const { spawnSync } = await import('node:child_process');
  const recovered = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-progress-sql.ts', 'recover'], { stdio: 'inherit', timeout: 30000, env: { ...process.env, COACH_PROGRESS_CONVERSATION: conversationId, COACH_PROGRESS_ACTION: operation.actionId, COACH_PROGRESS_RECEIPT: applied.receipt.id } });
  assert.equal(recovered.status, 0); pass();

  check = 'scope_rls_and_revoked_receipt';
  const foreign = await executeProgressAction(actorId, { ...header(), clientId: coachId, operation: 'progress.read', days: 30 }, repository, service, new AbortController().signal); assert.ok(!foreign.ok && foreign.error === 'forbidden');
  const rlsId = randomUUID(); tracked.measurementIds.push(rlsId); save(); const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated'); await connection.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [actorId]);
    await connection.query('INSERT INTO public.measurements(id,user_id,measured_date,weight_kg) VALUES($1,$2,CURRENT_DATE,71)', [rlsId, actorId]);
    await assert.rejects(connection.query('INSERT INTO public.measurements(id,user_id,measured_date,weight_kg) VALUES($1,$2,CURRENT_DATE,71)', [randomUUID(), coachId]), { code: '42501' });
    await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; } finally { connection.release(); }
  const membership = await pool.query("UPDATE public.organization_members SET role='coach' WHERE user_id=$1 AND org_id=$2 RETURNING role", [actorId, organizationId]); assert.equal(membership.rowCount, 1);
  try { const denied = await execute({ ...header(), operation: 'measurement.receipt', actionId: operation.actionId }); assert.ok(!denied.ok && denied.error === 'forbidden'); }
  finally { await pool.query("UPDATE public.organization_members SET role='client' WHERE user_id=$1 AND org_id=$2", [actorId, organizationId]); }
  pass();

  for (const table of ['private.coach_action_receipts', 'public.audit_log'] as const) {
    check = `${table.endsWith('audit_log') ? 'audit' : 'receipt'}_failure_rolls_back_measurement_revision`;
    const doomedProposal = await propose(), doomed = apply(doomedProposal), versionBefore = await revision();
    await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT isolated_progress_insert_failure CHECK(false) NOT VALID`);
    try { const rejected = await execute(doomed); assert.ok(!rejected.ok && rejected.error === 'uncertain'); }
    finally { await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT isolated_progress_insert_failure`); }
    assert.equal(await revision(), versionBefore); assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.measurements WHERE id=$1', [doomedProposal.id])).rows[0].n, 0);
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, doomed.actionId])).rows[0].n, 0); pass();
  }
}

main().catch(error => { process.stderr.write(JSON.stringify({ event: 'coach_progress_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1; }).finally(async () => { save(); await pool.end(); });
