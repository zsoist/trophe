import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, test, type Page } from '@playwright/test';
import type { CoachResponse } from '../agents/coach-assistant/contracts';
import { blockPaidRequests, loginAs } from './helpers/auth';

const enabled = process.env.E2E_COACH_WEEK === '1';
const flagOff = process.env.E2E_COACH_FLAG_OFF === '1';
test.skip(!enabled, 'Only the explicitly dispatched disposable Auth runner supplies this matrix');

function fixtureEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing disposable fixture ${key}`);
  return value;
}
function databaseUrl(): string {
  const raw = fixtureEnv('DATABASE_URL');
  const url = new URL(raw);
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true'
    || !['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '54322' || url.pathname !== '/postgres' || url.search || url.hash) {
    throw new Error('Coach Auth matrix requires the disposable GitHub loopback database');
  }
  return raw;
}
const surface = (page: Page) => page.getByRole('region', { name: 'Your training, explained' });
const fact = (body: CoachResponse, id: string) => body.evidence.find(item => item.id === id);

function assertOffline(body: CoachResponse) {
  expect(body).toMatchObject({ version: 'coach-assistant.v1', mode: 'offline', dataSource: 'authorized_records' });
  expect(body.telemetry).toMatchObject({ costUsd: 0, modelCalls: 0, model: null, provider: null });
}
async function week(page: Page): Promise<CoachResponse> {
  const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/coach-assistant' && res.request().method() === 'POST');
  await surface(page).getByRole('button', { name: 'My week', exact: true }).click();
  const http = await response;
  expect(http.status()).toBe(200);
  const body = await http.json() as CoachResponse;
  assertOffline(body);
  expect(body.ok).toBe(true);
  await expect(surface(page).getByText('Record summary · No AI model used', { exact: true })).toBeVisible();
  await expect(surface(page).getByText('Example data · Private prototype')).toHaveCount(0);
  expect(body.output?.evidenceRefs.every(id => body.evidence.some(item => item.id === id))).toBe(true);
  return body;
}


async function finishDraft(page: Page, pool: pg.Pool, clientId: string, name: string) {
  await page.getByRole('button', { name: 'Review workout', exact: true }).click();
  await page.getByRole('button', { name: 'Start workout', exact: true }).click();
  const row = page.locator('[data-set-row]').first();
  await row.getByRole('spinbutton', { name: 'Weight in kg' }).fill('20');
  await row.getByRole('spinbutton', { name: 'Reps', exact: true }).fill('10');
  await row.getByRole('button', { name: 'Complete set', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Undo set', exact: true })).toHaveCount(1);
  await expect(page.getByLabel('Rest timer', { exact: true })).toBeVisible();
  await expect(surface(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Undo set', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Finish Workout', exact: true }).click();
  await page.getByRole('dialog', { name: 'Finish workout?' }).getByRole('button', { name: 'Save and finish' }).click();
  await expect(page.getByRole('heading', { name: 'Workout complete', exact: true })).toBeVisible();
  const saved = await pool.query('SELECT id, completed_at FROM workout_sessions WHERE user_id=$1 AND name=$2', [clientId, name]);
  expect(saved.rows).toHaveLength(1);
  expect(saved.rows[0].completed_at).toBeTruthy();
  expect(Number((await pool.query('SELECT count(*) AS n FROM workout_sets WHERE session_id=$1 AND reps=10 AND weight_kg=20', [saved.rows[0].id])).rows[0].n)).toBe(1);
}

test('week: real login, authorized SQL facts, partial/empty records, denial, failure and cancellation', async ({ page, browser }) => {
  test.skip(flagOff, 'The second sequential pass exercises flag-off Workout');
  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 3, connectionTimeoutMillis: 5000 });
  const clientId = fixtureEnv('E2E_CLIENT_ID');
  const coachId = fixtureEnv('E2E_COACH_ID');
  const foreignId = fixtureEnv('E2E_FOREIGN_ID');
  const day = fixtureEnv('E2E_COACH_DAY');
  const assertNoPaidRequests = await blockPaidRequests(page);
  let planBefore: unknown;
  let draftBefore: unknown;
  const draft = () => page.evaluate(id => {
    const value = localStorage.getItem(`trophe:workout-workspace:${id}`);
    return value ? JSON.parse(value).draft : null;
  }, clientId);
  try {
    await test.step('Log in through the real application and check sufficient week evidence', async () => {
      await loginAs(page, 'client');
      await page.goto('/dashboard/workout');
      await expect(surface(page)).toBeVisible();
      const body = await week(page);
      expect(fact(body, 'workout.completedSessions')?.value).toBe(2);
      expect(fact(body, 'workout.sets')?.value).toBe(3);
      expect(fact(body, 'workout.reps')?.value).toBe(23);
      expect(fact(body, 'workout.volume')).toMatchObject({ value: 380, completeness: 'complete' });
      expect(fact(body, 'nutrition.calories')?.value).toBe(500);
      expect(fact(body, 'plan.sets')?.value).toBe(3);
      const windowStart = new Date(`${day}T12:00:00Z`);
      windowStart.setUTCDate(windowStart.getUTCDate() - 6);
      expect(fact(body, 'workout.sets')?.window).toEqual({ start: windowStart.toISOString().slice(0, 10), end: day, days: 7, timezone: 'UTC' });
      await surface(page).getByText('Records used', { exact: true }).click();
      await expect(surface(page).getByText('3 working sets were recorded in completed sessions.', { exact: true })).toBeVisible();
      await expect(surface(page).getByText('Suggestions to discuss', { exact: true })).toBeVisible();
      planBefore = (await pool.query('SELECT id, status, name FROM workout_programs WHERE client_id=$1 ORDER BY id', [clientId])).rows;
      await surface(page).getByRole('button', { name: 'Close answer' }).click();
    });

    await test.step('An edited workout survives navigation before assistant failure', async () => {
      await page.getByRole('button', { name: 'Review plan', exact: true }).first().click();
      await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
      await page.getByRole('textbox', { name: 'Workout name', exact: true }).fill('Auth week durable draft');
      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Continue editing', exact: true })).toBeVisible();
      draftBefore = await draft();
      expect(draftBefore).toBeTruthy();
    });

    await test.step('A real blocked SQL read fails honestly; explicit retry recovers', async () => {
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE workout_sessions IN ACCESS EXCLUSIVE MODE');
        const response = page.waitForResponse(res => new URL(res.url()).pathname === '/api/coach-assistant');
        await surface(page).getByRole('button', { name: 'My week', exact: true }).click();
        const body = await (await response).json() as CoachResponse;
        assertOffline(body);
        expect(body).toMatchObject({ ok: false, error: { code: 'query_failed', retryable: true }, evidence: [] });
        await expect(surface(page).getByRole('alert')).toContainText('Your workout has not changed.');
        expect(await draft()).toEqual(draftBefore);
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      const retry = page.waitForResponse(res => new URL(res.url()).pathname === '/api/coach-assistant');
      await surface(page).getByRole('button', { name: 'Try again' }).click();
      expect((await (await retry).json()).ok).toBe(true);
      await expect(surface(page).getByText('Record summary · No AI model used', { exact: true })).toBeVisible();
    });

    await test.step('Cancel an actual pending HTTP request; no late result changes the draft', async () => {
      const blocker = await pool.connect();
      try {
        await blocker.query('BEGIN');
        await blocker.query('LOCK TABLE workout_sessions IN ACCESS EXCLUSIVE MODE');
        const failed = page.waitForEvent('requestfailed', { predicate: req => new URL(req.url()).pathname === '/api/coach-assistant' });
        await surface(page).getByRole('button', { name: 'My week', exact: true }).click();
        await expect.poll(async () => Number((await pool.query("SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE '%FROM workout_sessions s%' AND pid<>pg_backend_pid()")).rows[0].n), { timeout: 4000 }).toBeGreaterThan(0);
        await surface(page).getByRole('button', { name: 'Cancel', exact: true }).click();
        await failed;
        await expect(surface(page).getByRole('status')).toHaveText('Request cancelled.');
      } finally { await blocker.query('ROLLBACK'); blocker.release(); }
      await surface(page).getByRole('button', { name: 'Close answer' }).click();
      expect(await draft()).toEqual(draftBefore);
      await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue('Auth week durable draft');
      await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
      const body = await week(page);
      expect(fact(body, 'workout.sets')?.value).toBe(3);
      expect((await pool.query('SELECT id, status, name FROM workout_programs WHERE client_id=$1 ORDER BY id', [clientId])).rows).toEqual(planBefore);
    });

    await test.step('Partial records remain explicitly partial in HTTP and visible sources', async () => {
      const sessionId = randomUUID();
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        await db.query("INSERT INTO workout_sessions(id,user_id,name,session_date) VALUES($1,$2,'Auth partial fixture',$3)", [sessionId, clientId, day]);
        await db.query('INSERT INTO workout_sets(id,session_id,set_number,reps,weight_kg) VALUES($1,$2,1,7,NULL)', [randomUUID(), sessionId]);
        await db.query('UPDATE workout_sessions SET duration_minutes=10 WHERE id=$1', [sessionId]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK'); throw error; }
      finally { db.release(); }
      const body = await week(page);
      expect(fact(body, 'workout.sets')?.value).toBe(4);
      expect(fact(body, 'workout.volume')).toMatchObject({ value: 380, completeness: 'partial' });
      await surface(page).getByText('Records used', { exact: true }).click();
      await expect(surface(page).getByText('Partial records', { exact: true })).toBeVisible();
    });

    await test.step('Actual coach cookies cannot cross organization or survive relationship revocation', async () => {
      const context = await browser.newContext({ baseURL: 'http://127.0.0.1:3300' });
      const coachPage = await context.newPage();
      const noPaid = await blockPaidRequests(coachPage);
      try {
        await loginAs(coachPage, 'coach');
        const post = (subject: string) => context.request.post('/api/coach-assistant', { data: { intent: 'week', message: 'Summarize my client week', clientId: subject } });
        const authorized = await post(clientId);
        expect(authorized.status()).toBe(200);
        expect((await authorized.json()).ok).toBe(true);
        const foreign = await post(foreignId);
        expect(foreign.status()).toBe(403);
        expect(await foreign.json()).toMatchObject({ ok: false, evidence: [], error: { code: 'forbidden' } });
        expect((await pool.query('UPDATE client_profiles SET coach_id=NULL WHERE user_id=$1 AND coach_id=$2', [clientId, coachId])).rowCount).toBe(1);
        try {
          const revoked = await post(clientId);
          expect(revoked.status()).toBe(403);
          expect(await revoked.json()).toMatchObject({ ok: false, evidence: [], error: { code: 'forbidden' } });
        } finally {
          expect((await pool.query('UPDATE client_profiles SET coach_id=$2 WHERE user_id=$1 AND coach_id IS NULL', [clientId, coachId])).rowCount).toBe(1);
        }
        noPaid();
      } finally { await context.close(); }
    });

    await test.step('Missing records show no invented totals; account draft stays usable', async () => {
      // Every row belongs to this run's newly created, disposable identity.
      const sessions = await pool.query('SELECT id FROM workout_sessions WHERE user_id=$1', [clientId]);
      for (const row of sessions.rows) await pool.query('DELETE FROM workout_sessions WHERE id=$1 AND user_id=$2', [row.id, clientId]);
      const meals = await pool.query('SELECT id FROM food_log WHERE user_id=$1', [clientId]);
      for (const row of meals.rows) await pool.query('DELETE FROM food_log WHERE id=$1 AND user_id=$2', [row.id, clientId]);
      const programs = await pool.query("SELECT id FROM workout_programs WHERE client_id=$1 AND status='active'", [clientId]);
      for (const row of programs.rows) await pool.query("UPDATE workout_programs SET status='archived' WHERE id=$1 AND client_id=$2", [row.id, clientId]);
      try {
        const body = await week(page);
        expect(body.evidence).toEqual([]);
        expect(body.output?.limitations).toContain('no_workout_records');
        await expect(surface(page).getByText('There are no records to summarize for this period.', { exact: true })).toBeVisible();
      } finally {
        // Restore fixture assignment before testing the saved draft's template
        // access. This is test setup, never a mutation by the assistant.
        for (const row of programs.rows) await pool.query("UPDATE workout_programs SET status='active' WHERE id=$1 AND client_id=$2", [row.id, clientId]);
      }
      expect(await draft()).toEqual(draftBefore);
      await surface(page).getByRole('button', { name: 'Close answer' }).click();
      await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
      await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue('Auth week durable draft');
    });
    await test.step('Workout still logs a set, opens rest and finishes after empty/error/closed coach states', async () => {
      await finishDraft(page, pool, clientId, 'Auth week durable draft');
    });
    assertNoPaidRequests();
  } finally { await pool.end(); }
});


test('flag off: authenticated Workout edits, navigates, logs, rests and finishes without the coach', async ({ page }) => {
  test.skip(!flagOff, 'Only the second sequential server starts with both coach flags disabled');
  const pool = new pg.Pool({ connectionString: databaseUrl(), max: 1 });
  const clientId = fixtureEnv('E2E_CLIENT_ID');
  const attempted: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname === '/api/coach-assistant') attempted.push(request.method());
  });
  const noPaid = await blockPaidRequests(page);
  try {
    await loginAs(page, 'client');
    await page.goto('/dashboard/workout');
    await expect(page.getByRole('button', { name: 'Review plan', exact: true }).first()).toBeVisible();
    await expect(surface(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Review plan', exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByRole('textbox', { name: 'Workout name' }).fill('Auth flag-off workout');
    await page.getByRole('link', { name: 'Workout Home', exact: true }).click();
    await expect(surface(page)).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue editing', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Workout name' })).toHaveValue('Auth flag-off workout');
    await finishDraft(page, pool, clientId, 'Auth flag-off workout');
    expect(attempted).toEqual([]);
    noPaid();
  } finally { await pool.end(); }
});
