import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createCoachMessageService } from '../../agents/coach-assistant/message-service';
import { coachMessageResultSchema, type CoachMessageOperation, type CoachMessageProposal } from '../../agents/coach-assistant/message-actions';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
  || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!, organizationId = process.env.COACH_SQL_ORG!;
for (const id of [actorId, coachId, organizationId]) assert.match(id, /^[a-f0-9-]{36}$/);
const pool = new Pool({ connectionString: target.toString(), max: 4, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
const database = drizzle(pool);
let limiterCalls = 0;
const service = createCoachMessageService(database, async () => { limiterCalls += 1; return { allowed: true, retryAfter: 1 }; });
const scope = { actorId, subjectId: actorId, organizationId, signal: new AbortController().signal };
const conversationId = process.env.COACH_MESSAGE_CONVERSATION ?? randomUUID();
const header = () => ({ version: 'coach-assistant.v2' as const, conversationId, turnId: randomUUID() });
const actionIds: string[] = [], proposalIds: string[] = [], messageIds: string[] = [];
const execute = async (operation: CoachMessageOperation) => coachMessageResultSchema.parse(await service.execute({ ...scope, operation }));
let installed = false, check = 'setup', originalCoachName = '';
let priorConstraints: Array<{ name: string; definition: string }> = [];
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_message_sql', check, outcome: 'passed' }) + '\n');
async function recipient() {
  const result = await execute({ ...header(), operation: 'message.recipient' });
  assert.ok(result.ok && 'recipient' in result); return result.recipient;
}
async function propose(message = 'Hola, ¿podrías ayudarme a revisar mi plan?') {
  const current = await recipient();
  const result = await execute({ ...header(), operation: 'message.propose', coachId: current.coachId, resourceVersion: current.version, after: { message } });
  assert.ok(result.ok && 'proposal' in result); proposalIds.push(result.proposal.id); return result.proposal;
}
function apply(proposal: CoachMessageProposal, actionId = randomUUID()): Extract<CoachMessageOperation, { operation: 'message.apply' }> {
  actionIds.push(actionId);
  return { ...header(), operation: 'message.apply', coachId: proposal.recipient.coachId, proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.recipient.version, actionId, reviewed: true };
}
async function main() {
  if (process.argv[2] === 'recover') {
    const result = await execute({ ...header(), operation: 'message.receipt', coachId, actionId: process.env.COACH_MESSAGE_ACTION! });
    assert.ok(result.ok && 'receipt' in result && result.receipt.status === 'stored' && result.receipt.actionId === process.env.COACH_MESSAGE_ACTION);
    check = 'receipt_recovered_in_new_process'; pass(); return;
  }
  priorConstraints = (await pool.query<{ name: string; definition: string }>(`SELECT conname AS name,pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='private.coach_action_proposals'::regclass AND conname IN ('coach_action_proposals_action_check','coach_action_proposals_envelope_check') ORDER BY conname`)).rows;
  assert.equal(priorConstraints.length, 2);
  await pool.query(await readFile('db/isolated/coach-message-actions.sql', 'utf8')); installed = true;
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES($1,$2,'client'),($1,$3,'coach') ON CONFLICT(org_id,user_id) DO UPDATE SET role=EXCLUDED.role", [organizationId, actorId, coachId]);
  originalCoachName = (await pool.query('SELECT full_name FROM public.profiles WHERE id=$1', [coachId])).rows[0].full_name;

  check = 'recipient_is_exact_and_preview_is_read_only';
  const current = await recipient();
  assert.equal(current.coachId, coachId); assert.equal(current.name, originalCoachName);
  const preview = await propose();
  assert.equal(preview.recipient.coachId, coachId); assert.equal(preview.after.message, 'Hola, ¿podrías ayudarme a revisar mi plan?');
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.messages WHERE id=$1', [preview.id])).rows[0].n, 0); pass();

  check = 'assignment_name_and_membership_aba_invalidate_reviews';
  const staleAssignment = await propose('assignment');
  await pool.query('UPDATE public.client_profiles SET coach_id=NULL WHERE user_id=$1', [actorId]);
  await pool.query('UPDATE public.client_profiles SET coach_id=$2 WHERE user_id=$1', [actorId, coachId]);
  assert.deepEqual(await execute(apply(staleAssignment)), { ok: false, error: 'version_conflict' });
  const staleName = await propose('name');
  await pool.query('UPDATE public.profiles SET full_name=$2 WHERE id=$1', [coachId, `${originalCoachName} changed`]);
  await pool.query('UPDATE public.profiles SET full_name=$2 WHERE id=$1', [coachId, originalCoachName]);
  assert.deepEqual(await execute(apply(staleName)), { ok: false, error: 'version_conflict' });
  const staleMembership = await propose('membership');
  await pool.query("UPDATE public.organization_members SET role='admin' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]);
  await pool.query("UPDATE public.organization_members SET role='client' WHERE org_id=$1 AND user_id=$2", [organizationId, actorId]);
  assert.deepEqual(await execute(apply(staleMembership)), { ok: false, error: 'version_conflict' }); pass();

  check = 'same_action_commits_one_message_receipt_and_limiter_charge';
  const proposal = await propose('Please review my plan.'); const operation = apply(proposal); const beforeLimiter = limiterCalls;
  const results = await Promise.all([execute(operation), execute(operation)]);
  assert.ok(results.every(result => result.ok && 'receipt' in result)); assert.deepEqual(results[0], results[1]);
  const saved = results[0]; assert.ok(saved.ok && 'receipt' in saved); messageIds.push(saved.receipt.messageId);
  assert.equal(limiterCalls - beforeLimiter, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.messages WHERE id=$1 AND client_id=$2 AND coach_id=$3 AND sender_role=\'client\' AND body=$4', [proposal.id, actorId, coachId, proposal.after.message])).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actorId, operation.actionId])).rows[0].n, 1); pass();

  const recovery = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-message-sql.ts', 'recover'], { stdio: 'inherit', env: { ...process.env, COACH_MESSAGE_CONVERSATION: conversationId, COACH_MESSAGE_ACTION: operation.actionId } });
  assert.equal(recovery.status, 0);
  check = 'second_action_for_consumed_review_is_rejected';
  assert.deepEqual(await execute(apply(proposal)), { ok: false, error: 'idempotency_conflict' }); pass();

  check = 'revoked_relation_denies_receipt_without_resend';
  await pool.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=$2', [organizationId, actorId]);
  assert.deepEqual(await execute({ ...header(), operation: 'message.receipt', coachId, actionId: operation.actionId }), { ok: false, error: 'forbidden' });
  await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES($1,$2,'client')", [organizationId, actorId]);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM public.messages WHERE id=$1', [proposal.id])).rows[0].n, 1); pass();

  check = 'authenticated_cannot_read_recipient_versions_or_ledger';
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query('SET LOCAL ROLE authenticated');
    await connection.query('SAVEPOINT revision_access');
    await assert.rejects(connection.query('SELECT * FROM private.coach_chat_recipient_versions'), { code: '42501' });
    await connection.query('ROLLBACK TO SAVEPOINT revision_access');
    await assert.rejects(connection.query('SELECT * FROM private.coach_action_receipts'), { code: '42501' });
  } finally { await connection.query('ROLLBACK'); connection.release(); }
  pass();

  check = 'message_composer_real_auth_http';
  const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
  const manifest = resolve(root, `coach-message-actions-${randomUUID()}.json`); await writeFile(manifest, '{}', { mode: 0o600 });
  const http = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-message.spec.ts'], { stdio: 'inherit', env: {
    ...process.env, E2E_COACH_MESSAGE: '1', COACH_MESSAGE_HTTP_ACTIONS: manifest, NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '1', NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED: '1',
    COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'model', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId,
    COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1', COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED: '1', AI_RATE_LIMIT_BYPASS_USER_IDS: actorId,
  } });
  const observed = JSON.parse(await readFile(manifest, 'utf8')) as { actionId?: string; proposalIds?: string[]; messageId?: string };
  if (observed.actionId) actionIds.push(observed.actionId); if (observed.proposalIds) proposalIds.push(...observed.proposalIds); if (observed.messageId) messageIds.push(observed.messageId);
  assert.equal(http.status, 0); pass();
}

