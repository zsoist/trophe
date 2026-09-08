import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_DURABLE !== '1', 'Exclusive disposable durable HTTP runner');

test('global v2 UI reviews and saves durable preferences; HTTP replay, stale version and revocation remain guarded', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || !['postgres:', 'postgresql:'].includes(target.protocol) || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.COACH_SQL_ACTOR!, org = process.env.COACH_SQL_ORG!;
  for (const id of [actor, org]) expect(id).toMatch(/^[a-f0-9-]{36}$/);
  const manifest = process.env.COACH_SQL_HTTP_ACTIONS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root)
    || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(manifest) === resolve(root)) throw new Error('invalid_action_manifest');
  const actionIds = new Set<string>();
  const record = (body: Record<string, unknown>) => {
    if (body.operation !== 'apply') return;
    expect(body.actionId).toMatch(/^[a-f0-9-]{36}$/);
    actionIds.add(body.actionId as string);
    writeFileSync(manifest, JSON.stringify([...actionIds]), { mode: 0o600 });
  };
  writeFileSync(manifest, '[]', { mode: 0o600 });
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  let uiApply: Record<string, unknown> | undefined;
  // Observe and persist IDs before forwarding unchanged real HTTP requests.
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    record(body); if (body.operation === 'apply') uiApply = body;
    await route.continue();
  });
  const post = async (body: Record<string, unknown>) => { record(body); return page.context().request.post('/api/coach-assistant', { data: body }); };
  const responseFor = (operation?: string) => page.waitForResponse(response => {
    if (new URL(response.url()).pathname !== '/api/coach-assistant' || response.request().method() !== 'POST') return false;
    return response.request().postDataJSON().operation === operation;
  });
  try {
    await pool.query("UPDATE public.profiles SET language='en' WHERE id=$1", [actor]);
    await loginAs(page, 'client'); await page.goto('/dashboard/workout');
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const panel = page.locator('#global-coach');
    await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill('Show my workout records today');
    const reading = responseFor(); await panel.getByRole('button', { name: 'Send question', exact: true }).click();
    const readResponse = await reading; expect(readResponse.status()).toBe(200);
    const initial = await readResponse.json();
    expect(initial).toMatchObject({ ok: true, version: 'coach-assistant.v2', dataSource: 'authorized_records', telemetry: { modelCalls: 0, costUsd: 0 } });
    expect(initial.profile.source).toBe('authorized_profile');
    expect(initial.snapshot.capabilities.find((c: { key: string }) => c.key === 'actions').reason).toBe('durable_preferences_only');
    const duration = initial.profile.preferences.durationMinutes === 45 ? 60 : 45;
    await panel.getByText('Your profile & memory', { exact: true }).click();
    await panel.getByLabel('Workout duration', { exact: true }).selectOption(String(duration));
    const proposing = responseFor('propose'); await panel.getByRole('button', { name: 'Review change', exact: true }).click();
    const proposalResponse = await proposing; expect(proposalResponse.status()).toBe(200);
    const proposal = (await proposalResponse.json()).proposal;
    expect(proposal.resource.version).toBe(initial.profile.version);
    expect((await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actor])).rows[0].workout_preferences.durationMinutes).toBe(initial.profile.preferences.durationMinutes);
    await expect(panel.getByRole('button', { name: 'Confirm change', exact: true })).toBeVisible();
    const applying = responseFor('apply'); await panel.getByRole('button', { name: 'Confirm change', exact: true }).click();
    const applyResponse = await applying; expect(applyResponse.status()).toBe(200);
    const applied = await applyResponse.json(); expect(applied).toMatchObject({ ok: true, storage: 'database', receipt: { status: 'applied' } });
    await expect(panel.getByText('Preference saved.', { exact: true })).toBeVisible();
    expect(uiApply).toBeDefined(); expect(applied.receipt.actionId).toBe(uiApply!.actionId);
    const header = { version: 'coach-assistant.v2', conversationId: initial.conversationId, turnId: randomUUID() };
    const receiptRequest = { ...header, operation: 'receipt', actionId: applied.receipt.actionId };
    expect((await (await post(receiptRequest)).json()).receipt).toEqual(applied.receipt);
    expect((await (await post(uiApply!)).json()).receipt).toEqual(applied.receipt);
    await page.reload();
    const refreshedResponse = await post({ ...header, message: 'Show my workout records today' }); expect(refreshedResponse.status()).toBe(200);
    const refreshed = await refreshedResponse.json();
    expect(refreshed.profile).toMatchObject({ version: applied.receipt.resourceVersion, preferences: { durationMinutes: duration } });
    const staleResponse = await post({ ...header, operation: 'propose', action: 'preference.update', resourceVersion: refreshed.profile.version, after: { durationMinutes: 20 } });
    expect(staleResponse.status()).toBe(200); const stale = (await staleResponse.json()).proposal;
    await pool.query("UPDATE public.client_profiles SET workout_preferences=jsonb_set(workout_preferences,'{durationMinutes}',$2::jsonb) WHERE user_id=$1", [actor, JSON.stringify(30)]);
    const rejected = await post({ ...header, operation: 'apply', actionId: randomUUID(), proposalId: stale.id, hash: stale.hash, resourceVersion: stale.resource.version });
    expect(rejected.status()).toBe(409); expect((await rejected.json()).error).toBe('version_conflict');
    const removed = await pool.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=$2 RETURNING role', [org, actor]);
    expect(removed.rowCount).toBe(1);
    try { const denied = await post(receiptRequest); expect(denied.status()).toBe(403); expect((await denied.json()).error).toBe('forbidden'); }
    finally { await pool.query('INSERT INTO public.organization_members(org_id,user_id,role) VALUES($1,$2,$3)', [org, actor, removed.rows[0].role]); }
    noPaid();
  } finally { await pool.end(); }
});
