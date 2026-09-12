/** Runs only inside the disposable Progress SQL parent. */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_PROGRESS !== '1', 'Exclusive disposable Progress HTTP runner');
test('reviewed measurement survives a lost response and refetches the canonical record without reapply', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const manifest = process.env.COACH_PROGRESS_HTTP_THREADS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(root) === resolve(manifest)) throw new Error('invalid_manifest');
  const old: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(old) || old.length > 4 || !old.every(id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id))) throw new Error('invalid_manifest_contents');
  const conversations = new Set<string>(old); const operations: Array<{ operation: string; actionId?: string }> = [];
  let applyCount = 0, dropped = false, routeFailure: unknown, applyBody: Record<string, unknown> | undefined, committed: Record<string, unknown> | undefined;
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    try {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      if (body.operation !== 'progress.read' && !(typeof body.operation === 'string' && body.operation.startsWith('measurement.'))) { await route.continue(); return; }
      expect(body.conversationId).toMatch(/^[a-f0-9-]{36}$/); conversations.add(body.conversationId as string); expect(conversations.size).toBeLessThanOrEqual(4);
      writeFileSync(manifest, JSON.stringify([...conversations]), { mode: 0o600 });
      operations.push({ operation: body.operation as string, ...(typeof body.actionId === 'string' ? { actionId: body.actionId } : {}) });
      if (body.operation !== 'measurement.apply') { await route.continue(); return; }
      applyCount++; expect(applyCount).toBe(1); applyBody = body;
      const real = await route.fetch({ maxRetries: 0, maxRedirects: 0 }); expect(real.status()).toBe(200);
      const result = await real.json(); expect(result).toMatchObject({ ok: true, receipt: { status: 'applied', actionId: body.actionId, proposalId: body.proposalId }, refresh: { strategy: 'refetch' } });
      committed = result.receipt;
      const recovered = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', operation: 'measurement.receipt', clientId: body.clientId, conversationId: body.conversationId, turnId: randomUUID(), actionId: body.actionId } });
      expect(recovered.status()).toBe(200); expect((await recovered.json()).receipt).toEqual(committed);
      await real.dispose(); await recovered.dispose(); await route.abort('failed'); dropped = true;
    } catch (error) { routeFailure = error; await route.abort('failed').catch(() => {}); }
  });
  const responseFor = (operation: string) => page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant' && response.request().method() === 'POST' && response.request().postDataJSON().operation === operation);
  await loginAs(page, 'client'); await page.goto('/dashboard/progress');
  await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click(); const panel = page.locator('#global-coach');
  const reading = responseFor('progress.read');
  if (await panel.getByRole('button', { name: 'Saved conversations', exact: true }).getAttribute('aria-expanded') === 'false') await panel.getByRole('button', { name: 'Saved conversations', exact: true }).click();
  await panel.locator('summary').filter({ hasText: 'Progress measurements' }).click();
  const initialResponse = await reading; expect(initialResponse.status()).toBe(200); const initial = await initialResponse.json();
  expect(initial).toMatchObject({ ok: true, snapshot: { subjectId: process.env.COACH_SQL_ACTOR, window: { days: 90, timezone: 'America/Bogota' } } });
  const values = { measuredDate: initial.snapshot.window.end as string, weightKg: 73.25, bodyFatPct: 17.5, waistCm: 80.75 };
  await panel.getByLabel('Date', { exact: true }).fill(values.measuredDate);
  await panel.getByLabel('Weight (kg)', { exact: true }).fill(String(values.weightKg));
  await panel.getByLabel('Body fat (%)', { exact: true }).fill(String(values.bodyFatPct));
  await panel.getByLabel('Waist (cm)', { exact: true }).fill(String(values.waistCm));
  const proposing = responseFor('measurement.propose'); await panel.getByRole('button', { name: 'Review measurement', exact: true }).click();
  const proposalResponse = await proposing; expect(proposalResponse.status()).toBe(200); const proposal = (await proposalResponse.json()).proposal;
  expect(proposal).toMatchObject({ before: null, after: values, precondition: initial.snapshot.version, inputSource: 'explicit_user', reviewRequired: true });
  expect(applyCount).toBe(0); await panel.getByRole('button', { name: 'Confirm measurement', exact: true }).click();
  await expect.poll(() => dropped || Boolean(routeFailure)).toBe(true); if (routeFailure) throw routeFailure;
  await expect(panel.getByRole('button', { name: 'Check change status', exact: true })).toBeVisible();
  await expect(panel.getByText('Measurement saved and refreshed.', { exact: true })).toHaveCount(0);
  await panel.getByRole('button', { name: 'New conversation', exact: true }).click();
  if (await panel.getByRole('button', { name: 'Saved conversations', exact: true }).getAttribute('aria-expanded') === 'false') await panel.getByRole('button', { name: 'Saved conversations', exact: true }).click();
  await panel.locator('summary').filter({ hasText: 'Progress measurements' }).click();
  await expect(panel.getByRole('button', { name: 'Check change status', exact: true })).toBeVisible(); expect(applyCount).toBe(1);
  const checking = responseFor('measurement.receipt'), refreshing = responseFor('progress.read');
  await panel.getByRole('button', { name: 'Check change status', exact: true }).click();
  const checked = await checking; expect(checked.status()).toBe(200); expect(checked.request().postDataJSON().actionId).toBe(applyBody!.actionId); expect((await checked.json()).receipt).toEqual(committed);
  const freshResponse = await refreshing; expect(freshResponse.status()).toBe(200); const fresh = await freshResponse.json();
  expect(fresh.snapshot.measurements).toContainEqual({ id: proposal.id, ...values });
  await expect(panel.getByText('Measurement saved and refreshed.', { exact: true })).toBeVisible();
  expect(operations.slice(operations.findIndex(item => item.operation === 'measurement.apply'))).toEqual([
    { operation: 'measurement.apply', actionId: applyBody!.actionId }, { operation: 'measurement.receipt', actionId: applyBody!.actionId }, { operation: 'progress.read' },
  ]);
  expect(applyCount).toBe(1); noPaid();
});
