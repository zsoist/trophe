import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, request as apiRequest, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';

test.skip(process.env.E2E_COACH_ENGINE !== '1', 'Exclusive disposable engine runner');
test('authenticated HTTP engine uses current authorized profile with explicit fixture provenance', async ({ page }) => {
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322'
    || target.pathname !== '/postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.COACH_SQL_ACTOR!;
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  const anonymous = await apiRequest.newContext({ baseURL: 'http://127.0.0.1:3300' });
  const body = { version: 'coach-assistant.v2', conversationId: randomUUID(), turnId: randomUUID(), message: 'Help me review my workout records today' };
  try {
    expect((await anonymous.post('/api/coach-assistant', { data: body })).status()).toBe(401);
    await loginAs(page, 'client');
    const before = (await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actor])).rows[0];
    const ledger = async () => (await pool.query(`SELECT
      (SELECT count(*) FROM private.coach_action_proposals WHERE actor_id=$1) AS proposals,
      (SELECT count(*) FROM private.coach_action_receipts WHERE actor_id=$1) AS receipts`, [actor])).rows[0];
    const ledgerBefore = await ledger();
    const response = await page.context().request.post('/api/coach-assistant', { data: body });
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ ok: true, version: 'coach-assistant.v2', dataSource: 'authorized_records',
      evaluation: { transport: 'injected_fixture', records: 'authorized_records', semanticQualityVerified: false },
      snapshot: { subjectId: actor }, profile: { source: 'authorized_profile' }, proposals: [], receipts: [] });
    expect(result.output.answer).toContain('Isolated transport fixture');
    expect(result.profile.preferences).toEqual({ durationMinutes: before.workout_preferences.durationMinutes });
    expect((await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actor])).rows[0]).toEqual(before);
    expect((await page.context().request.post('/api/coach-assistant', { data: { ...body, context: { surface: 'workout', includeScreen: true, clientId: randomUUID() } } })).status()).toBe(403);
    expect((await page.context().request.post('/api/coach-assistant', { data: { ...body, isolatedFixtureBoundary: { kind: 'isolated_authorized_fixture' } } })).status()).toBe(400);
    // Reuse a real seeded curated exercise; no fabricated route IDs or client labels as authority.
    const exercise = (await pool.query(`SELECT id,name FROM public.exercises
      WHERE is_template=true AND created_by IS NULL AND instructions IS NOT NULL AND length(instructions)<=2100
      ORDER BY id LIMIT 1`)).rows[0];
    expect(exercise?.id).toBeTruthy();
    await page.goto(`/dashboard/workout/exercises/${exercise.id}`);
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const panel = page.locator('#global-coach');
    await expect(panel.getByRole('button', { name: `Remove screen selection: ${exercise.name}`, exact: true })).toBeVisible();
    await panel.getByRole('textbox', { name: 'Your question', exact: true }).fill('Explain this exercise');
    const sent = page.waitForResponse(response => new URL(response.url()).pathname === '/api/coach-assistant' && response.request().method() === 'POST');
    await panel.getByRole('button', { name: 'Send question', exact: true }).click();
    const exerciseResponse = await sent;
    expect(exerciseResponse.request().postDataJSON().context).toMatchObject({ surface: 'exercise', includeScreen: true, entity: { kind: 'exercise', id: exercise.id } });
    expect(exerciseResponse.status()).toBe(200);
    const exerciseResult = await exerciseResponse.json();
    expect(exerciseResult.snapshot.selection).toMatchObject({ kind: 'exercise', id: exercise.id, label: exercise.name, provenance: 'curated_database_exercise' });
    expect(exerciseResult.proposals).toEqual([]);
    expect(exerciseResult.receipts).toEqual([]);
    await panel.getByRole('button', { name: `Remove screen selection: ${exercise.name}`, exact: true }).click();
    await expect(panel.getByRole('checkbox', { name: /Include this screen/ })).not.toBeChecked();
    const selectedContext = { surface: 'atlas', includeScreen: true, anatomy: { group: 'chest', subgroup: 'serratus-anterior', legRegion: 'all' } };
    const selectedResponse = await page.context().request.post('/api/coach-assistant', { data: { ...body, turnId: randomUUID(), context: selectedContext } });
    expect(selectedResponse.status()).toBe(200);
    const selectedResult = await selectedResponse.json();
    expect(selectedResult.snapshot.selection).toMatchObject({ kind: 'anatomy', id: 'serratus-anterior', provenance: 'curated_catalogue', contextOnly: true });
    expect(selectedResult.snapshot.selection.version).toMatch(/^[a-f0-9]{64}$/);
    expect(selectedResult.snapshot.selection.limitations).toContain('generic_anatomy_not_personal_physiology');
    expect(selectedResult.proposals).toEqual([]);
    expect(selectedResult.receipts).toEqual([]);
    for (const anatomy of [
      { ...selectedContext.anatomy, subgroup: 'not-a-muscle' },
      { ...selectedContext.anatomy, version: '0'.repeat(64) },
      { ...selectedContext.anatomy, legRegion: 'upper' },
    ]) {
      const rejected = await page.context().request.post('/api/coach-assistant', { data: { ...body, turnId: randomUUID(), context: { ...selectedContext, anatomy } } });
      expect(rejected.status()).toBe(400);
    }
    const detachedResponse = await page.context().request.post('/api/coach-assistant', { data: { ...body, turnId: randomUUID(), context: { ...selectedContext, includeScreen: false } } });
    expect(detachedResponse.status()).toBe(200);
    const detachedResult = await detachedResponse.json();
    expect(detachedResult.snapshot.selection).toBeUndefined();
    expect(detachedResult.snapshot.screenIncluded).toBe(false);
    expect((await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actor])).rows[0]).toEqual(before);
    expect(await ledger()).toEqual(ledgerBefore);
    noPaid();
  } finally { await anonymous.dispose(); await pool.end(); }
});
