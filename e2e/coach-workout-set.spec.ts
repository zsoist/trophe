import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_WORKOUT_SET !== '1', 'Exclusive disposable Workout set runner');

test('Workout composer reviews and durably corrects the server-selected latest set', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322'
    || target.pathname !== '/postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.E2E_CLIENT_ID!, setId = process.env.COACH_SET_ID!;
  const manifest = process.env.COACH_SET_HTTP_ACTIONS!, root = process.env.RUNNER_TEMP!;
  for (const id of [actor, setId]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root)
    || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_action_manifest');
  writeFileSync(manifest, '{}', { mode: 0o600 });
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  const operations: Record<string, unknown>[] = [];
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('set.')) {
      operations.push(body);
      if (body.operation === 'set.apply') writeFileSync(manifest, JSON.stringify({ actionId: body.actionId, proposalId: body.proposalId }), { mode: 0o600 });
    }
    await route.continue();
  });
  const readWorkspace = () => page.evaluate(id => localStorage.getItem(`trophe:workout-workspace:${id}`), actor);
  try {
    await loginAs(page, 'client');
    await page.goto('/dashboard/workout');
    const workspaceBefore = await readWorkspace();
    const setBefore = (await pool.query('SELECT reps FROM public.workout_sets WHERE id=$1', [setId])).rows[0];
    expect(setBefore?.reps).toBe(8);

    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const coach = page.locator('#global-coach');
    const message = 'Registré mal la última serie: fueron 10 repeticiones';
    await coach.getByRole('textbox', { name: 'Your question', exact: true }).fill(message);
    const conversationResponse = page.waitForResponse(response => {
      if (new URL(response.url()).pathname !== '/api/coach-assistant' || response.request().method() !== 'POST') return false;
      const body = response.request().postDataJSON();
      return body.message === message && body.operation === undefined;
    });
    await coach.getByRole('button', { name: 'Send question', exact: true }).click();
    const conversationHttp = await conversationResponse;
    const conversation = await conversationHttp.json();
    expect(conversationHttp.status(), conversation?.error?.code).toBe(200);
    expect(conversation).toMatchObject({
      ok: true,
      evaluation: { transport: 'injected_fixture' },
      telemetry: { costUsd: 0 },
      actionIntents: [{
        action: 'workout.set.reps.update', source: 'provider_tool', subjectId: actor,
        surface: 'workout', target: { selection: 'latest_open_session_set', reps: 10 }, reviewRequired: true,
      }],
      proposals: [], receipts: [],
    });

    const confirm = coach.getByRole('button', { name: 'Confirm set correction', exact: true });
    await expect(confirm).toBeVisible();
    await expect(coach.getByRole('table')).toContainText('8');
    await expect(coach.getByRole('table')).toContainText('10');
    expect((await pool.query('SELECT reps FROM public.workout_sets WHERE id=$1', [setId])).rows[0].reps).toBe(8);
    expect(operations.map(item => item.operation)).toEqual(['set.resolve', 'set.propose']);

    await confirm.click();
    await expect(coach.getByText('Set saved and refreshed · 10 reps', { exact: true })).toBeVisible();
    expect(operations.map(item => item.operation)).toEqual(['set.resolve', 'set.propose', 'set.apply', 'set.read']);
    const apply = operations.find(item => item.operation === 'set.apply')!;
    expect(apply).toMatchObject({ setId, reviewed: true });
    expect(apply.actionId).toMatch(/^[a-f0-9-]{36}$/);
    expect((await pool.query('SELECT reps FROM public.workout_sets WHERE id=$1', [setId])).rows[0].reps).toBe(10);
    expect((await pool.query('SELECT count(*)::int AS n FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actor, apply.actionId])).rows[0].n).toBe(1);
    expect(await readWorkspace()).toBe(workspaceBefore);

    const receiptHttp = await page.context().request.post('/api/coach-assistant', { data: {
      version: 'coach-assistant.v2', conversationId: apply.conversationId, turnId: randomUUID(),
      operation: 'set.receipt', setId, actionId: apply.actionId,
    } });
    expect(receiptHttp.status()).toBe(200);
    const recovered = await receiptHttp.json();
    expect(recovered).toMatchObject({ ok: true, receipt: { actionId: apply.actionId, status: 'applied' }, refresh: { setId } });
    noPaid();
  } finally {
    await pool.end();
  }
});
