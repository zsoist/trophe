// Disposable CI memory persistence checks, invoked while the parent action ledger exists.
// No productive database target is allowed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool, type PoolClient } from 'pg';
import { createDurablePreferenceService } from '../../lib/workout/durable-preference-actions';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createPersistentMemoryService } from '../../agents/coach-assistant/memory-service';
import { persistentMemoryResultSchema, type PersistentMemoryOperation, type PersistentMemoryProposal } from '../../agents/coach-assistant/memory-contracts';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const database = drizzle(pool), service = createPersistentMemoryService(database), preferenceService = createDurablePreferenceService(database);
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const conversationId = process.env.COACH_MEMORY_CONVERSATION ?? randomUUID();
const cleanupConversations = [conversationId];
let uiManifest: string | undefined;
const legacyId = randomUUID(), memoryIds: string[] = [], proposalIds: string[] = [], actionIds: string[] = [];
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID() });
const execute = async (operation: PersistentMemoryOperation) => persistentMemoryResultSchema.parse(await service.execute({ ...scope, operation }));
let installed = false, check = 'setup';
let retainedParentReceipt: Record<string, unknown> | undefined;
let baselinePolicies: unknown[] = [];
let baselineConstraints: Array<{name:string;definition:string}> = [];
const constraints = async () => (await pool.query<{name:string;definition:string}>("SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='private.coach_action_proposals'::regclass AND conname IN ('coach_action_proposals_action_check','coach_action_proposals_envelope_check') ORDER BY conname")).rows;
const policies = async () => (await pool.query("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='memory_chunks' ORDER BY policyname")).rows;
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_memory_sql', check, outcome: 'passed' }) + '\n');
async function snapshot() {
  const result = await execute({ ...header(), operation: 'memory.read' });
  assert.ok(result.ok && 'memories' in result); return result;
}
async function proposal(operation: PersistentMemoryOperation) {
  const result = await execute(operation); assert.ok(result.ok && 'proposal' in result);
  proposalIds.push(result.proposal.id);
  if (result.proposal.action === 'memory.confirm') memoryIds.push(result.proposal.resource.id);
  return result.proposal;
}
const propose = (text: string) => proposal({ ...header(), operation: 'memory.propose', action: 'memory.confirm', after: { text, source: 'user_input', retention: 'persistent' } });
function apply(p: PersistentMemoryProposal, actionId = randomUUID()): Extract<PersistentMemoryOperation, { operation: 'memory.apply' }> {
  actionIds.push(actionId);
  return { ...header(), operation: 'memory.apply', proposalId: p.id, hash: p.hash, resourceVersion: p.resource.version, actionId, reviewed: true };
}
async function authenticated<T>(userId: string, work: (connection: PoolClient) => Promise<T>) {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await connection.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: userId, role: 'authenticated' })]);
    const value = await work(connection); await connection.query('COMMIT'); return value;
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
async function cleanupAudit() {
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('LOCK TABLE public.audit_log IN ACCESS EXCLUSIVE MODE');
    const enabled = async () => (await connection.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='public.audit_log'::regclass AND tgname='audit_log_immutable'")).rows[0]?.tgenabled;
    assert.equal(await enabled(), 'O');
    const rows = await connection.query("SELECT id FROM public.audit_log WHERE actor_id=$1 AND table_name='memory_chunks' AND record_id=ANY($2::uuid[]) AND action=ANY($3::text[]) AND new_value->>'actionId'=ANY($4::text[])", [actorId, memoryIds, ['memory.confirm', 'memory.correct', 'memory.delete'], actionIds]);
    const ids = rows.rows.map(row => row.id as string);
    if (ids.length) {
      await connection.query('ALTER TABLE public.audit_log DISABLE TRIGGER audit_log_immutable');
      const removed = await connection.query("DELETE FROM public.audit_log WHERE id=ANY($1::bigint[]) AND actor_id=$2 AND table_name='memory_chunks' AND record_id=ANY($3::uuid[]) AND new_value->>'actionId'=ANY($4::text[]) RETURNING id", [ids, actorId, memoryIds, actionIds]);
      assert.equal(removed.rowCount, ids.length);
      await connection.query('ALTER TABLE public.audit_log ENABLE TRIGGER audit_log_immutable');
    }
    assert.equal(await enabled(), 'O'); await connection.query('COMMIT');
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
}
async function main() {
  if (process.argv[2] === 'recover') {
    const result = await execute({ ...header(), operation: 'memory.receipt', actionId: process.env.COACH_MEMORY_ACTION! });
    assert.ok(result.ok && 'receipt' in result && result.receipt.id === process.env.COACH_MEMORY_RECEIPT);
    check = 'receipt_recovered_in_new_node_process'; pass(); return;
  }
  // Parent owns shared ledger. Check the DDL's fail-closed precondition inside
  // a transaction whose ROLLBACK restores the original RLS setting.
  baselinePolicies = await policies();
  baselineConstraints = await constraints();
  assert.equal(baselineConstraints.length, 2);
  const ddl = await readFile('db/isolated/coach-memory-actions.sql', 'utf8');
  const precondition = await pool.connect();
  try {
    await precondition.query('BEGIN');
    await precondition.query('ALTER TABLE public.memory_chunks DISABLE ROW LEVEL SECURITY');
    await assert.rejects(precondition.query(ddl), { code: 'P0001' });
  } finally { await precondition.query('ROLLBACK'); precondition.release(); }
  check = 'disabled_rls_baseline_rejected_before_installation'; pass();
  const install = await pool.connect();
  try {
    await install.query('BEGIN'); await install.query(ddl); await install.query('COMMIT'); installed = true;
  } catch (error) { await install.query('ROLLBACK'); throw error; }
  finally { install.release(); }
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.memory_chunks'::regclass")).rows[0].relrowsecurity, true);
  check = 'review_does_not_create_canonical_memory';
  const empty = await snapshot(), firstProposal = await propose('Prefer short morning workouts.');
  assert.deepEqual(await snapshot(), empty);
  assert.equal((await pool.query('SELECT id FROM public.memory_chunks WHERE id=$1', [firstProposal.resource.id])).rowCount, 0); pass();
  check = 'concurrent_confirmation_one_memory_binding_receipt';
  const firstApply = apply(firstProposal), results = await Promise.all([execute(firstApply), execute(firstApply)]);
  assert.ok(results.every(result => result.ok && 'receipt' in result)); assert.deepEqual(results[0], results[1]);
  const firstResult = results[0]; assert.ok(firstResult.ok && 'receipt' in firstResult);
  const confirmed = await snapshot(); assert.equal(confirmed.memories.length, 1); assert.equal(confirmed.scopeRevision, '1');
  assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, firstApply.actionId])).rowCount, 1); pass();
  check = 'shared_action_identity_conflicts_memory_and_preferences_both_directions';
  const preferencesBefore = await preferenceService.read(scope);
  const preferenceProposal = await preferenceService.execute({ ...scope, operation: { ...header(), operation: 'propose', action: 'preference.update', resourceVersion: preferencesBefore.version, after: { durationMinutes: preferencesBefore.preferences.durationMinutes === 20 ? 30 : 20 } } });
  assert.ok(preferenceProposal.ok && preferenceProposal.proposal);
  proposalIds.push(preferenceProposal.proposal.id);
  const preferencesCollision = await preferenceService.execute({ ...scope, operation: { ...header(), operation: 'apply', proposalId: preferenceProposal.proposal.id, hash: preferenceProposal.proposal.hash, resourceVersion: preferenceProposal.proposal.resource.version, actionId: firstApply.actionId } });
  assert.ok(!preferencesCollision.ok && preferencesCollision.error === 'idempotency_conflict');
  assert.deepEqual(await preferenceService.read(scope), preferencesBefore);
  const parentReceipt = (await pool.query(`SELECT r.* FROM private.coach_action_receipts r
    JOIN private.coach_action_proposals p ON p.id=r.proposal_id
    WHERE r.actor_id=$1 AND r.subject_id=$1 AND r.organization_id=$2 AND p.action='preference.update'
    ORDER BY r.action_id LIMIT 1`, [actorId, organizationId])).rows[0];
  assert.ok(parentReceipt?.action_id, 'parent_preference_fixture_required');
  retainedParentReceipt = structuredClone(parentReceipt);
  const memoryBeforeCollision = await snapshot();
  const collisionProposal = await propose('Do not write from a reused preference action.');
  const memoryCollision = await execute(apply(collisionProposal, parentReceipt.action_id));
  assert.ok(!memoryCollision.ok && memoryCollision.error === 'idempotency_conflict');
  assert.deepEqual(await snapshot(), memoryBeforeCollision); pass();
  const recovered = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-memory-sql.ts', 'recover'], { stdio: 'inherit', env: { ...process.env, COACH_MEMORY_CONVERSATION: conversationId, COACH_MEMORY_ACTION: firstApply.actionId, COACH_MEMORY_RECEIPT: firstResult.receipt.id } });
  assert.equal(recovered.status, 0);
  check = 'correction_and_deletion_invalidate_current_memory';
  const memory = confirmed.memories[0];
  const correction = await proposal({ ...header(), operation: 'memory.correct', memoryId: memory.id, resourceVersion: memory.version, after: { text: 'Prefer evening workouts.', source: 'user_input', retention: 'persistent' } });
  const corrected = await execute(apply(correction)); assert.ok(corrected.ok && 'receipt' in corrected);
  assert.deepEqual(corrected.refresh.invalidatedMemoryVersions, [{ id: memory.id, version: memory.version }]);
  assert.equal((await snapshot()).memories[0].text, correction.after!.text);
  const deletion = await proposal({ ...header(), operation: 'memory.delete', memoryId: memory.id, resourceVersion: corrected.receipt.resourceVersion });
  const deleted = await execute(apply(deletion)); assert.ok(deleted.ok && 'receipt' in deleted && deleted.refresh.discardDerivedContext);
  const afterDelete = await snapshot(); assert.deepEqual(afterDelete.memories, []); assert.equal(afterDelete.scopeRevision, '3');
  assert.notEqual(afterDelete.scopeRevision, empty.scopeRevision);
  assert.ok(!JSON.stringify(deleted).includes('Prefer')); pass();
  check = 'manual_aba_and_hash_tamper_cannot_revive_review';
  const secondProposal = await propose('Prefer walking outdoors.');
  const secondResult = await execute(apply(secondProposal)); assert.ok(secondResult.ok && 'receipt' in secondResult);
  const secondId = secondProposal.resource.id;
  const stale = await proposal({ ...header(), operation: 'memory.delete', memoryId: secondId, resourceVersion: secondResult.receipt.resourceVersion });
  await pool.query("UPDATE public.memory_chunks SET fact_text='Unreviewed synthetic change' WHERE id=$1", [secondId]);
  assert.ok(!(await snapshot()).memories.some(row => row.id === secondId));
  await pool.query('UPDATE public.memory_chunks SET fact_text=$2 WHERE id=$1', [secondId, secondProposal.after!.text]);
  assert.deepEqual(await execute(apply(stale)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();
  check = 'physical_delete_recreate_keeps_scoped_tombstone';
  const beforePhysical = (await snapshot()).memories.find(row => row.id === secondId)!;
  const stalePhysical = await proposal({ ...header(), operation: 'memory.delete', memoryId: secondId, resourceVersion: beforePhysical.version });
  await pool.query('DELETE FROM public.memory_chunks WHERE id=$1 AND user_id=$2', [secondId, actorId]);
  assert.equal((await pool.query('SELECT memory_id FROM private.coach_memory_bindings WHERE memory_id=$1', [secondId])).rowCount, 1);
  await pool.query("INSERT INTO public.memory_chunks(id,user_id,scope,agent_name,session_id,fact_text,fact_type,source,confidence,active,created_at) VALUES($1,$2,'agent','coach-assistant-confirmed',$3,$4,'preference','user_input',1,true,$5)", [secondId, actorId, conversationId, beforePhysical.text, beforePhysical.createdAt]);
  assert.deepEqual(await execute(apply(stalePhysical)), { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'version_conflict' }); pass();
  for (const table of ['private.coach_action_receipts', 'public.audit_log'] as const) {
    check = `${table.endsWith('audit_log') ? 'audit' : 'receipt'}_failure_rolls_back_entire_confirmation`;
    const failedProposal = await propose('Synthetic rollback preference.'), failedApply = apply(failedProposal), prior = await snapshot();
    await pool.query(`ALTER TABLE ${table} ADD CONSTRAINT isolated_memory_insert_failure CHECK(false) NOT VALID`);
    try { const result = await execute(failedApply); assert.ok(!result.ok && result.error === 'uncertain'); }
    finally { await pool.query(`ALTER TABLE ${table} DROP CONSTRAINT isolated_memory_insert_failure`); }
    assert.deepEqual(await snapshot(), prior);
    assert.equal((await pool.query('SELECT id FROM public.memory_chunks WHERE id=$1', [failedProposal.resource.id])).rowCount, 0);
    assert.equal((await pool.query('SELECT memory_id FROM private.coach_memory_bindings WHERE memory_id=$1', [failedProposal.resource.id])).rowCount, 0); pass();
  }
  check = 'own_legacy_access_remains_while_reserved_namespace_is_private';
  await pool.query("INSERT INTO public.memory_chunks(id,user_id,fact_text,source) VALUES($1,$2,'Synthetic legacy preference','user_input')", [legacyId, actorId]);
  await authenticated(actorId, async connection => {
    assert.equal((await connection.query('SELECT id FROM public.memory_chunks WHERE id=$1', [legacyId])).rowCount, 1);
    assert.equal((await connection.query("UPDATE public.memory_chunks SET fact_text='Synthetic ordinary edit' WHERE id=$1 RETURNING id", [legacyId])).rowCount, 1);
    assert.equal((await connection.query('SELECT id FROM public.memory_chunks WHERE id=$1', [secondId])).rowCount, 0);
    assert.equal((await connection.query("UPDATE public.memory_chunks SET agent_name=NULL WHERE id=$1 RETURNING id", [secondId])).rowCount, 0);
  });
  await assert.rejects(authenticated(actorId, connection => connection.query("UPDATE public.memory_chunks SET agent_name='coach-assistant-confirmed' WHERE id=$1", [legacyId])), { code: '42501' });
  await assert.rejects(authenticated(actorId, connection => connection.query('SELECT * FROM private.coach_memory_bindings')), { code: '42501' });
  await authenticated(coachId, async connection => {
    // Positive coach permission oracle uses the same synthetic client's legacy row.
    assert.equal((await connection.query('SELECT id FROM public.memory_chunks WHERE id=$1', [legacyId])).rowCount, 1);
    assert.equal((await connection.query('SELECT id FROM public.memory_chunks WHERE id=$1', [secondId])).rowCount, 0);
  }); pass();
  check = 'thread_isolation_and_current_role_revocation';
  const foreignThread = await execute({ ...header(), conversationId: randomUUID(), operation: 'memory.read' });
  assert.ok(foreignThread.ok && 'memories' in foreignThread && foreignThread.memories.length === 0 && foreignThread.scopeRevision === '0');
  const foreignOrg = await service.execute({ ...scope, organizationId: randomUUID(), operation: { ...header(), operation: 'memory.read' } });
  assert.ok(!foreignOrg.ok && foreignOrg.error === 'forbidden');
  await pool.query("UPDATE public.organization_members SET role='coach' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]);
  try { const revoked = await execute({ ...header(), operation: 'memory.receipt', actionId: firstApply.actionId }); assert.ok(!revoked.ok && revoked.error === 'forbidden'); }
  finally { await pool.query("UPDATE public.organization_members SET role='client' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]); } pass();
  check = 'memory_ui_real_auth_http';
  const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
  uiManifest = resolve(root, `coach-memory-threads-${randomUUID()}.json`);
  await writeFile(uiManifest, '[]', { mode: 0o600 });
  const ui = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-memory.spec.ts'], {
    stdio: 'inherit', env: { ...process.env, E2E_COACH_MEMORY: '1', E2E_CLIENT_ID: actorId, COACH_MEMORY_HTTP_THREADS: uiManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '1', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '0', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(ui.status, 0); pass();
  check = 'memory_committed_response_loss_real_auth_http';
  const uncertain = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-memory-uncertain.spec.ts'], {
    stdio: 'inherit', env: { ...process.env, E2E_COACH_MEMORY_UNCERTAIN: '1', E2E_CLIENT_ID: actorId, COACH_MEMORY_HTTP_THREADS: uiManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '1', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '0', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(uncertain.status, 0); pass();
  check = 'durable_chat_sql_rls_lifecycle';
  const chat = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-chat-fixture-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(chat.status, 0); pass();
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_memory_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      if (uiManifest) {
        const threads: unknown = JSON.parse(await readFile(uiManifest, 'utf8'));
        assert.ok(Array.isArray(threads) && threads.length <= 4 && threads.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id)));
        cleanupConversations.push(...threads);
        const proposals = await pool.query("SELECT id,envelope->'resource'->>'id' AS memory_id FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND action IN ('memory.confirm','memory.correct','memory.delete')", [actorId, organizationId, threads]);
        for (const row of proposals.rows) { proposalIds.push(row.id); memoryIds.push(row.memory_id); }
        const receipts = await pool.query('SELECT action_id FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND proposal_id=ANY($4::uuid[])', [actorId, organizationId, threads, proposalIds]);
        actionIds.push(...receipts.rows.map(row => row.action_id));
      }
      await cleanupAudit();
      await pool.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND action_id=ANY($4::uuid[]) AND proposal_id=ANY($5::uuid[])', [actorId, organizationId, cleanupConversations, actionIds, proposalIds]);
      await pool.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND id=ANY($4::uuid[])', [actorId, organizationId, cleanupConversations, proposalIds]);
      await pool.query('DELETE FROM public.memory_chunks WHERE user_id=$1 AND id=ANY($2::uuid[])', [actorId, [...memoryIds, legacyId]]);
      await pool.query('DELETE FROM private.coach_memory_bindings WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND conversation_id=ANY($3::uuid[]) AND memory_id=ANY($4::uuid[])', [actorId, organizationId, cleanupConversations, memoryIds]);
      assert.equal((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND conversation_id=ANY($2::uuid[])', [actorId, cleanupConversations])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM private.coach_action_proposals WHERE actor_id=$1 AND conversation_id=ANY($2::uuid[])', [actorId, cleanupConversations])).rowCount, 0);
      assert.equal((await pool.query('SELECT memory_id FROM private.coach_memory_bindings WHERE actor_id=$1 AND conversation_id=ANY($2::uuid[])', [actorId, cleanupConversations])).rowCount, 0);
      assert.equal((await pool.query('SELECT id FROM public.memory_chunks WHERE user_id=$1 AND id=ANY($2::uuid[])', [actorId, [...memoryIds, legacyId]])).rowCount, 0);
      await pool.query('DROP POLICY coach_confirmed_memory_private ON public.memory_chunks; DROP TRIGGER coach_memory_revision ON public.memory_chunks; DROP FUNCTION private.advance_coach_memory_version(); DROP TABLE private.coach_memory_bindings;');
      assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.memory_chunks'::regclass")).rows[0].relrowsecurity, true);
      for (const constraint of baselineConstraints) {
        assert.ok(['coach_action_proposals_action_check', 'coach_action_proposals_envelope_check'].includes(constraint.name));
        // Definitions come only from this disposable database's pre-install catalogue.
        await pool.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT ${constraint.name}`);
        await pool.query(`ALTER TABLE private.coach_action_proposals ADD CONSTRAINT ${constraint.name} ${constraint.definition}`);
      }
      if (retainedParentReceipt) {
        const preserved = (await pool.query('SELECT * FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, retainedParentReceipt.action_id])).rows;
        assert.deepEqual(preserved, [retainedParentReceipt]);
      }
      assert.deepEqual(await constraints(), baselineConstraints);
      assert.deepEqual(await policies(), baselinePolicies);
      check = 'exact_memory_fixture_removed_rls_and_audit_restored'; pass();
    }
  } catch { process.stderr.write('Isolated memory fixture cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
