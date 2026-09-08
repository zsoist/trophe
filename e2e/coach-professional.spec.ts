import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, test, type APIResponse, type BrowserContext, type Page } from '@playwright/test';
import type { CoachConversationRequest, CoachConversationResponse } from '../agents/coach-assistant/contracts';
import { blockPaidRequests, loginAs } from './helpers/auth';

const enabled = process.env.E2E_COACH_PROFESSIONAL === '1';
const flagOff = process.env.E2E_COACH_PROFESSIONAL_FLAG_OFF === '1';
test.skip(!enabled, 'Only the explicitly dispatched disposable Auth runner supplies this matrix');

function fixture(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing disposable fixture ${key}`);
  return value;
}

function databaseUrl(): string {
  const raw = fixture('DATABASE_URL');
  const url = new URL(raw);
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true'
    || !['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '54322' || url.pathname !== '/postgres' || url.search || url.hash) {
    throw new Error('Professional Coach Auth matrix requires the disposable GitHub loopback database');
  }
  return raw;
}

function request(subjectId: string, extras: Partial<CoachConversationRequest> = {}): CoachConversationRequest {
  return {
    version: 'coach-assistant.v2', conversationId: randomUUID(), turnId: randomUUID(),
    message: 'Explain the authorized records for this client.',
    context: { surface: 'messages', includeScreen: true, clientId: subjectId },
    ...extras,
  };
}

async function post(context: BrowserContext, body: CoachConversationRequest): Promise<APIResponse> {
  return context.request.post('/api/coach-assistant', { data: body });
}

function expectEmptyDenied(body: CoachConversationResponse) {
  expect(body).toMatchObject({ ok: false, snapshot: null, evidence: [], proposals: [], receipts: [], attachments: [], error: { code: 'forbidden' } });
  expect(body.output).toBeUndefined();
  expect(body.memories).toBeUndefined();
  expect(body.telemetry).toMatchObject({ model: null, provider: null, modelCalls: 0, costUsd: 0 });
}

function expectAuthorized(body: CoachConversationResponse, subjectId: string) {
  expect(body).toMatchObject({
    version: 'coach-assistant.v2', ok: true, mode: 'offline', dataSource: 'authorized_records',
    snapshot: { subjectId, actorRole: 'coach', access: 'assigned_professional', surface: 'messages', screenIncluded: true },
    proposals: [], receipts: [], attachments: [],
    telemetry: { model: null, provider: null, modelCalls: 0, costUsd: 0 },
  });
  expect(body.snapshot?.scopeKey).toMatch(/^[a-f0-9]{64}$/);
  expect(body.snapshot?.capabilities.find(item => item.key === 'messages')).toEqual({
    key: 'messages', status: 'not_connected', reason: 'messages_service_not_connected',
  });
}

async function openProfessionalCoach(page: Page, clientId: string) {
  await page.goto(`/coach/inbox/${clientId}`);
  await page.getByRole('button', { name: 'Ask Trophē' }).click();
  await expect(page.getByText(`Client · ${clientId.slice(0, 8)}`, { exact: true })).toBeVisible();
}

async function waitForWorkoutRead(pool: pg.Pool) {
  await expect.poll(async () => Number((await pool.query(
    "SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM workout_sessions%' AND pid<>pg_backend_pid()",
  )).rows[0].n), { timeout: 10_000 }).toBeGreaterThan(0);
}

test('professional v2: server scope, denials, isolation, revocation and stale turn', async ({ page, context }) => {
  test.skip(flagOff, 'The sequential flag-off pass verifies unchanged manual routes');
  const clientA = fixture('E2E_CLIENT_ID');
  const foreignB = fixture('E2E_FOREIGN_ID');
  const unassignedB = fixture('E2E_UNASSIGNED_ID');
  const coachId = fixture('E2E_COACH_ID');
  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 4, connectionTimeoutMillis: 5000 });
  const noPaid = await blockPaidRequests(page);
  try {
    await loginAs(page, 'coach');

    await test.step('assigned A is server-bound and client history, memory summaries and attachments are discarded', async () => {
      const canary = `CROSSED-${randomUUID()}`;
      const response = await post(context, request(clientA, {
        history: [
          { role: 'assistant', text: `${canary}-history` },
          { role: 'assistant', text: `${canary}-memory`, kind: 'memory_summary' },
        ],
        attachments: [{ id: randomUUID(), kind: 'image', status: 'available' }],
      }));
      expect(response.status()).toBe(200);
      const body = await response.json() as CoachConversationResponse;
      expectAuthorized(body, clientA);
      expect(JSON.stringify(body)).not.toContain(canary);
    });

    await test.step('foreign org, same-org unassigned and forged clientId are denied empty', async () => {
      for (const subjectId of [foreignB, unassignedB]) {
        const response = await post(context, request(subjectId));
        expect(response.status()).toBe(403);
        expectEmptyDenied(await response.json() as CoachConversationResponse);
      }
      const forged = await post(context, request(clientA, {
        context: { surface: 'messages', includeScreen: true, clientId: foreignB },
      }));
      expect(forged.status()).toBe(403);
      expectEmptyDenied(await forged.json() as CoachConversationResponse);
    });

    await test.step('relationship revoked during a blocked turn fails the final authorization', async () => {
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE workout_sessions IN ACCESS EXCLUSIVE MODE');
        const pending = post(context, request(clientA));
        await waitForWorkoutRead(pool);
        expect((await pool.query('UPDATE client_profiles SET coach_id=NULL WHERE user_id=$1 AND coach_id=$2', [clientA, coachId])).rowCount).toBe(1);
        await blocker.query('ROLLBACK');
        const response = await pending;
        expect(response.status()).toBe(403);
        expectEmptyDenied(await response.json() as CoachConversationResponse);
      } finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
        await pool.query('UPDATE client_profiles SET coach_id=$2 WHERE user_id=$1 AND coach_id IS NULL', [clientA, coachId]);
      }
    });

    await test.step('A to B navigation aborts the old HTTP turn and drops A state', async () => {
      await openProfessionalCoach(page, clientA);
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE workout_sessions IN ACCESS EXCLUSIVE MODE');
        const failed = page.waitForEvent('requestfailed', { predicate: item => new URL(item.url()).pathname === '/api/coach-assistant' });
        await page.getByLabel('Your question').fill('PRIVATE-A-TURN');
        await page.getByRole('button', { name: 'Send question' }).click();
        await waitForWorkoutRead(pool);
        await page.goto(`/coach/inbox/${unassignedB}`);
        await failed;
      } finally {
        await blocker.query('ROLLBACK').catch(() => undefined);
        blocker.release();
      }
      await page.getByRole('button', { name: 'Ask Trophē' }).click();
      await expect(page.getByText(`Client · ${unassignedB.slice(0, 8)}`, { exact: true })).toBeVisible();
      await expect(page.getByText('PRIVATE-A-TURN', { exact: true })).toHaveCount(0);
      await expect(page.getByLabel('Your question')).toHaveValue('');
    });

    await test.step('browser rejects mismatched response subject and scope', async () => {
      await page.goto(`/coach/inbox/${clientA}`);
      await page.route('**/api/coach-assistant', async route => {
        const upstream = await route.fetch();
        const body = await upstream.json() as CoachConversationResponse;
        if (body.ok && body.snapshot) body.snapshot.subjectId = foreignB;
        await route.fulfill({ response: upstream, json: body });
      }, { times: 1 });
      await page.getByRole('button', { name: 'Ask Trophē' }).click();
      await page.getByLabel('Your question').fill('SUBJECT-MISMATCH-CANARY');
      await page.getByRole('button', { name: 'Send question' }).click();
      await expect(page.getByText('This request could not finish. You can edit your question and send it again.')).toBeVisible();
      await expect(page.getByText(/Offline record summary/)).toHaveCount(0);

      await page.reload();
      let acceptedScope = '';
      await page.route('**/api/coach-assistant', async route => {
        const upstream = await route.fetch();
        const body = await upstream.json() as CoachConversationResponse;
        if (body.ok && body.snapshot) {
          if (!acceptedScope) acceptedScope = body.snapshot.scopeKey;
          else body.snapshot.scopeKey = acceptedScope === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
        }
        await route.fulfill({ response: upstream, json: body });
      }, { times: 2 });
      await page.getByRole('button', { name: 'Ask Trophē' }).click();
      await page.getByLabel('Your question').fill('First scoped turn');
      await page.getByRole('button', { name: 'Send question' }).click();
      await expect(page.getByText(/Offline record summary/).first()).toBeVisible();
      await page.getByLabel('Your question').fill('BAD-SCOPE-CANARY');
      await page.getByRole('button', { name: 'Send question' }).click();
      await expect(page.getByText('This request could not finish. You can edit your question and send it again.')).toBeVisible();
      await expect(page.getByText(/BAD-SCOPE-CANARY/)).toHaveCount(1);
    });
    noPaid();
  } finally {
    await pool.end();
  }
});

test('professional flag off: manual routes remain usable and never call the assistant', async ({ page }) => {
  test.skip(!flagOff, 'Only the sequential flag-off server runs this check');
  const clientA = fixture('E2E_CLIENT_ID');
  const attempted: string[] = [];
  page.on('request', item => {
    if (new URL(item.url()).pathname === '/api/coach-assistant') attempted.push(item.method());
  });
  const noPaid = await blockPaidRequests(page);
  await loginAs(page, 'coach');
  const routes = [
    `/coach/inbox/${clientA}`,
    `/coach/client/${clientA}`,
    '/coach/calendar',
    '/coach/questionnaires',
    '/coach/protocols',
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('[data-coach-mobile-workspace], main, #main-content').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ask Trophē' })).toHaveCount(0);
  }
  expect(attempted).toEqual([]);
  noPaid();
});
