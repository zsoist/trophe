/** PREPARED, NOT EXECUTED. Parent must provision its existing diet DDL and keep
 * the shared ledger alive. This child neither installs nor drops schema. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createFoodPreferenceService } from '../../agents/coach-assistant/food-preference-service';
import { foodPreferenceResultSchema } from '../../agents/coach-assistant/food-preference-actions';
import type { FoodPreferenceOperation, FoodPreferenceProposal } from '../../agents/coach-assistant/food-preference-contracts';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322'
  && target.pathname === '/postgres' && target.username === 'postgres' && target.password === 'postgres'
  && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, organizationId]) assert.match(id, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const service = createFoodPreferenceService(drizzle(pool));
const conversationId = process.env.COACH_DIET_CONVERSATION ?? randomUUID();
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID(), profileId: actorId });
const execute = async (operation: FoodPreferenceOperation) => foodPreferenceResultSchema.parse(await service.execute({ ...scope, operation }));
const proposals: string[] = [], actions: string[] = [];
let check = 'schema_precondition', baseline: Record<string, unknown> | undefined;
let revision: string | undefined, parentReceipts: unknown[], parentProposals: unknown[];
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_diet_sql', check, outcome: 'passed' }) + '\n');
const profile = async () => (await pool.query('SELECT to_jsonb(cp) AS row FROM public.client_profiles cp WHERE user_id=$1', [actorId])).rows[0]?.row;
const ledger = async (table: 'coach_action_receipts' | 'coach_action_proposals') => (await pool.query(`SELECT * FROM private.${table} WHERE actor_id=$1 ORDER BY id`, [actorId])).rows;
async function snapshot() {
  const result = await execute({ ...header(), operation: 'diet.read' });
  assert.ok(result.ok && 'snapshot' in result); return result.snapshot;
}
async function propose() {
  const before = await snapshot();
  const after = { version: 1 as const, dietPattern: before.preferences.dietPattern === 'vegan' ? 'vegetarian' as const : 'vegan' as const };
  const result = await execute({ ...header(), operation: 'diet.propose', resourceVersion: before.version, after });
  assert.ok(result.ok && 'proposal' in result); proposals.push(result.proposal.id);
  assert.deepEqual(result.proposal.before, before.preferences); assert.deepEqual(result.proposal.after, after);
  return result.proposal;
}
function apply(proposal: FoodPreferenceProposal): Extract<FoodPreferenceOperation, { operation: 'diet.apply' }> {
  const actionId = randomUUID(); actions.push(actionId);
  return { ...header(), operation: 'diet.apply', proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version, actionId, reviewed: true };
}
async function main() {
  if (process.argv[2] === 'recover') {
    const result = await execute({ ...header(), operation: 'diet.receipt', actionId: process.env.COACH_DIET_ACTION! });
    assert.ok(result.ok && 'receipt' in result); assert.equal(result.receipt.id, process.env.COACH_DIET_RECEIPT);
    check = 'receipt_recovered_in_new_node_process'; pass(); return;
  }
  // No mutation until all required parent-owned schema and cleanup baselines exist.
  assert.equal((await pool.query("SELECT to_regclass('private.coach_food_preference_versions') IS NOT NULL AS ready")).rows[0].ready, true);
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='private.coach_food_preference_versions'::regclass")).rows[0].relrowsecurity, true);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid='public.client_profiles'::regclass AND tgname='coach_food_preference_revision' AND tgenabled='O'")).rows[0].n, 1);
  const original = await profile(); assert.ok(original && 'food_preferences' in original);
  revision = (await pool.query('SELECT revision::text FROM private.coach_food_preference_versions WHERE subject_id=$1', [actorId])).rows[0]?.revision;
  assert.ok(revision !== undefined);
  parentReceipts = structuredClone(await ledger('coach_action_receipts'));
  parentProposals = structuredClone(await ledger('coach_action_proposals'));
  assert.equal((await pool.query('SELECT role::text FROM public.organization_members WHERE user_id=$1 AND org_id=$2', [actorId, organizationId])).rows[0]?.role, 'client');
  baseline = original;
  check = 'review_is_read_only';
  const before = await snapshot(), p = await propose();
  assert.deepEqual(await snapshot(), before); assert.deepEqual(await profile(), baseline); pass();
  check = 'concurrent_apply_exact_preference_and_one_receipt';
  const operation = apply(p), results = await Promise.all([execute(operation), execute(operation)]);
  assert.deepEqual(results[0], results[1]); const result = results[0]; assert.ok(result.ok && 'receipt' in result);
  assert.deepEqual((await snapshot()).preferences, p.after);
  assert.equal((await snapshot()).version, result.receipt.resourceVersion);
  assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, operation.actionId])).rowCount, 1); pass();
  check = 'retry_and_receipt_do_not_reapply';
  const applied = await snapshot(); assert.deepEqual(await execute(operation), result);
  assert.deepEqual(await execute({ ...header(), operation: 'diet.receipt', actionId: operation.actionId }), result);
  assert.deepEqual(await snapshot(), applied); pass();
  const recovered = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-diet-sql.ts', 'recover'], { stdio: 'inherit', timeout: 30000,
    env: { ...process.env, COACH_DIET_CONVERSATION: conversationId, COACH_DIET_ACTION: operation.actionId, COACH_DIET_RECEIPT: result.receipt.id } });
  assert.equal(recovered.status, 0);
  check = 'competing_reviews_use_cas';
  const one = await propose(), two = await propose();
  assert.ok((await execute(apply(one))).ok);
  const afterWinner = await snapshot();
  assert.deepEqual(await execute(apply(two)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' });
  assert.deepEqual(await snapshot(), afterWinner); pass();
  check = 'manual_aba_invalidates_review';
  const stale = await propose(), beforeAba = await snapshot();
  await pool.query('UPDATE public.client_profiles SET food_preferences=$2::jsonb WHERE user_id=$1', [actorId, JSON.stringify(stale.after)]);
  await pool.query('UPDATE public.client_profiles SET food_preferences=$2::jsonb WHERE user_id=$1', [actorId, JSON.stringify(beforeAba.preferences)]);
  const afterAba = await snapshot(); assert.notEqual(afterAba.version, beforeAba.version);
  assert.deepEqual(await execute(apply(stale)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' });
  assert.deepEqual(await snapshot(), afterAba); pass();
  check = 'foreign_scope_and_revoked_receipt_denied';
  assert.deepEqual(await execute({ ...header(), profileId: randomUUID(), operation: 'diet.read' }), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'forbidden' });
  const foreignOrg = foodPreferenceResultSchema.parse(await service.execute({ ...scope, organizationId: randomUUID(), operation: { ...header(), operation: 'diet.read' } }));
  assert.ok(!foreignOrg.ok && foreignOrg.error === 'forbidden');
  const otherThread = await execute({ ...header(), conversationId: randomUUID(), operation: 'diet.receipt', actionId: operation.actionId });
  assert.ok(!otherThread.ok && otherThread.error === 'idempotency_conflict');
  await pool.query("UPDATE public.organization_members SET role='coach' WHERE user_id=$1 AND org_id=$2", [actorId, organizationId]);
  try { const revoked = await execute({ ...header(), operation: 'diet.receipt', actionId: operation.actionId }); assert.ok(!revoked.ok && revoked.error === 'forbidden'); }
  finally { await pool.query("UPDATE public.organization_members SET role='client' WHERE user_id=$1 AND org_id=$2", [actorId, organizationId]); }
  pass();
  for (const table of ['private.coach_action_receipts', 'public.audit_log'] as const) {
    check = `${table.endsWith('audit_log') ? 'audit' : 'receipt'}_failure_rolls_back_profile_revision`;
    const failed = apply(await propose()), prior = await snapshot(), priorRow = await profile();
    await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT isolated_diet_insert_failure CHECK(false) NOT VALID`);
    try { const rejected = await execute(failed); assert.ok(!rejected.ok && rejected.error === 'uncertain'); }
    finally { await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT isolated_diet_insert_failure`); }
    assert.deepEqual(await snapshot(), prior); assert.deepEqual(await profile(), priorRow);
    assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, failed.actionId])).rowCount, 0);
    assert.equal((await pool.query("SELECT id FROM public.audit_log WHERE actor_id=$1 AND table_name='client_profiles' AND action='food_preference_updated' AND new_value->>'actionId'=$2", [actorId, failed.actionId])).rowCount, 0); pass();
  }
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_diet_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (baseline) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
        const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
        assert.equal(await enabled(), 'O');
        await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
        await connection.query("DELETE FROM public.audit_log WHERE actor_id=$1 AND record_id=$1 AND table_name='client_profiles' AND action='food_preference_updated' AND new_value->>'actionId'=ANY($2::text[])", [actorId, actions]);
        await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable'); assert.equal(await enabled(), 'O');
        await connection.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=$3 AND action_id=ANY($4::uuid[]) AND proposal_id=ANY($5::uuid[])', [actorId, organizationId, conversationId, actions, proposals]);
        await connection.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=$3 AND id=ANY($4::uuid[])', [actorId, organizationId, conversationId, proposals]);
        await connection.query('UPDATE public.client_profiles SET food_preferences=$2::jsonb,updated_at=$3::timestamptz WHERE user_id=$1', [actorId, JSON.stringify(baseline.food_preferences), baseline.updated_at]);
        await connection.query('UPDATE private.coach_food_preference_versions SET revision=$2::bigint WHERE subject_id=$1', [actorId, revision]);
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
      assert.deepEqual(await profile(), baseline);
      assert.equal((await pool.query('SELECT revision::text FROM private.coach_food_preference_versions WHERE subject_id=$1', [actorId])).rows[0].revision, revision);
      assert.deepEqual(await ledger('coach_action_receipts'), parentReceipts!);
      assert.deepEqual(await ledger('coach_action_proposals'), parentProposals!);
      check = 'exact_diet_fixture_removed_parent_rows_preserved'; pass();
    }
  } catch { process.stderr.write('Isolated diet fixture cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
