import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
test.skip(process.env.E2E_COACH_MEMORY !== '1', 'Exclusive disposable memory HTTP runner');

test('memory review, save, correction and deletion use authenticated HTTP with receipt recovery', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  expect(process.env.CI).toBe('true'); expect(process.env.GITHUB_ACTIONS).toBe('true'); expect(process.env.CI_REAL_SUPABASE).toBe('1');
  expect(target.origin).toBe('null'); expect(target.protocol).toBe('postgresql:'); expect(target.hostname).toBe('127.0.0.1'); expect(target.port).toBe('54322'); expect(target.pathname).toBe('/postgres');
  const manifest = process.env.COACH_MEMORY_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_manifest');
  const conversations = new Set<string>();
  let lastApply: Record<string, unknown> | undefined;
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('memory.')) {
      expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/); conversations.add(body.conversationId as string);
      writeFileSync(manifest, JSON.stringify([...conversations]), { mode: 0o600 });
      if (body.operation === 'memory.apply') lastApply = body;
    }
    await route.continue();
  });
  const noPaid = await blockPaidRequests(page);
  const responseFor = (operation: string) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant' && response.request().method() === 'POST' && response.request().postDataJSON().operation === operation);
  await loginAs(page, 'client'); await page.goto('/dashboard/workout');
  await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
  const panel = page.locator('#global-coach');
  const reading = responseFor('memory.read');
  if (await panel.getByRole('button', { name: 'Saved conversations', exact: true }).getAttribute('aria-expanded') === 'false') await panel.getByRole('button', { name: 'Saved conversations', exact: true }).click();
  await panel.locator('summary').filter({ hasText: 'Remembered context' }).click();
  expect((await reading).status()).toBe(200);
  await panel.getByRole('textbox', { name: 'What would you like to remember?', exact: true }).fill('I prefer short morning sessions.');
  const proposing = responseFor('memory.propose'); await panel.getByRole('button', { name: 'Review change', exact: true }).click();
  const proposed = await (await proposing).json(); expect(proposed.ok).toBe(true);
  expect(lastApply).toBeUndefined();
  await expect(panel.getByText('After: I prefer short morning sessions.', { exact: true })).toBeVisible();
  const applying = responseFor('memory.apply'), refreshing = responseFor('memory.read');
  await panel.getByRole('button', { name: 'Confirm change', exact: true }).click();
  const applied = await (await applying).json(); expect(applied.receipt.status).toBe('applied');
  expect((await refreshing).status()).toBe(200);
  await expect(panel.getByText('Memory change saved.', { exact: true })).toBeVisible();
  const receipt = await page.request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', conversationId: lastApply!.conversationId, turnId: lastApply!.turnId, operation: 'memory.receipt', actionId: lastApply!.actionId } });
  expect(receipt.status()).toBe(200); expect((await receipt.json()).receipt).toEqual(applied.receipt);
  const replay = await page.request.post('/api/coach-assistant', { data: lastApply }); expect(replay.status()).toBe(200); expect((await replay.json()).receipt).toEqual(applied.receipt);
  await panel.getByRole('button', { name: 'Edit memory', exact: true }).click();
  await panel.getByRole('textbox', { name: 'Corrected memory', exact: true }).fill('I prefer evening sessions.');
  const correcting = responseFor('memory.correct'); await panel.getByRole('button', { name: 'Review change', exact: true }).click(); expect((await correcting).status()).toBe(200);
  const corrected = responseFor('memory.apply'), correctedRead = responseFor('memory.read');
  await panel.getByRole('button', { name: 'Confirm change', exact: true }).click(); expect((await corrected).status()).toBe(200); expect((await correctedRead).status()).toBe(200);
  await expect(panel.getByRole('textbox', { name: 'What would you like to remember?', exact: true })).toHaveValue('');
  await expect(panel.getByText('I prefer evening sessions.', { exact: true })).toBeVisible();
  const deleting = responseFor('memory.delete'); await panel.getByRole('button', { name: 'Delete memory', exact: true }).click(); expect((await deleting).status()).toBe(200);
  const deleted = responseFor('memory.apply'), deletedRead = responseFor('memory.read');
  await panel.getByRole('button', { name: 'Confirm change', exact: true }).click(); expect((await deleted).status()).toBe(200); expect((await deletedRead).status()).toBe(200);
  await expect(panel.getByText('No memories in this context.', { exact: true })).toBeVisible();
  expect(conversations.size).toBe(1); noPaid();
});
