/** Dedicated disposable LOCAL full-schema exercise. No remote fallback, models,
 * auth emails, deployment, or mutation of the user's existing local databases. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createTextFoodService } from '../../agents/coach-assistant/text-food-service';
import type { ParsedFoodItem } from '../../agents/schemas/food-parse';
import type { TextFoodOperation, TextFoodProposal } from '../../agents/coach-assistant/text-food-contract';
const target = new URL(process.env.AG1_TEXT_FOOD_FULL_SCHEMA_URL ?? 'about:blank');
if (target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54329' || !/^\/trophe_text_food_ag1_full_[a-z0-9_]+$/.test(target.pathname) || target.username !== 'postgres' || target.search || target.hash) throw Error('dedicated_disposable_local_database_required');
const sqlPath = process.env.AG1_TEXT_FOOD_EXTENSION_SQL ?? '';
if (!sqlPath?.endsWith('/text-intake/qa-action-extension.sql')) throw Error('exact_extension_file_required');
const reportPath = process.env.AG1_TEXT_FOOD_REPORT ?? '';
if (!reportPath?.startsWith('/private/tmp/')) throw Error('local_report_path_required');
const pool = new pg.Pool({ connectionString: target.toString(), max: 4, statement_timeout: 5000 });
const database = drizzle(pool), actor = randomUUID(), peer = randomUUID(), org = randomUUID(), conversationId = randomUUID(), foodId = randomUUID();
let calls = 0;
const item: ParsedFoodItem = { raw_text: '100g fixture rice', food_name: 'AG1 fixture rice', name_localized: 'AG1 fixture rice', quantity: 100, unit: 'g', grams: 100, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, sugar_g: 0, confidence: 0.9, source: 'local_db', db_food_id: foodId, portion_explicit: true };
const service = createTextFoodService(database as never, async () => { calls++; return { items: [{ ...item }, { ...item, source: 'ai_estimate', db_food_id: null }] }; });
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID() });
const execute = (operation: TextFoodOperation, subjectId = actor) => service.execute({ actorId: actor, subjectId, organizationId: org, operation, signal: new AbortController().signal });
const checks: Array<{ check: string; outcome: string }> = [];
const pass = (check: string) => { checks.push({ check, outcome: 'passed' }); process.stdout.write(JSON.stringify(checks.at(-1)) + '\n'); };
async function propose() {
  const requestId = randomUUID();
  const parsed = await execute({ ...header(), operation: 'text.food.parse', requestId, text: 'I ate 100g fixture rice and 100g fixture rice', language: 'en' });
  assert.ok(parsed.ok && 'draft' in parsed, JSON.stringify(parsed));
  const proposal = await execute({ ...header(), operation: 'text.food.propose', draftId: parsed.draft.id, hash: parsed.draft.hash, after: { loggedDate: '2026-09-12', mealType: 'lunch', items: [{ index: 0, grams: 150 }, { index: 1, grams: 200 }] } });
  assert.ok(proposal.ok && 'proposal' in proposal, JSON.stringify(proposal));
  return proposal.proposal;
}
const apply = (p: TextFoodProposal, actionId = randomUUID()): TextFoodOperation => ({ ...header(), operation: 'text.food.apply', proposalId: p.id, hash: p.hash, actionId, reviewed: true });
async function main(){
try {
  assert.equal((await pool.query('SELECT current_database() AS name')).rows[0].name, target.pathname.slice(1));
  assert.ok(Number((await pool.query('SELECT count(*) FROM drizzle.__drizzle_migrations')).rows[0].count) > 80);
  for (const id of [actor, peer]) {
    await pool.query('INSERT INTO auth.users(id,email) VALUES($1,$2)', [id, `${id}@ag1.invalid`]);
    await pool.query("INSERT INTO public.profiles(id,full_name,email,role,timezone,language) VALUES($1,'AG1 synthetic',$2,'client','America/Bogota','en')", [id, `${id}@ag1.invalid`]);
    await pool.query('INSERT INTO public.client_profiles(user_id) VALUES($1)', [id]);
  }
  await pool.query("INSERT INTO public.organizations(id,name,slug,owner_id) VALUES($1,'AG1 isolated',$2,$3)", [org, `ag1-${org}`, actor]);
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES($1,$2,'client'),($1,$3,'client')", [org, actor, peer]);
  await pool.query("INSERT INTO private.coach_chat_threads(id,actor_id,subject_id,organization_id,actor_role,request_id,create_hash,title) VALUES($1,$2,$2,$3,'client',$4,$5,'AG1 local Food test')", [conversationId, actor, org, randomUUID(), 'a'.repeat(64)]);
  await pool.query("INSERT INTO public.foods(id,source,name_en,kcal_per_100g,protein_per_100g,carb_per_100g,fat_per_100g,fiber_per_100g,sugar_per_100g) VALUES($1,'custom','AG1 fixture rice',130,2.7,28,0.3,0.4,0)", [foodId]);
  const blocked = await execute({ ...header(), operation: 'text.food.parse', requestId: randomUUID(), text: '100g rice', language: 'en' });
  assert.deepEqual(blocked, { ok: false, error: 'not_connected' }); assert.equal(calls, 0); pass('schema_hold_refuses_before_parser');
  const ddl = await readFile(sqlPath, 'utf8');
  await pool.query(ddl); pass('exact_pending_extension_applies_to_disposable_full_schema_only');
  const p = await propose(); assert.equal((await pool.query('SELECT count(*) FROM public.food_log WHERE user_id=$1', [actor])).rows[0].count, '0'); pass('parse_and_review_do_not_write');
  const operation = apply(p);
  const [first, second] = await Promise.all([execute(operation), execute(operation)]);
  assert.deepEqual(second, first); assert.ok(first.ok && 'receipt' in first, JSON.stringify(first));
  const rows = (await pool.query('SELECT id,user_id,source,food_id,qty_g,calories FROM public.food_log WHERE id=ANY($1::uuid[]) ORDER BY calories', [p.entryIds])).rows;
  assert.equal(rows.length, 2); assert.deepEqual(rows.map(row => row.calories), [195, 260]); assert.ok(rows.every(row => row.user_id === actor && row.source === 'natural_language'));
  assert.equal((await pool.query('SELECT count(*) FROM private.coach_action_receipts WHERE actor_id=$1 AND proposal_id=$2', [actor, p.id])).rows[0].count, '1');
  assert.equal((await pool.query("SELECT count(*) FROM public.audit_log WHERE actor_id=$1 AND action='text_food_created'", [actor])).rows[0].count, '1'); pass('concurrent_confirm_single_atomic_meal_receipt_audit_and_native_readback');
  if (operation.operation !== 'text.food.apply') throw Error('operation');
  assert.deepEqual(await execute({ ...header(), operation: 'text.food.receipt', actionId: operation.actionId }), first); pass('lost_response_recovers_same_receipt');
  assert.deepEqual(await execute(apply(p)), { ok: false, error: 'conflict' });
  assert.deepEqual(await execute({ ...header(), operation: 'text.food.read', proposalId: p.id }, peer), { ok: false, error: 'forbidden' }); pass('consumed_proposal_and_foreign_subject_rejected');
  const cx = await pool.connect();
  try {
    await cx.query('BEGIN'); await cx.query('SET LOCAL ROLE authenticated'); await cx.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [peer]);
    assert.equal((await cx.query('SELECT count(*) FROM public.food_log WHERE id=ANY($1::uuid[])', [p.entryIds])).rows[0].count, '0');
    await assert.rejects(cx.query('SELECT id FROM private.coach_action_proposals LIMIT 1'), { code: '42501' });
  } finally { await cx.query('ROLLBACK'); cx.release(); }
  pass('authenticated_peer_food_rls_and_private_proposal_acl');
  const drift = await propose(); await pool.query('UPDATE public.foods SET kcal_per_100g=999 WHERE id=$1', [foodId]);
  assert.deepEqual(await execute(apply(drift)), { ok: false, error: 'conflict' });
  assert.equal((await pool.query('SELECT count(*) FROM public.food_log WHERE id=ANY($1::uuid[])', [drift.entryIds])).rows[0].count, '0'); pass('catalogue_drift_prevents_stale_insert');
  await pool.query('UPDATE public.foods SET kcal_per_100g=130 WHERE id=$1', [foodId]);
  const missing = await propose(); await pool.query('DELETE FROM public.foods WHERE id=$1', [foodId]);
  assert.deepEqual(await execute(apply(missing)), { ok: false, error: 'conflict' }); pass('missing_catalogue_reference_prevents_dangling_food_id');
  await pool.query("UPDATE private.coach_chat_threads SET state='cleanup_pending' WHERE id=$1", [conversationId]);
  assert.deepEqual(await execute({ ...header(), operation: 'text.food.receipt', actionId: operation.actionId }), { ok: false, error: 'forbidden' }); pass('revoked_chat_blocks_receipt_access');
  await writeFile(reportPath, JSON.stringify({ outcome: 'passed', checks, parser: 'injected synthetic only', paidCalls: 0, database: 'dedicated loopback full Drizzle schema with compatibility auth, not live Supabase Auth', migration: 'exact prepared extension tested only in disposable database' }, null, 2) + '\n');
} catch (error) {
  await writeFile(reportPath, JSON.stringify({ outcome: 'failed', checks, message: error instanceof Error ? error.message : 'unknown' }, null, 2) + '\n');
  throw error;
} finally { await pool.end(); }

}
main().catch(error=>{console.error(error);process.exitCode=1;});
