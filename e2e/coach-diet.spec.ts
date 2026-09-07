/** Prepared only. AG1 installs diet DDL and owns profile/ledger cleanup. */
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
test.skip(process.env.E2E_COACH_DIET !== '1', 'Exclusive disposable diet HTTP runner');
test('diet selection requires exact review and confirmation then recovers its receipt without reapplying', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const manifest = process.env.COACH_DIET_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(root) === resolve(manifest)) throw new Error('invalid_manifest');
  const old: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(old) || old.length > 4 || !old.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) throw new Error('invalid_manifest_contents');
  const conversations = new Set<string>(old);
  let apply: Record<string, unknown> | undefined, applyCount = 0;
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('diet.')) {
      expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/); conversations.add(body.conversationId as string);
      expect(conversations.size).toBeLessThanOrEqual(4);
      writeFileSync(manifest, JSON.stringify([...conversations]), { mode: 0o600 });
      if (body.operation === 'diet.apply') { apply = body; applyCount++; }
    }
    await route.continue();
  });
  const responseFor = (operation: string) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant' && response.request().method() === 'POST' && response.request().postDataJSON().operation === operation);
  await loginAs(page, 'client'); await page.goto('/dashboard/workout');
  await page.getByRole('button', { name: 'Ask coach', exact: true }).click();
  const panel = page.locator('#global-coach');
  const reading = responseFor('diet.read');
  await panel.locator('summary').filter({ hasText: 'Diet preference' }).click();
  const read = await reading; expect(read.status()).toBe(200); const initial = await read.json();
  expect(initial.ok).toBe(true); expect(initial.snapshot.profileId).toBe(process.env.COACH_SQL_ACTOR);
  const labels: Record<string, string> = { '': 'Not specified', omnivore: 'Omnivore', vegetarian: 'Vegetarian', vegan: 'Vegan', pescatarian: 'Pescatarian' };
  const current = initial.snapshot.preferences.dietPattern ?? '';
  expect(Object.hasOwn(labels, current)).toBe(true);
  const selector = panel.getByRole('combobox', { name: 'Diet preference', exact: true });
  await expect(selector).toHaveValue(current);
  // Null is a real undeclared value, never interpreted as omnivore.
  await expect(selector.locator('option[value=""]')).toHaveText('Not specified');
  const next = current === 'vegetarian' ? 'vegan' : 'vegetarian';
  await selector.selectOption(next); expect(applyCount).toBe(0);
  const proposing = responseFor('diet.propose');
  await panel.getByRole('button', { name: 'Review change', exact: true }).click();
  const proposed = await proposing; expect(proposed.status()).toBe(200); const proposal = (await proposed.json()).proposal;
  expect(proposal.before).toEqual(initial.snapshot.preferences);
  expect(proposal.after).toEqual({ version: 1, dietPattern: next });
  await expect(panel.getByText(`Before: ${labels[current]}`, { exact: true })).toBeVisible();
  await expect(panel.getByText(`After: ${labels[next]}`, { exact: true })).toBeVisible();
  expect(applyCount).toBe(0);
  const applying = responseFor('diet.apply'), refreshing = responseFor('diet.read');
  await panel.getByRole('button', { name: 'Confirm change', exact: true }).click();
  const applied = await applying; expect(applied.status()).toBe(200); const result = await applied.json();
  expect(result.ok).toBe(true); expect(result.receipt.status).toBe('applied');
  expect(apply).toMatchObject({ reviewed: true, proposalId: proposal.id, hash: proposal.hash, resourceVersion: proposal.resource.version });
  const refreshed = await refreshing; expect(refreshed.status()).toBe(200); const fresh = await refreshed.json();
  expect(fresh.snapshot.preferences).toEqual(proposal.after); expect(fresh.snapshot.version).toBe(result.receipt.resourceVersion);
  await expect(selector).toHaveValue(next); await expect(panel.getByText('Diet preference saved.', { exact: true })).toBeVisible();
  const receipt = await page.request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', operation: 'diet.receipt', profileId: apply!.profileId, conversationId: apply!.conversationId, turnId: randomUUID(), actionId: apply!.actionId } });
  expect(receipt.status()).toBe(200); expect((await receipt.json()).receipt).toEqual(result.receipt);
  const replay = await page.request.post('/api/coach-assistant', { data: apply });
  expect(replay.status()).toBe(200); expect((await replay.json()).receipt).toEqual(result.receipt);
  const finalRead = await page.request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', operation: 'diet.read', profileId: apply!.profileId, conversationId: apply!.conversationId, turnId: randomUUID() } });
  expect(finalRead.status()).toBe(200); expect((await finalRead.json()).snapshot).toEqual(fresh.snapshot);
  expect(applyCount).toBe(1); noPaid();
  // APIRequestContext replay is intentional; unchanged revision proves no reapply.
  // Parent owns cleanup through the merged conversation manifest, even on failure.
});
