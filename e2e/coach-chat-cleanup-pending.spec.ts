/** Follow-up only: exercises a real pending-cleanup lifecycle in disposable SQL.
 * The prepared attachment has no Storage object, metadata or digests. Marking it
 * removed below simulates an external cleanup result; it is not Storage QA. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_CHAT_CLEANUP_PENDING !== '1', 'Exclusive disposable pending-chat-cleanup runner');

test('pending cleanup survives reload, blocks content and generation, then disappears after retry', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  const actorId = process.env.COACH_SQL_ACTOR ?? '', organizationId = process.env.COACH_SQL_ORG ?? '';
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED !== '1' || process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED !== '1'
    || process.env.COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED !== '1' || process.env.COACH_ASSISTANT_DATA_SOURCE !== 'authorized_records'
    || process.env.TROPHE_ALLOW_PAID_AI === '1' || !/^[a-f0-9-]{36}$/.test(actorId) || !/^[a-f0-9-]{36}$/.test(organizationId)
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');

  const manifest = process.env.COACH_CHAT_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root)
    || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_manifest');
  const previous = JSON.parse(readFileSync(manifest, 'utf8')) as { requestIds?: unknown; threadIds?: unknown; attachmentIds?: unknown };
  const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 4
    && value.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id));
  if (!validIds(previous.requestIds) || !validIds(previous.threadIds)
    || previous.attachmentIds !== undefined && !validIds(previous.attachmentIds)) throw new Error('invalid_manifest_contents');
  const requestIds = new Set(previous.requestIds), threadIds = new Set(previous.threadIds), attachmentIds = new Set(previous.attachmentIds ?? []);
  const persist = () => {
    expect(requestIds.size).toBeLessThanOrEqual(4); expect(threadIds.size).toBeLessThanOrEqual(4); expect(attachmentIds.size).toBeLessThanOrEqual(4);
    writeFileSync(manifest, JSON.stringify({ requestIds: [...requestIds], threadIds: [...threadIds], attachmentIds: [...attachmentIds] }), { mode: 0o600 });
  };
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  const title = `Pending cleanup ${randomUUID()}`, createRequestId = randomUUID(), attachmentId = randomUUID();
  let threadId = '';
  requestIds.add(createRequestId); persist(); // Before create dispatch, including lost acknowledgement.

  try {
    await loginAs(page, 'client');
    const created = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.chat.v1', operation: 'create', requestId: createRequestId, title } });
    expect(created.status()).toBe(200); const creation = await created.json(); await created.dispose();
    expect(creation).toMatchObject({ ok: true, value: { thread: { title, state: 'active' } } });
    threadId = creation.value.thread.id; expect(threadId).toMatch(/^[a-f0-9-]{36}$/); threadIds.add(threadId); persist();

    const text = `Synthetic pending cleanup turn ${randomUUID()}`, turnId = randomUUID();
    const generated = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', conversationId: threadId, turnId, message: text } });
    expect(generated.status()).toBe(200); const answer = await generated.json(); await generated.dispose();
    expect(answer).toMatchObject({ ok: true, conversationId: threadId, turnId,
      evaluation: { transport: 'injected_fixture', records: 'authorized_records', semanticQualityVerified: false } });

    attachmentIds.add(attachmentId); persist(); // Before inserting the exact cleanup blocker.
    const bucket = 'coach-attachments-chat-cleanup-fixture';
    const objectPath = `${organizationId}/${actorId}/${threadId}/${attachmentId}.jpg`;
    await pool.query(`INSERT INTO private.coach_attachment_uploads
      (id,actor_id,subject_id,organization_id,conversation_id,request_id,bucket,object_path,mime,input_bytes,upload_token_hash,state,expires_at)
      VALUES($1,$2,$2,$3,$4,$5,$6,$7,'image/jpeg',1,$8,'prepared',clock_timestamp()+interval '15 minutes')`,
    [attachmentId, actorId, organizationId, threadId, randomUUID(), bucket, objectPath, 'a'.repeat(64)]);

    await page.goto('/dashboard/workout');
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const panel = page.locator('#global-coach');
    await panel.locator('summary').filter({ hasText: 'Saved conversations' }).click();
    const firstList = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'list');
    await panel.getByRole('button', { name: 'Load conversations', exact: true }).click(); expect((await firstList).status()).toBe(200);
    const firstRead = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'read');
    await panel.getByRole('button', { name: title, exact: true }).click(); expect((await firstRead).status()).toBe(200);
    await expect(panel.getByText(text, { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Delete conversation', exact: true }).click();
    const firstDelete = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'delete');
    await panel.getByRole('button', { name: 'Confirm deletion', exact: true }).click();
    const deletion = await firstDelete; expect(deletion.status()).toBe(200); const pending = await deletion.json();
    expect(pending).toMatchObject({ ok: true, value: { thread: { id: threadId, title: '', state: 'cleanup_pending' }, cleanup: 'pending' } });
    await expect(panel.getByRole('button', { name: 'Retry cleanup', exact: true })).toBeVisible();
    await expect(panel.getByText(text, { exact: true })).toHaveCount(0);

    const pendingRow = (await pool.query('SELECT state,title,next_sequence FROM private.coach_chat_threads WHERE id=$1', [threadId])).rows[0];
    expect(pendingRow).toEqual({ state: 'cleanup_pending', title: '', next_sequence: 2 });
    expect((await pool.query("SELECT count(*)::int AS n FROM public.agent_conversation WHERE user_id=$1 AND agent_name='coach-assistant-global-v1' AND session_id=$2", [actorId, threadId])).rows[0].n).toBe(0);

    // Reload must rediscover the blank pending row, never its withdrawn content.
    await page.reload(); await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const reloaded = page.locator('#global-coach');
    await reloaded.locator('summary').filter({ hasText: 'Saved conversations' }).click();
    const secondList = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'list');
    await reloaded.getByRole('button', { name: 'Load conversations', exact: true }).click(); expect((await secondList).status()).toBe(200);
    await expect(reloaded.getByRole('button', { name: 'Retry cleanup', exact: true })).toBeVisible();
    await expect(reloaded.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    await expect(reloaded.getByRole('button', { name: 'Continue conversation', exact: true })).toHaveCount(0);

    const readBlocked = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.chat.v1', operation: 'read', threadId, limit: 20, afterSequence: 0 } });
    expect(readBlocked.status()).toBe(404); await readBlocked.dispose();
    const generationBlocked = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', conversationId: threadId, turnId: randomUUID(), message: 'This must not reach a pipeline' } });
    expect(generationBlocked.status()).toBe(503); const rejected = await generationBlocked.json(); await generationBlocked.dispose();
    expect(rejected.ok).toBe(false); expect(rejected.evaluation).toBeUndefined();
    expect((await pool.query('SELECT state,next_sequence FROM private.coach_chat_threads WHERE id=$1', [threadId])).rows[0]).toEqual({ state: 'cleanup_pending', next_sequence: 2 });
    expect((await pool.query("SELECT count(*)::int AS n FROM public.agent_conversation WHERE user_id=$1 AND agent_name='coach-assistant-global-v1' AND session_id=$2", [actorId, threadId])).rows[0].n).toBe(0);

    // No Storage object exists. This exact state transition represents external
    // cleanup completion and is intentionally not evidence about Storage APIs.
    const external = await pool.query(`UPDATE private.coach_attachment_uploads SET state='removed',metadata=NULL
      WHERE id=$1 AND actor_id=$2 AND subject_id=$2 AND organization_id=$3 AND conversation_id=$4
      AND bucket=$5 AND state='prepared' AND source_digest IS NULL AND normalized_digest IS NULL RETURNING id,state`,
    [attachmentId, actorId, organizationId, threadId, bucket]);
    expect(external.rows).toEqual([{ id: attachmentId, state: 'removed' }]);

    const retry = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'delete');
    await reloaded.getByRole('button', { name: 'Retry cleanup', exact: true }).click();
    const retried = await retry; expect(retried.status()).toBe(200); const complete = await retried.json();
    expect(complete).toMatchObject({ ok: true, value: { thread: { id: threadId, state: 'deleted' }, cleanup: 'complete' } });
    await expect(reloaded.getByRole('button', { name: 'Retry cleanup', exact: true })).toHaveCount(0);
    expect((await pool.query('SELECT state FROM private.coach_chat_threads WHERE id=$1', [threadId])).rows[0]).toEqual({ state: 'deleted' });
    const finalList = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.chat.v1', operation: 'list', limit: 50 } });
    expect(finalList.status()).toBe(200); expect((await finalList.json()).value.threads.some((thread: { id: string }) => thread.id === threadId)).toBe(false); await finalList.dispose();
    noPaid();
  } finally {
    await pool.end();
    // Parent cleanup uses requestIds/threadIds plus exact attachmentIds and fixture scope.
  }
});
