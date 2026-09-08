import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
test.skip(process.env.E2E_COACH_FOOD !== '1', 'Exclusive disposable Food HTTP runner');
test('meal row opens shared coach, reviews 250 to 150 grams and refreshes after durable receipt', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.protocol !== 'postgresql:' || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.COACH_SQL_ACTOR!, entryId = process.env.COACH_FOOD_ENTRY!;
  const manifest = process.env.COACH_FOOD_HTTP_ACTIONS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(root) === resolve(manifest)) throw new Error('invalid_manifest');
  const actions = new Set<string>(), conversations = new Set<string>();
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('food.')) {
      expect(body.entryId).toBe(entryId); expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/);
      conversations.add(body.conversationId as string);
    }
    if (body.operation === 'food.apply') {
      expect(body.entryId).toBe(entryId); expect(body.actionId).toMatch(/^[a-f0-9-]{36}$/);
      actions.add(body.actionId as string);
    }
    writeFileSync(manifest, JSON.stringify({ actionIds: [...actions], conversationIds: [...conversations] }), { mode: 0o600 });
    await route.continue();
  });
  const responseFor = (operation: string) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant'
    && response.request().method() === 'POST' && response.request().postDataJSON().operation === operation);
  try {
    await pool.query("UPDATE public.profiles SET language='en',timezone='UTC' WHERE id=$1", [actor]);
    await loginAs(page, 'client'); await page.goto('/dashboard/log');
    await expect(page.getByRole('button', { name: 'Ask Trophē', exact: true })).toBeVisible();
    await page.getByRole('button', { name: /^Breakfast, \d+ items$/ }).click();
    const reading = responseFor('food.read');
    await page.getByRole('button', { name: 'Review Isolated coach rice quantity with coach', exact: true }).click();
    expect((await reading).status()).toBe(200);
    const panel = page.locator('#global-coach');
    await expect(panel.getByText('Current entry · 250 g · 500 kcal', { exact: true })).toBeVisible();
    await panel.getByLabel('Grams', { exact: true }).fill('150');
    const proposing = responseFor('food.propose'); await panel.getByRole('button', { name: 'Review quantity change', exact: true }).click();
    const proposedResponse = await proposing; expect(proposedResponse.status()).toBe(200);
    const proposed = await proposedResponse.json(); expect(proposed).toMatchObject({ ok: true, storage: 'database', proposal: { before: { grams: 250, calories: 500 }, after: { grams: 150, calories: 300 }, reviewRequired: true } });
    expect(Number((await pool.query('SELECT qty_g FROM public.food_log WHERE id=$1 AND user_id=$2', [entryId, actor])).rows[0].qty_g)).toBe(250);
    await expect(panel.getByRole('table')).toContainText('250'); await expect(panel.getByRole('table')).toContainText('150');
    mkdirSync(resolve(root, 'coach-ui-evidence'), { recursive: true });
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'food-review-390.png') });
    const applying = responseFor('food.apply'), refreshing = responseFor('food.read');
    await panel.getByRole('button', { name: 'Confirm quantity change', exact: true }).click();
    const appliedResponse = await applying; expect(appliedResponse.status()).toBe(200);
    const applied = await appliedResponse.json(); expect(applied).toMatchObject({ ok: true, storage: 'database', receipt: { status: 'applied', proposalId: proposed.proposal.id }, refresh: { entryId, strategy: 'refetch' } });
    const fresh = await (await refreshing).json(); expect(fresh.snapshot).toMatchObject({ entryId, grams: 150, calories: 300, version: applied.receipt.resourceVersion });
    await expect(panel.getByText('Quantity saved. Current entry refreshed.', { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'food-receipt-390.png') });
    expect(actions.size).toBe(1);
    expect(Number((await pool.query('SELECT qty_g FROM public.food_log WHERE id=$1 AND user_id=$2', [entryId, actor])).rows[0].qty_g)).toBe(150);
    expect((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actor, [...actions][0]])).rowCount).toBe(1);
    await panel.getByRole('button', { name: 'Close Ask Trophē', exact: true }).click();
    const mealRow = page.getByRole('button', { name: 'Review Isolated coach rice quantity with coach', exact: true }).locator('..').locator('..');
    await expect(mealRow.getByText('300 kcal', { exact: true })).toBeVisible();
    await expect(mealRow.getByText('500 kcal', { exact: true })).toHaveCount(0);
    await page.reload(); await page.getByRole('button', { name: /^Breakfast, \d+ items$/ }).click();
    const rereading = responseFor('food.read'); await page.getByRole('button', { name: 'Review Isolated coach rice quantity with coach', exact: true }).click();
    expect((await (await rereading).json()).snapshot.grams).toBe(150);
    await expect(page.locator('#global-coach').getByText('Current entry · 150 g · 300 kcal', { exact: true })).toBeVisible();
    noPaid();
  } finally { await pool.end(); }
});
