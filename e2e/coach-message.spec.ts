import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import pg from 'pg';
import { expect, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_MESSAGE !== '1', 'Exclusive disposable coach-message runner');

test('client reviews exact recipient and text, stores once, and refreshes the canonical chat', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322' || target.pathname !== '/postgres'
    || target.username !== 'postgres' || target.password !== 'postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.COACH_SQL_ACTOR!, coachId = process.env.COACH_SQL_COACH!;
  const manifest = process.env.COACH_MESSAGE_HTTP_ACTIONS!, root = process.env.RUNNER_TEMP!;
  if (!manifest || !root || !isAbsolute(manifest) || !isAbsolute(root) || relative(resolve(root), resolve(manifest)).startsWith('..') || resolve(root) === resolve(manifest)) throw new Error('invalid_manifest');
  const observed: { actionId?: string; proposalIds: string[]; messageId?: string } = { proposalIds: [] };
  const operations: Record<string, unknown>[] = [];
  const save = () => writeFileSync(manifest, JSON.stringify(observed), { mode: 0o600 });
  save();
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const coachName = (await pool.query<{ full_name: string }>('SELECT full_name FROM public.profiles WHERE id=$1', [coachId])).rows[0]?.full_name;
  expect(coachName).toBeTruthy();
  const noPaid = await blockPaidRequests(page);
  await page.route('**/api/coach-assistant', async route => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    const response = await route.fetch();
    const result = await response.json() as Record<string, unknown>;
    if (typeof body.operation === 'string' && body.operation.startsWith('message.')) {
      operations.push(body);
      const proposal = result.proposal as { id?: unknown } | undefined;
      const receipt = result.receipt as { messageId?: unknown } | undefined;
      if (body.operation === 'message.propose' && typeof proposal?.id === 'string') observed.proposalIds.push(proposal.id);
      if (body.operation === 'message.apply' && typeof body.actionId === 'string') observed.actionId = body.actionId;
      if (typeof receipt?.messageId === 'string') observed.messageId = receipt.messageId;
    } else {
      const capability = result.capabilityResult as { result?: { proposal?: { id?: unknown } } } | undefined;
      const id = capability?.result?.proposal?.id;
      if (typeof id === 'string') observed.proposalIds.push(id);
    }
    save(); await route.fulfill({ response });
  });
  try {
    await loginAs(page, 'client'); await page.goto('/dashboard/messages');
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const panel = page.locator('#global-coach');
    const request = 'Redacta un mensaje a mi coach';
    await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill(request);
    await panel.getByRole('button', { name: 'Send question', exact: true }).click();
    await expect(panel.getByText(coachName, { exact: true })).toBeVisible();
    await expect(panel.getByText('Hola, ¿podrías ayudarme a revisar mi plan?', { exact: true })).toHaveCount(2);
    expect(operations).toHaveLength(0);

    const exactMessage = 'Hola coach, ¿podemos revisar mi plan mañana?';
    await panel.getByRole('textbox', { name: 'Message to your coach', exact: true }).fill(exactMessage);
    await expect(panel.getByRole('button', { name: 'Send to your coach', exact: true })).toHaveCount(0);
    await panel.getByRole('button', { name: 'Review message', exact: true }).click();
    await expect(panel.getByText(exactMessage, { exact: true })).toHaveCount(2);
    expect(operations.map(item => item.operation)).toEqual(['message.propose']);
    expect(operations[0]).toMatchObject({ coachId, after: { message: exactMessage } });
    expect((await pool.query('SELECT count(*)::int AS n FROM public.messages WHERE client_id=$1 AND coach_id=$2 AND body=$3', [actor, coachId, exactMessage])).rows[0].n).toBe(0);

    mkdirSync(resolve(root, 'coach-ui-evidence'), { recursive: true });
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'message-review-390.png') });
    await panel.getByRole('button', { name: 'Send to your coach', exact: true }).click();
    await expect(panel.getByText('Saved in your chat', { exact: true })).toBeVisible();
    expect(operations.map(item => item.operation)).toEqual(['message.propose', 'message.apply']);
    const applied = operations[1];
    expect(applied).toMatchObject({ coachId, reviewed: true }); expect(applied.actionId).toMatch(/^[a-f0-9-]{36}$/);
    expect((await pool.query('SELECT count(*)::int AS n FROM public.messages WHERE client_id=$1 AND coach_id=$2 AND body=$3', [actor, coachId, exactMessage])).rows[0].n).toBe(1);
    expect((await pool.query('SELECT count(*)::int AS n FROM private.coach_action_receipts WHERE actor_id=$1 AND action_id=$2', [actor, applied.actionId])).rows[0].n).toBe(1);

    const recovered = await page.context().request.post('/api/coach-assistant', { data: { version: 'coach-assistant.v2', conversationId: applied.conversationId, turnId: randomUUID(), operation: 'message.receipt', coachId, actionId: applied.actionId } });
    expect(recovered.status()).toBe(200);
    expect(await recovered.json()).toMatchObject({ ok: true, receipt: { actionId: applied.actionId, status: 'stored' }, refresh: { coachId, clientId: actor, strategy: 'refetch' } });
    await panel.getByRole('button', { name: 'Close Ask Trophē', exact: true }).click();
    await expect(page.getByText(exactMessage, { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(root, 'coach-ui-evidence', 'message-chat-refreshed-390.png') });
    noPaid();
  } finally { await pool.end(); }
});
