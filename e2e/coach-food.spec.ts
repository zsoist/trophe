import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_FOOD !== '1', 'Exclusive disposable Food HTTP runner');

test('Food composer reviews 250 to 150 grams and refreshes the meal after a durable receipt', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.protocol !== 'postgresql:' || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.COACH_SQL_ACTOR!, entryId = process.env.COACH_FOOD_ENTRY!;
  const manifest = process.env.COACH_FOOD_HTTP_ACTIONS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(root) === resolve(manifest)) throw new Error('invalid_manifest');
  const actions = new Set<string>(), conversations = new Set<string>();
  const operations: Record<string, unknown>[] = [];
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('food.')) {
      operations.push(body);
      expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/);
      conversations.add(body.conversationId as string);
      if (body.operation === 'food.resolve') expect(body).toMatchObject({ expectedPreviousGrams: 250 });
      else expect(body.entryId).toBe(entryId);
    }
    if (body.operation === 'food.apply') {
      expect(body.actionId).toMatch(/^[a-f0-9-]{36}$/);
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
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const panel = page.locator('#global-coach');
    const message = 'Fueron 150 gramos, no 250';
    await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill(message);
    const conversationResponse = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/api/coach-assistant' || response.request().method() !== 'POST') return false;
      const body = response.request().postDataJSON();
      return body.message === message && body.operation === undefined;
    });
    await panel.getByRole('button', { name: 'Send question', exact: true }).click();
    const conversationHttp = await conversationResponse;
    const conversation = await conversationHttp.json();
    expect(conversationHttp.status(), conversation?.error?.code).toBe(200);
    expect(conversation).toMatchObject({
      ok: true,
      evaluation: { transport: 'injected_fixture' },
      telemetry: { costUsd: 0 },
      actionIntents: [{
        action: 'food.quantity.update', source: 'provider_tool', subjectId: actor, surface: 'food',
        target: { selection: 'authorized_food_entry', entryHintId: null, previousGrams: 250, grams: 150 }, reviewRequired: true,
      }],
      proposals: [], receipts: [],
    });

    const confirm = panel.getByRole('button', { name: 'Confirm quantity change', exact: true });
    await expect(confirm).toBeVisible();
    await expect(panel.getByRole('table')).toContainText('250');
    await expect(panel.getByRole('table')).toContainText('150');
    expect(operations.map(item => item.operation)).toEqual(['food.resolve', 'food.propose']);
    expect(operations[0]).toMatchObject({ expectedPreviousGrams: 250 });
    expect(operations[0].loggedDateHint).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const proposed = operations[1];
    expect(proposed).toMatchObject({ entryId, after: { grams: 150 } });
    expect(Number((await pool.query('SELECT qty_g FROM public.food_log WHERE id=$1 AND user_id=$2', [entryId, actor])).rows[0].qty_g)).toBe(250);

    mkdirSync(resolve(root, 'coach-ui-evidence'), { recursive: true });
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'food-review-390.png') });
    const applying = responseFor('food.apply'), refreshing = responseFor('food.read');
    await confirm.click();
    const appliedResponse = await applying; expect(appliedResponse.status()).toBe(200);
    const applied = await appliedResponse.json();
    expect(applied).toMatchObject({ ok: true, storage: 'database', receipt: { status: 'applied', proposalId: expect.any(String) }, refresh: { entryId, strategy: 'refetch' } });
    const fresh = await (await refreshing).json();
    expect(fresh.snapshot).toMatchObject({ entryId, grams: 150, calories: 300, version: applied.receipt.resourceVersion });
    await expect(panel.getByText('Quantity saved. Current entry refreshed.', { exact: true })).toBeVisible();
    expect(operations.map(item => item.operation)).toEqual(['food.resolve', 'food.propose', 'food.apply', 'food.read']);
    const apply = operations[2];
    expect(apply).toMatchObject({ entryId, reviewed: true, resourceVersion: proposed.resourceVersion });
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'food-receipt-390.png') });
    expect(actions.size).toBe(1);
    expect(Number((await pool.query('SELECT qty_g FROM public.food_log WHERE id=$1 AND user_id=$2', [entryId, actor])).rows[0].qty_g)).toBe(150);
    expect((await pool.query('SELECT id FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actor, [...actions][0]])).rowCount).toBe(1);

    await panel.getByRole('button', { name: 'Close Ask Trophē', exact: true }).click();
    await page.getByRole('button', { name: /^Breakfast, \d+ items$/ }).click();
    const mealRow = page.getByRole('button', { name: 'Review Isolated coach rice quantity with coach', exact: true }).locator('..').locator('..');
    await expect(mealRow.getByText('300 kcal', { exact: true })).toBeVisible();
    await expect(mealRow.getByText('500 kcal', { exact: true })).toHaveCount(0);
    await page.reload(); await page.getByRole('button', { name: /^Breakfast, \d+ items$/ }).click();
    const persistedRow = page.getByRole('button', { name: 'Review Isolated coach rice quantity with coach', exact: true }).locator('..').locator('..');
    await expect(persistedRow.getByText('300 kcal', { exact: true })).toBeVisible();
    noPaid();
  } finally { await pool.end(); }
});
