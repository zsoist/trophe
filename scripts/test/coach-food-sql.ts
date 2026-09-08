import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import { foodLog } from '../../db/schema/food';
import { createFoodQuantityService } from '../../agents/coach-assistant/food-service';
import { foodQuantityResultSchema } from '../../agents/coach-assistant/food-actions';
import type { FoodQuantityOperation, FoodQuantityProposal } from '../../agents/coach-assistant/food-contracts';
import { createDurablePreferenceService } from '../../lib/workout/durable-preference-actions';
import { applyFoodLogEdit } from '../../lib/food/log-edit-service';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const database = drizzle(pool), service = createFoodQuantityService(database), preferences = createDurablePreferenceService(database);
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const entryId = process.env.COACH_FOOD_ENTRY ?? randomUUID(), foreignEntryId = randomUUID(), foodId = randomUUID();
const conversationId = process.env.COACH_FOOD_CONVERSATION ?? randomUUID(), actionIds: string[] = [], proposalIds: string[] = [];
const httpConversationIds: string[] = [];
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID(), entryId });
const execute = async (operation: FoodQuantityOperation) => foodQuantityResultSchema.parse(await service.execute({ ...scope, operation }));
let check = 'setup', installed = false, originalPreferences: unknown;
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_food_sql', check, outcome: 'passed' }) + '\n');
async function snapshot() {
  const result = await execute({ ...header(), operation: 'food.read' });
  assert.ok(result.ok && 'snapshot' in result); return result.snapshot;
}
async function propose(grams: number) {
  const current = await snapshot();
  const result = await execute({ ...header(), operation: 'food.propose', resourceVersion: current.version, after: { grams } });
  assert.ok(result.ok && 'proposal' in result); proposalIds.push(result.proposal.id); return result.proposal;
}
function apply(proposal: FoodQuantityProposal, actionId = randomUUID()): Extract<FoodQuantityOperation, { operation: 'food.apply' }> {
  actionIds.push(actionId);
  return { ...header(), operation: 'food.apply', proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version, actionId, reviewed: true };
}
async function manual(grams: number) {
  const [existing] = await database.select().from(foodLog).where(eq(foodLog.id, entryId)).limit(1);
  await applyFoodLogEdit({ ctx: { db: database }, existing, input: { grams }, ownerUserId: actorId, correctedBy: actorId });
}
async function cleanupAudit() {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN');
    await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
    const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
    assert.equal(await enabled(), 'O');
    const rows = await connection.query(`SELECT id FROM public.audit_log WHERE actor_id=$1 AND new_value->>'actionId'=ANY($2::text[])
      AND ((action='food_quantity_updated' AND table_name='food_log' AND record_id=$3)
        OR (action='workout_preferences_updated' AND table_name='client_profiles' AND record_id=$1))`, [actorId, actionIds, entryId]);
    const ids = rows.rows.map(row => row.id as string);
    if (ids.length) {
      await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
      const removed = await connection.query(`DELETE FROM public.audit_log WHERE id=ANY($1::bigint[]) AND actor_id=$2 AND new_value->>'actionId'=ANY($3::text[])
        AND ((action='food_quantity_updated' AND table_name='food_log' AND record_id=$4)
          OR (action='workout_preferences_updated' AND table_name='client_profiles' AND record_id=$2)) RETURNING id`, [ids, actorId, actionIds, entryId]);
      assert.equal(removed.rowCount, ids.length);
      await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable');
    }
    assert.equal(await enabled(), 'O'); await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
async function main() {
  if (process.argv[2] === 'recover') {
    const result = await execute({ ...header(), operation: 'food.receipt', actionId: process.env.COACH_FOOD_ACTION! });
    assert.ok(result.ok && 'receipt' in result && result.receipt.status === 'applied' && result.refresh?.entryId === entryId);
    check = 'receipt_recovered_in_new_process'; pass(); return;
  }
  // Parent installs/removes the shared ledger. This child owns only its extension.
  await pool.query(await readFile('db/isolated/coach-food-actions.sql', 'utf8')); installed = true;
  originalPreferences = (await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actorId])).rows[0].workout_preferences;
  await pool.query("INSERT INTO public.foods(id,source,source_id,name_en,kcal_per_100g,protein_per_100g,carb_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g) VALUES($1::uuid,'custom',$1::uuid::text,'Isolated coach rice',200,4,40,2,0.8,0.4)", [foodId]);
  for (const [id, owner] of [[entryId, actorId], [foreignEntryId, coachId]]) {
    await pool.query("INSERT INTO public.food_log(id,user_id,logged_date,food_name,food_id,qty_g,quantity,calories,protein_g,carbs_g,fat_g,fiber_g,sugar_g,source) VALUES($1,$2,'2026-09-07','Isolated coach rice',$3,250,1,500,10,100,5,2,1,'custom')", [id, owner, foodId]);
  }
  check = 'canonical_preview_is_read_only';
  const before = await snapshot(), proposal = await propose(150);
  assert.deepEqual(await snapshot(), before);
  assert.equal(proposal.after.grams, 150); assert.equal(proposal.after.calories, 300); assert.equal(proposal.after.proteinG, 6); pass();
  check = 'concurrent_apply_one_mutation_one_receipt';
  const operation = apply(proposal);
  const results = await Promise.all([execute(operation), execute(operation)]);
  assert.ok(results.every(result => result.ok && 'receipt' in result)); assert.deepEqual(results[0], results[1]);
  const after = await snapshot(); assert.equal(after.grams, 150); assert.equal(BigInt(after.version), BigInt(before.version) + BigInt(1));
  assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, operation.actionId])).rowCount, 1); pass();
  const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-food-sql.ts', 'recover'], { stdio: 'inherit', env: { ...process.env, COACH_FOOD_ENTRY: entryId, COACH_FOOD_CONVERSATION: conversationId, COACH_FOOD_ACTION: operation.actionId } });
  assert.equal(recovery.status, 0);
  check = 'manual_writer_aba_invalidates_review';
  const stale = await propose(100); await manual(200); await manual(150);
  assert.equal((await snapshot()).grams, stale.before.grams);
  assert.deepEqual(await execute(apply(stale)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();
  check = 'canonical_nutrient_change_conflicts_without_entry_write';
  const nutrientProposal = await propose(100), nutrientBefore = await snapshot();
  await pool.query('UPDATE public.foods SET protein_per_100g=8 WHERE id=$1', [foodId]);
  try { assert.deepEqual(await execute(apply(nutrientProposal)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); assert.deepEqual(await snapshot(), nutrientBefore); }
  finally { await pool.query('UPDATE public.foods SET protein_per_100g=4 WHERE id=$1', [foodId]); } pass();
  for (const targetTable of ['receipt', 'audit'] as const) {
    check = `${targetTable}_failure_rolls_back_entry_revision_and_receipt`;
    const failed = apply(await propose(90)), original = await snapshot();
    const table = targetTable === 'receipt' ? 'private.coach_action_receipts' : 'public.audit_log';
    const constraint = targetTable === 'receipt' ? 'isolated_food_receipt_failure' : 'isolated_food_audit_failure';
    await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT ${constraint} CHECK(false) NOT VALID`);
    try { const result = await execute(failed); assert.ok(!result.ok && result.error === 'uncertain'); }
    finally { await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT ${constraint}`); }
    assert.deepEqual(await snapshot(), original);
    assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, failed.actionId])).rowCount, 0); pass();
  }
  check = 'shared_action_id_conflicts_food_to_preferences_and_reverse';
  const preferenceVersion = await preferences.read(scope);
  const pref = await preferences.execute({ ...scope, operation: { version: 'coach-assistant.v2', conversationId, turnId: randomUUID(), operation: 'propose', action: 'preference.update', resourceVersion: preferenceVersion.version, after: { durationMinutes: preferenceVersion.preferences.durationMinutes === 30 ? 45 : 30 } } });
  assert.ok(pref.ok && pref.proposal); proposalIds.push(pref.proposal.id);
  const preferenceApply = { version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID(), operation: 'apply' as const, proposalId: pref.proposal.id, hash: pref.proposal.hash, resourceVersion: pref.proposal.resource.version, actionId: operation.actionId };
  assert.equal((await preferences.execute({ ...scope, operation: preferenceApply })).error, 'idempotency_conflict');
  const prefAction = randomUUID(); actionIds.push(prefAction);
  assert.equal((await preferences.execute({ ...scope, operation: { ...preferenceApply, actionId: prefAction } })).ok, true);
  const collision = await execute(apply(await propose(80), prefAction)); assert.ok(!collision.ok && collision.error === 'idempotency_conflict'); pass();
  check = 'foreign_entry_org_and_revoked_receipt_denied';
  const foreign = await execute({ ...header(), entryId: foreignEntryId, operation: 'food.read' }); assert.ok(!foreign.ok && foreign.error === 'not_found');
  const wrongOrg = foodQuantityResultSchema.parse(await service.execute({ ...scope, organizationId: randomUUID(), operation: { ...header(), operation: 'food.read' } })); assert.ok(!wrongOrg.ok && wrongOrg.error === 'forbidden');
  await pool.query("UPDATE public.organization_members SET role='coach' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]);
  try { const revoked = await execute({ ...header(), operation: 'food.receipt', actionId: operation.actionId }); assert.ok(!revoked.ok && revoked.error === 'forbidden'); }
  finally { await pool.query("UPDATE public.organization_members SET role='client' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]); } pass();
  check = 'authenticated_manual_update_advances_private_revision_without_direct_access';
  const manualBefore = await snapshot(), connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await connection.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: actorId, role: 'authenticated' })]);
    assert.equal((await connection.query("UPDATE public.food_log SET food_name='Isolated reviewed rice' WHERE id=$1 RETURNING id", [entryId])).rowCount, 1);
    await connection.query('COMMIT');
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await assert.rejects(connection.query('SELECT * FROM private.coach_food_entry_versions'), { code: '42501' });
  } finally { await connection.query('ROLLBACK'); connection.release(); }
  assert.equal(BigInt((await snapshot()).version), BigInt(manualBefore.version) + BigInt(1)); pass();
  check = 'flywheel_failure_savepoint_preserves_confirmed_food_write';
  await pool.query("UPDATE public.food_log SET source='photo_ai' WHERE id=$1", [entryId]);
  const capture = apply(await propose(60));
  await pool.query('ALTER TABLE public.food_parse_corrections ADD CONSTRAINT isolated_food_capture_failure CHECK(false) NOT VALID');
  try { const result = await execute(capture); assert.ok(result.ok && 'receipt' in result); assert.equal((await snapshot()).grams, 60); }
  finally { await pool.query('ALTER TABLE public.food_parse_corrections DROP CONSTRAINT isolated_food_capture_failure'); } pass();
  check = 'deleted_entry_retains_receipt_without_reapplying';
  const resurrectedProposal = await propose(50);
  const [deletedRow] = await database.select().from(foodLog).where(eq(foodLog.id, entryId)).limit(1);
  await pool.query('DELETE FROM public.food_log WHERE id=$1 AND user_id=$2', [entryId, actorId]);
  const deleted = await execute(capture); assert.ok(deleted.ok && 'receipt' in deleted);
  assert.equal((await pool.query('SELECT id FROM public.food_log WHERE id=$1', [entryId])).rowCount, 0); pass();
  check = 'delete_recreate_same_uuid_cannot_revive_review';
  await database.insert(foodLog).values(deletedRow);
  const resurrected = await execute(apply(resurrectedProposal)); assert.ok(!resurrected.ok && resurrected.error === 'version_conflict'); pass();

  check = 'food_ui_real_auth_review_receipt_refetch';
  await pool.query("UPDATE public.food_log SET food_name='Isolated coach rice',logged_date=CURRENT_DATE,meal_type='breakfast',source='custom',qty_g=250,quantity=1,calories=500,protein_g=10,carbs_g=100,fat_g=5,fiber_g=2,sugar_g=1 WHERE id=$1 AND user_id=$2", [entryId, actorId]);
  const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
  const manifest = resolve(root, `coach-food-actions-${randomUUID()}.json`);
  await writeFile(manifest, JSON.stringify({ actionIds: [], conversationIds: [] }), { mode: 0o600 });
  const http = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-food.spec.ts'], { stdio: 'inherit', env: {
    ...process.env, E2E_COACH_FOOD: '1', E2E_COACH_DURABLE: '0', E2E_COACH_WEEK: '0', COACH_FOOD_HTTP_ACTIONS: manifest, COACH_FOOD_ENTRY: entryId,
    E2E_CLIENT_ID: actorId, NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED: '1',
    COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_FOOD_ACTIONS_ENABLED: '1',
    COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED: '1', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId,
  } });
  const observed = JSON.parse(await readFile(manifest, 'utf8'));
  const ids = (value: unknown, limit: number): value is string[] => Array.isArray(value) && value.length <= limit && value.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id));
  assert.ok(ids(observed.actionIds, 16) && ids(observed.conversationIds, 4));
  actionIds.push(...observed.actionIds); httpConversationIds.push(...observed.conversationIds); assert.equal(http.status, 0); pass();
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_food_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      await cleanupAudit();
      const uiProposals = await pool.query("SELECT id FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND action='food.quantity.update' AND envelope->'proposal'->'resource'->>'id'=$4", [actorId, organizationId, httpConversationIds, entryId]);
      proposalIds.push(...uiProposals.rows.map(row => row.id as string));
      await pool.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND action_id=ANY($3::uuid[]) AND proposal_id=ANY($4::uuid[])', [actorId, organizationId, actionIds, proposalIds]);
      await pool.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND id=ANY($3::uuid[])', [actorId, organizationId, proposalIds]);
      assert.equal((await pool.query('SELECT id FROM private.coach_action_proposals WHERE id=ANY($1::uuid[])', [proposalIds])).rowCount, 0);
      await pool.query('DELETE FROM public.food_parse_corrections WHERE user_id=$1 AND corrected_by=$1 AND food_log_id=$2', [actorId, entryId]);
      await pool.query('DELETE FROM public.food_log WHERE (id=$1 AND user_id=$2) OR (id=$3 AND user_id=$4)', [entryId, actorId, foreignEntryId, coachId]);
      await pool.query("DELETE FROM public.foods WHERE id=$1::uuid AND source='custom' AND source_id=$1::uuid::text", [foodId]);
      if (originalPreferences !== undefined) await pool.query('UPDATE public.client_profiles SET workout_preferences=$2::jsonb WHERE user_id=$1', [actorId, JSON.stringify(originalPreferences)]);
      await pool.query('DROP TRIGGER coach_food_entry_revision ON public.food_log; DROP FUNCTION private.advance_coach_food_entry_version(); DROP TABLE private.coach_food_entry_versions;');
      check = 'exact_food_fixture_removed_trigger_restored'; pass();
    }
  } catch { process.stderr.write('Isolated Food fixture cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
