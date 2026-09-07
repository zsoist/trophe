/** Prepared against AG1's durable-chat WIP. AG1 owns schema installation,
 * runner flags and exact cleanup of every thread recorded in the manifest. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { expect, request as apiRequest, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_CHAT !== '1', 'Exclusive disposable durable-chat Auth/HTTP runner');

test('durable chat creates, reloads and resumes one real Auth/HTTP conversation without a second pipeline', async ({ browser, page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED !== '1' || process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED !== '1'
    || process.env.COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED !== '1' || process.env.COACH_ASSISTANT_DATA_SOURCE !== 'authorized_records'
    || process.env.TROPHE_ALLOW_PAID_AI === '1' || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1'
    || target.port !== '54322' || target.pathname !== '/postgres' || target.username !== 'postgres' || target.password !== 'postgres'
    || target.search || target.hash) throw new Error('disposable_target_required');

  const manifest = process.env.COACH_CHAT_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root)
    || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_manifest');
  const previous: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  const validIds = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 4
    && value.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id));
  if (!previous || typeof previous !== 'object' || Array.isArray(previous)
    || !validIds((previous as { requestIds?: unknown }).requestIds) || !validIds((previous as { threadIds?: unknown }).threadIds)) throw new Error('invalid_manifest_contents');
  const requestIds = new Set<string>((previous as { requestIds: string[] }).requestIds);
  const threadIds = new Set<string>((previous as { threadIds: string[] }).threadIds);
  const operations: Array<{ version: string; operation: string; threadId?: string }> = [];
  let createCount = 0, generationCount = 0, routeFailure: unknown;
  const persistManifest = () => writeFileSync(manifest, JSON.stringify({ requestIds: [...requestIds], threadIds: [...threadIds] }), { mode: 0o600 });
  const recordRequest = (requestId: string) => {
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/); requestIds.add(requestId); expect(requestIds.size).toBeLessThanOrEqual(4); persistManifest();
  };
  const recordThread = (threadId: string) => {
    expect(threadId).toMatch(/^[a-f0-9-]{36}$/); threadIds.add(threadId); expect(threadIds.size).toBeLessThanOrEqual(4); persistManifest();
  };
  const noPaid = await blockPaidRequests(page);

  await page.route('**/api/coach-assistant', async route => {
    try {
      if (route.request().method() !== 'POST') { await route.continue(); return; }
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.version === 'coach-assistant.chat.v1') {
        const operation = String(body.operation ?? '');
        const threadId = typeof body.threadId === 'string' ? body.threadId : undefined;
        operations.push({ version: body.version, operation, ...(threadId ? { threadId } : {}) });
        if (threadId) recordThread(threadId); // Always before dispatch of read/resume-related operations.
        if (operation === 'create') {
          createCount++; expect(createCount).toBe(1);
          // The server allocates the thread UUID. Persist its idempotency key before
          // dispatch, then hold delivery until the returned UUID is also recorded.
          expect(typeof body.requestId).toBe('string'); recordRequest(body.requestId as string);
          const real = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
          expect(real.status()).toBe(200); const result = await real.json();
          expect(result).toMatchObject({ version: 'coach-assistant.chat.v1', storage: 'database', ok: true, value: { thread: { state: 'active' } } });
          recordThread(result.value.thread.id);
          await route.fulfill({ response: real, contentType: 'application/json', body: JSON.stringify(result) });
          await real.dispose(); return;
        }
      } else if (body.version === 'coach-assistant.v2') {
        expect(typeof body.conversationId).toBe('string');
        // A generation may reach the backend only after its durable thread is in
        // the cleanup manifest.
        expect(threadIds.has(body.conversationId as string)).toBe(true);
        operations.push({ version: body.version, operation: 'generate', threadId: body.conversationId as string });
        generationCount++;
      }
      await route.continue();
    } catch (error) {
      routeFailure = error; await route.abort('failed').catch(() => {});
    }
  });

  const anonymous = await apiRequest.newContext({ baseURL: 'http://127.0.0.1:3300' });
  let coachContext: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  try {
    await loginAs(page, 'client'); await page.goto('/dashboard/workout');
    await page.getByRole('button', { name: 'Ask coach', exact: true }).click();
    const panel = page.locator('#global-coach');
    const firstText = `Synthetic durable chat ${randomUUID()}`;
    await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill(firstText);
    const firstResponse = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/api/coach-assistant' || response.request().method() !== 'POST') return false;
      const body = response.request().postDataJSON(); return body.version === 'coach-assistant.v2' && body.message === firstText;
    });
    await panel.getByRole('button', { name: 'Send question', exact: true }).click();
    const sent = await firstResponse; expect(sent.status()).toBe(200); const first = await sent.json();
    expect(first).toMatchObject({ ok: true, version: 'coach-assistant.v2', dataSource: 'authorized_records',
      evaluation: { transport: 'injected_fixture', records: 'authorized_records', semanticQualityVerified: false } });
    expect(first.output.answer).toEqual(expect.any(String)); expect(first.output.answer.length).toBeGreaterThan(0);
    expect(createCount).toBe(1); expect(generationCount).toBe(1); expect(threadIds.has(first.conversationId)).toBe(true);
    await expect(panel.getByText(firstText, { exact: true })).toBeVisible();
    await expect(panel.getByText(first.output.answer, { exact: true })).toBeVisible();

    // Closing and reopening keeps the current in-memory conversation without a request.
    const beforeClose = operations.length;
    await panel.getByRole('button', { name: 'Close coach', exact: true }).click();
    await page.getByRole('button', { name: 'Ask coach', exact: true }).click();
    await expect(panel.getByText(first.output.answer, { exact: true })).toBeVisible();
    expect(operations).toHaveLength(beforeClose);

    // A page reload removes in-memory state. List/read must reconstruct only
    // historical text; selecting Continue moves it into the active controller.
    await page.reload();
    await page.getByRole('button', { name: 'Ask coach', exact: true }).click();
    const reloaded = page.locator('#global-coach');
    await reloaded.locator('summary').filter({ hasText: 'Saved conversations' }).click();
    const listing = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'list');
    await reloaded.getByRole('button', { name: 'Load conversations', exact: true }).click();
    expect((await listing).status()).toBe(200);
    const title = firstText.slice(0, 80);
    const reading = page.waitForResponse(response => response.request().postDataJSON()?.operation === 'read');
    await reloaded.getByRole('button', { name: title, exact: true }).click();
    const read = await reading; expect(read.status()).toBe(200); const history = (await read.json()).value;
    expect(history.thread.id).toBe(first.conversationId);
    expect(history.messages.map((message: { role: string; text: string; sequence: number }) => ({ role: message.role, text: message.text, sequence: message.sequence }))).toEqual([
      { role: 'user', text: firstText, sequence: 1 },
      { role: 'assistant', text: first.output.answer, sequence: 2 },
    ]);
    await expect(reloaded.getByText(firstText, { exact: true })).toBeVisible();
    await expect(reloaded.getByText(first.output.answer, { exact: true })).toBeVisible();
    await reloaded.getByRole('button', { name: 'Continue conversation', exact: true }).click();
    await expect(reloaded.getByText('Saved message · You', { exact: true })).toBeVisible();
    await expect(reloaded.getByText(first.output.answer, { exact: true })).toHaveCount(1);

    const followUp = `Continue the same synthetic thread ${randomUUID()}`;
    await reloaded.getByRole('textbox', { name: 'Your question', exact: true }).fill(followUp);
    const resumedResponse = page.waitForResponse(response => response.request().postDataJSON()?.message === followUp);
    await reloaded.getByRole('button', { name: 'Send question', exact: true }).click();
    const resumed = await resumedResponse; expect(resumed.status()).toBe(200); const second = await resumed.json();
    expect(second).toMatchObject({ ok: true, conversationId: first.conversationId });
    expect(createCount).toBe(1); expect(generationCount).toBe(2);
    await expect(reloaded.getByText(second.output.answer, { exact: true })).toBeVisible();

    // Exact thread text is unavailable without the current authenticated scope.
    const anonymousRead = await anonymous.post('/api/coach-assistant', { data: { version: 'coach-assistant.chat.v1', operation: 'read', threadId: first.conversationId, limit: 20, afterSequence: 0 } });
    expect(anonymousRead.status()).toBe(401); await anonymousRead.dispose();
    coachContext = await browser.newContext(); const coachPage = await coachContext.newPage();
    await loginAs(coachPage, 'coach');
    const foreignRead = await coachPage.request.post('/api/coach-assistant', { data: { version: 'coach-assistant.chat.v1', operation: 'read', threadId: first.conversationId, limit: 20, afterSequence: 0 } });
    expect([403, 404]).toContain(foreignRead.status()); await foreignRead.dispose();

    expect(routeFailure).toBeUndefined(); noPaid();
  } finally {
    await coachContext?.close(); await anonymous.dispose();
    // Parent resolves scoped create requestIds, merges their threadIds and removes exact rows even on failure.
  }
});
