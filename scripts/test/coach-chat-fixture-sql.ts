// Installs reviewed chat metadata only in the disposable CI memory/ledger lifetime.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isAbsolute, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { Pool } from 'pg';
const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
assert.ok(process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true' && process.env.CI_REAL_SUPABASE === '1'
  && target.protocol === 'postgresql:' && target.hostname === '127.0.0.1' && target.port === '54322' && target.pathname === '/postgres'
  && target.username === 'postgres' && target.password === 'postgres' && !target.search && !target.hash, 'disposable_target_required');
const actorId = process.env.COACH_SQL_ACTOR!;
assert.match(actorId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
assert.match(process.env.COACH_SQL_ORG ?? '', /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
const pool = new Pool({ connectionString: target.toString(), max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
let installed = false, check = 'baseline';
let uiManifest: string | undefined;
let baselinePolicies: unknown[] = [], baselineContent: unknown[] = [], baselineLedger: unknown[] = [];
const policies = async () => (await pool.query("SELECT policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='agent_conversation' ORDER BY policyname")).rows;
const content = async () => (await pool.query('SELECT * FROM public.agent_conversation WHERE user_id=$1 ORDER BY id', [actorId])).rows;
const ledger = async () => (await pool.query("SELECT * FROM (SELECT 'proposal' AS kind,to_jsonb(p) AS row FROM private.coach_action_proposals p WHERE actor_id=$1 UNION ALL SELECT 'receipt',to_jsonb(r) FROM private.coach_action_receipts r WHERE actor_id=$1) entries ORDER BY kind,row->>'id'", [actorId])).rows;
const pass = () => process.stdout.write(JSON.stringify({ event: 'coach_chat_fixture_sql', check, outcome: 'passed' }) + '\n');
async function main() {
  for (const name of ['coach_chat_threads', 'coach_chat_turns', 'coach_attachment_uploads']) assert.equal((await pool.query('SELECT to_regclass($1) AS relation', [`private.${name}`])).rows[0].relation, null);
  assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.agent_conversation'::regclass")).rows[0].relrowsecurity, true);
  baselinePolicies = await policies(); baselineContent = structuredClone(await content()); baselineLedger = structuredClone(await ledger());
  const chat = await readFile('db/isolated/coach-chat.sql', 'utf8'), attachments = await readFile('db/isolated/coach-private-attachments.sql', 'utf8');
  const probe = await pool.connect();
  try {
    await probe.query('BEGIN'); await probe.query('ALTER TABLE public.agent_conversation DISABLE ROW LEVEL SECURITY');
    await assert.rejects(probe.query(chat), { code: 'P0001' });
  } finally { await probe.query('ROLLBACK'); probe.release(); }
  check = 'disabled_chat_rls_rejected_before_installation'; pass();
  const connection = await pool.connect();
  try {
    await connection.query('BEGIN'); await connection.query(attachments); await connection.query(chat); await connection.query('COMMIT'); installed = true;
  } catch (error) { await connection.query('ROLLBACK'); throw error; }
  finally { connection.release(); }
  check = 'reviewed_chat_sql_rls_lifecycle';
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-chat-sql.ts'], { stdio: 'inherit', env: process.env });
  assert.equal(child.status, 0); pass();
  check = 'chat_ui_real_auth_http';
  const root = process.env.RUNNER_TEMP; assert.ok(root && isAbsolute(root));
  uiManifest = resolve(root, `coach-chat-threads-${randomUUID()}.json`);
  await writeFile(uiManifest, JSON.stringify({ requestIds: [], threadIds: [] }), { mode: 0o600 });
  const ui = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-chat.spec.ts'], {
    stdio: 'inherit', env: { ...process.env, E2E_COACH_CHAT: '1', E2E_CLIENT_ID: actorId, COACH_CHAT_HTTP_THREADS: uiManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'model', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '0', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '0', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0',
      COACH_ASSISTANT_CHAT_HISTORY_ENABLED: '1', COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(ui.status, 0); pass();
  check = 'chat_cleanup_pending_real_auth_http';
  const pending = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-chat-cleanup-pending.spec.ts'], {
    stdio: 'inherit', env: { ...process.env, E2E_COACH_CHAT_CLEANUP_PENDING: '1', E2E_CLIENT_ID: actorId, COACH_CHAT_HTTP_THREADS: uiManifest,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED: '1',
      COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'model', COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
      COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED: '0', COACH_ASSISTANT_DIET_ACTIONS_ENABLED: '0', COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0',
      COACH_ASSISTANT_CHAT_HISTORY_ENABLED: '1', COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: actorId },
  });
  assert.equal(pending.status, 0); pass();
}
main().catch(error => {
  process.stderr.write(JSON.stringify({ event: 'coach_chat_fixture_sql', check, outcome: 'failed', ...(typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? { sqlstate: error.code } : {}) }) + '\n'); process.exitCode = 1;
}).finally(async () => {
  try {
    if (installed) {
      if (uiManifest) {
        const manifest = JSON.parse(await readFile(uiManifest, 'utf8')) as { requestIds: unknown; threadIds: unknown; attachmentIds?: unknown };
        const valid = (items: unknown): items is string[] => Array.isArray(items) && items.length <= 4 && items.every(id => typeof id === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id));
        assert.ok(valid(manifest.requestIds) && valid(manifest.threadIds));
        const attachmentIds = manifest.attachmentIds ?? []; assert.ok(valid(attachmentIds));
        const scoped = (await pool.query<{ id: string }>("SELECT id FROM private.coach_chat_threads WHERE actor_id=$1 AND subject_id=$1 AND organization_id=$2 AND actor_role='client' AND (id=ANY($3::uuid[]) OR request_id=ANY($4::uuid[]))", [actorId, process.env.COACH_SQL_ORG, manifest.threadIds, manifest.requestIds])).rows.map(row => row.id);
        assert.ok(scoped.length <= 8);
        const cleanup = await pool.connect();
        try {
          await cleanup.query('BEGIN');
          // These test rows never had Storage bytes; available uploads are not eligible.
          await cleanup.query("DELETE FROM private.coach_attachment_uploads WHERE id=ANY($1::uuid[]) AND actor_id=$2 AND subject_id=$2 AND organization_id=$3 AND conversation_id=ANY($4::uuid[]) AND bucket='coach-attachments-chat-cleanup-fixture' AND object_path=organization_id::text || '/' || subject_id::text || '/' || conversation_id::text || '/' || id::text || '.jpg' AND state IN ('prepared','removed') AND source_digest IS NULL AND normalized_digest IS NULL AND metadata IS NULL", [attachmentIds, actorId, process.env.COACH_SQL_ORG, scoped]);
          await cleanup.query("DELETE FROM public.agent_conversation c USING private.coach_chat_turns t WHERE t.thread_id=ANY($1::uuid[]) AND c.id=t.content_id AND c.user_id=$2 AND c.agent_name='coach-assistant-global-v1'", [scoped, actorId]);
          await cleanup.query('DELETE FROM private.coach_chat_turns WHERE thread_id=ANY($1::uuid[])', [scoped]);
          await cleanup.query('DELETE FROM private.coach_chat_threads WHERE id=ANY($1::uuid[]) AND actor_id=$2 AND subject_id=$2 AND organization_id=$3', [scoped, actorId, process.env.COACH_SQL_ORG]);
          await cleanup.query('COMMIT');
        } catch (error) { await cleanup.query('ROLLBACK'); throw error; }
        finally { cleanup.release(); }
      }
      for (const name of ['coach_chat_turns', 'coach_chat_threads', 'coach_attachment_uploads']) assert.equal((await pool.query(`SELECT count(*)::int AS n FROM private.${name}`)).rows[0].n, 0);
      assert.deepEqual(await content(), baselineContent); assert.deepEqual(await ledger(), baselineLedger);
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        await connection.query('DROP POLICY coach_chat_namespace_guard ON public.agent_conversation; DROP TRIGGER coach_chat_content_immutable ON public.agent_conversation; DROP TRIGGER coach_chat_membership_revocation ON public.organization_members; DROP TRIGGER coach_chat_profile_revocation ON public.profiles; DROP TRIGGER coach_chat_assignment_revocation ON public.client_profiles; DROP TRIGGER coach_chat_attachment_guard ON private.coach_attachment_uploads; DROP TRIGGER coach_chat_proposal_guard ON private.coach_action_proposals; DROP TRIGGER coach_chat_thread_immutable ON private.coach_chat_threads; DROP TRIGGER coach_chat_turn_immutable ON private.coach_chat_turns;');
        await connection.query('DROP FUNCTION private.coach_chat_contract_version(); DROP FUNCTION private.coach_chat_resource_guard(); DROP FUNCTION private.coach_chat_content_immutable(); DROP FUNCTION private.coach_chat_turn_immutable(); DROP FUNCTION private.coach_chat_thread_immutable(); DROP FUNCTION private.coach_chat_revoke_scope(); DROP FUNCTION private.coach_chat_content_visible(uuid,uuid,text,text); DROP TABLE private.coach_chat_turns; DROP TABLE private.coach_chat_threads; DROP TABLE private.coach_attachment_uploads;');
        await connection.query('COMMIT');
      } catch (error) { await connection.query('ROLLBACK'); throw error; }
      finally { connection.release(); }
      assert.deepEqual(await policies(), baselinePolicies); assert.deepEqual(await content(), baselineContent); assert.deepEqual(await ledger(), baselineLedger);
      assert.equal((await pool.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.agent_conversation'::regclass")).rows[0].relrowsecurity, true);
      check = 'chat_schema_removed_parent_content_ledger_rls_preserved'; pass();
    }
  } catch { process.stderr.write('Isolated chat schema cleanup failed.\n'); process.exitCode = 1; }
  await pool.end();
});
