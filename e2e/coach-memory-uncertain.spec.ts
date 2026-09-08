/** Prepared against AG1 1e32a9b; requires its live disposable memory harness.
 * Real backend response + separate receipt read precede dropping browser delivery. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
test.skip(process.env.E2E_COACH_MEMORY_UNCERTAIN !== '1', 'Exclusive disposable lost-response memory runner');

test('committed memory response loss survives close and recovers by receipt without another apply', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const manifest = process.env.COACH_MEMORY_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_manifest');
  const previous: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(previous) || previous.length > 4 || !previous.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) throw new Error('invalid_manifest_contents');
  const conversations = new Set<string>(previous);
  const browserOperations: Array<{ operation: string; actionId?: string }> = [];
  let applyCount = 0, dropped = false, routeFailure: unknown;
  let committed: { id: string; actionId: string; proposalId: string; resourceVersion: string; status: string } | undefined;
  let applyBody: Record<string, unknown> | undefined;
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    try {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (typeof body.operation !== 'string' || !body.operation.startsWith('memory.')) { await route.continue(); return; }
      expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/);
      conversations.add(body.conversationId as string); expect(conversations.size).toBeLessThanOrEqual(4);
      writeFileSync(manifest, JSON.stringify([...conversations]), { mode: 0o600 }); // before backend dispatch
      browserOperations.push({ operation: body.operation, ...(typeof body.actionId === 'string' ? { actionId: body.actionId } : {}) });
      if (body.operation !== 'memory.apply') { await route.continue(); return; }
      applyCount++; expect(applyCount).toBe(1); applyBody = body;
      const real = await route.fetch({ maxRetries: 0, maxRedirects: 0 });
      expect(real.status()).toBe(200);
      const result = await real.json(); expect(result.ok).toBe(true); expect(result.receipt.status).toBe('applied');
      expect(result.receipt.actionId).toBe(body.actionId); expect(result.receipt.proposalId).toBe(body.proposalId);
      committed = result.receipt;
      // Independent HTTP transaction sees the receipt, proving durability before
      // delivery is dropped. APIRequestContext does not pass through page.route.
      const recovered = await page.context().request.post('/api/coach-assistant', { data: {
        version: 'coach-assistant.v2', operation: 'memory.receipt', conversationId: body.conversationId,
        turnId: randomUUID(), actionId: body.actionId,
      } });
      expect(recovered.status()).toBe(200); expect((await recovered.json()).receipt).toEqual(committed);
      await real.dispose(); await recovered.dispose();
      await route.abort('failed'); dropped = true;
    } catch (error) { routeFailure = error; await route.abort('failed').catch(() => {}); }
  });
  const responseFor = (operation: string) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant' && response.request().method() === 'POST' && response.request().postDataJSON().operation === operation);
  await loginAs(page, 'client'); await page.goto('/dashboard/workout');
  await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
  const panel = page.locator('#global-coach');
  const initialRead = responseFor('memory.read');
  await panel.locator('summary').filter({ hasText: 'Remembered context' }).click();
  expect((await initialRead).status()).toBe(200);
  const text = `Synthetic response-loss memory ${randomUUID()}`;
  await panel.getByRole('textbox', { name: 'What would you like to remember?', exact: true }).fill(text);
  const proposing = responseFor('memory.propose'); await panel.getByRole('button', { name: 'Review change', exact: true }).click();
  expect((await proposing).status()).toBe(200); expect(applyCount).toBe(0);
  await panel.getByRole('button', { name: 'Confirm change', exact: true }).click();
  await expect.poll(() => dropped || Boolean(routeFailure)).toBe(true); if (routeFailure) throw routeFailure;
  await expect(panel.getByRole('button', { name: 'Check change status', exact: true })).toBeVisible();
  await expect(panel.getByText('Memory change saved.', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'Close Ask Trophē', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ask Trophē', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
  await panel.locator('summary').filter({ hasText: 'Remembered context' }).click();
  await expect(panel.getByRole('button', { name: 'Check change status', exact: true })).toBeVisible();
  expect(applyCount).toBe(1);
  const checking = responseFor('memory.receipt'), refreshing = responseFor('memory.read');
  await panel.getByRole('button', { name: 'Check change status', exact: true }).click();
  const checked = await checking; expect(checked.status()).toBe(200);
  expect(checked.request().postDataJSON().actionId).toBe(applyBody!.actionId);
  expect((await checked.json()).receipt).toEqual(committed);
  const fresh = await refreshing; expect(fresh.status()).toBe(200); const snapshot = await fresh.json();
  expect(snapshot.memories.filter((memory: { text: string }) => memory.text === text)).toHaveLength(1);
  await expect(panel.getByText('Memory change saved.', { exact: true })).toBeVisible();
  await expect(panel.getByText(text, { exact: true })).toHaveCount(1);
  expect(browserOperations.slice(browserOperations.findIndex(op => op.operation === 'memory.apply'))).toEqual([
    { operation: 'memory.apply', actionId: applyBody!.actionId },
    { operation: 'memory.receipt', actionId: applyBody!.actionId }, { operation: 'memory.read' },
  ]);
  expect(applyCount).toBe(1); expect(routeFailure).toBeUndefined(); noPaid();
  // Existing parent consumes merged conversation manifest and removes exact rows.
});