main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_message_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed && process.argv[2] !== 'recover') {
      const partial = await pool.query<{ id: string }>("SELECT id FROM private.coach_action_proposals WHERE actor_id=$1 AND action='chat.message.send'", [actorId]);
      for (const row of partial.rows) if (!proposalIds.includes(row.id)) proposalIds.push(row.id);
      if (proposalIds.length) { await pool.query('DELETE FROM private.coach_action_receipts WHERE actor_id=$1 AND proposal_id=ANY($2::uuid[])', [actorId, proposalIds]); await pool.query('DELETE FROM public.messages WHERE client_id=$1 AND id=ANY($2::uuid[])', [actorId, proposalIds]); await pool.query('DELETE FROM private.coach_action_proposals WHERE actor_id=$1 AND id=ANY($2::uuid[])', [actorId, proposalIds]); }
      await pool.query('DELETE FROM public.rate_limit_windows WHERE key=$1', [`client-message:${actorId}`]);
      await pool.query('DROP TRIGGER coach_chat_recipient_membership ON public.organization_members; DROP FUNCTION private.coach_chat_recipient_membership(); DROP TRIGGER coach_chat_recipient_identity ON public.profiles; DROP FUNCTION private.coach_chat_recipient_identity(); DROP TRIGGER coach_chat_recipient_profile_row ON public.client_profiles; DROP FUNCTION private.coach_chat_recipient_profile_row(); DROP FUNCTION private.coach_chat_recipient_bump(uuid); DROP TABLE private.coach_chat_recipient_versions;');
      for (const constraint of priorConstraints) {
        assert.ok(['coach_action_proposals_action_check', 'coach_action_proposals_envelope_check'].includes(constraint.name));
        await pool.query(`ALTER TABLE private.coach_action_proposals DROP CONSTRAINT ${constraint.name}; ALTER TABLE private.coach_action_proposals ADD CONSTRAINT ${constraint.name} ${constraint.definition}`);
      }
      check = 'isolated_delta_removed'; pass();
    }
  } catch (error) { process.stderr.write(JSON.stringify({ event: 'coach_message_sql', check: 'cleanup', outcome: 'failed', ...(typeof (error as { code?: unknown }).code === 'string' ? { sqlstate: (error as { code: string }).code } : {}) }) + '\n'); process.exitCode = 1; }
  await pool.end();
});
