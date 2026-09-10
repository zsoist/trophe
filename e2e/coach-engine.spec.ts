import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { expect, request as apiRequest, test } from '@playwright/test';
import { blockPaidRequests, loginAs } from './helpers/auth';
import { boundedEngineErrorCode } from './helpers/engine-diagnostic';

test.skip(process.env.E2E_COACH_ENGINE !== '1', 'Exclusive disposable engine runner');
test('authenticated HTTP engine uses current authorized profile with explicit fixture provenance', async ({ page }) => {
  test.skip(process.env.E2E_COACH_DRAFT_ONLY === '1', 'The vertical draft gate runs independently');
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322'
    || target.pathname !== '/postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.E2E_CLIENT_ID!;
  const pool = new pg.Pool({ connectionString: target.toString(), max: 1, statement_timeout: 5000 });
  const noPaid = await blockPaidRequests(page);
  const anonymous = await apiRequest.newContext({ baseURL: 'http://127.0.0.1:3300' });
  const body = { version: 'coach-assistant.v2', conversationId: randomUUID(), turnId: randomUUID(), message: 'Help me review my workout records today' };
  try {
    expect((await anonymous.post('/api/coach-assistant', { data: body })).status()).toBe(401);
    await loginAs(page, 'client');
    const before = (await pool.query('SELECT workout_preferences FROM public.client_profiles WHERE user_id=$1', [actor])).rows[0];
    const ledger = async () => {
      const tables = (await pool.query(`SELECT to_regclass('private.coach_action_proposals')::text AS proposals,
        to_regclass('private.coach_action_receipts')::text AS receipts`)).rows[0];
      if (!tables.proposals && !tables.receipts) return { schema: 'absent' };
      expect(Boolean(tables.proposals)).toBe(Boolean(tables.receipts));
      return (await pool.query(`SELECT
        (SELECT count(*) FROM private.coach_action_proposals WHERE actor_id=$1) AS proposals,
        (SELECT count(*) FROM private.coach_action_receipts WHERE actor_id=$1) AS receipts`, [actor])).rows[0];
    };
    const ledgerBefore = await ledger();
    const response = await page.context().request.post('/api/coach-assistant', { data: body });
    const result = await response.json();
    if (response.status() !== 200) {
      const schema = (await pool.query(`SELECT
        to_regclass('private.coach_action_proposals') IS NOT NULL AS proposals,
        to_regclass('private.coach_action_receipts') IS NOT NULL AS receipts,
        to_regclass('private.coach_chat_threads') IS NOT NULL AS chat_threads,
        to_regclass('private.coach_chat_turns') IS NOT NULL AS chat_turns,
        to_regclass('public.memory_chunks') IS NOT NULL AS memory_chunks`)).rows[0];
      process.stdout.write(`${JSON.stringify({
        event: 'coach_engine_http_diagnostic',
        status: response.status(),
        errorCode: boundedEngineErrorCode(result?.error?.code),
        runtime: {
          isolatedEngine: process.env.COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED === '1',
          authorizedRecords: process.env.COACH_ASSISTANT_DATA_SOURCE === 'authorized_records',
          paidAiAllowed: process.env.TROPHE_ALLOW_PAID_AI === '1',
          previewActorBound: process.env.COACH_ASSISTANT_PREVIEW_USER_IDS === actor,
          rateBypassBound: process.env.AI_RATE_LIMIT_BYPASS_USER_IDS === actor,
        },
        schema: {
          proposals: Boolean(schema.proposals),
          receipts: Boolean(schema.receipts),
          chatThreads: Boolean(schema.chat_threads),
          chatTurns: Boolean(schema.chat_turns),
          memoryChunks: Boolean(schema.memory_chunks),
        },
      })}\n`);
    }
    expect(response.status(), boundedEngineErrorCode(result?.error?.code)).toBe(200);
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

test('actual Workout composer reviews then applies the isolated draft intent', async ({ page }) => {
  test.skip(process.env.E2E_COACH_DRAFT_ONLY !== '1', 'Only the vertical draft gate supplies this mode');
  const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322'
    || target.pathname !== '/postgres' || target.search || target.hash) throw new Error('disposable_target_required');
  const actor = process.env.E2E_CLIENT_ID!;
  const noPaid = await blockPaidRequests(page);
  const readDraft = () => page.evaluate(id => {
    const value = localStorage.getItem(`trophe:workout-workspace:${id}`);
    return value ? JSON.parse(value).draft : null;
  }, actor);
  try {
    await loginAs(page, 'client');
    await page.goto('/dashboard/workout');
    await page.getByRole('button', { name: 'Review plan', exact: true }).first().click();
    await page.getByRole('button', { name: 'Edit workout', exact: true }).click();
    await page.getByRole('textbox', { name: 'Workout name', exact: true }).fill('Isolated draft before review');
    await expect.poll(async () => (await readDraft())?.name).toBe('Isolated draft before review');
    const before = await readDraft();
    await page.getByRole('button', { name: 'Ask Trophē', exact: true }).click();
    const coach = page.locator('#global-coach');
    await coach.getByRole('textbox', { name: 'Your question', exact: true }).fill('I only have 35 minutes and dumbbells.');
    const sent = page.waitForResponse(item => new URL(item.url()).pathname === '/api/coach-assistant' && item.request().method() === 'POST');
    await coach.getByRole('button', { name: 'Send question', exact: true }).click();
    const http = await sent;
    const result = await http.json();
    expect(http.status(), result?.error?.code).toBe(200);
    expect(http.request().postDataJSON()).toMatchObject({ message: 'I only have 35 minutes and dumbbells.', context: { surface: 'plan', includeScreen: true, workspace: { kind: 'draft' } } });
    expect(http.request().postDataJSON().context.workspace.version).toMatch(/^[a-f0-9]{64}$/);
    expect(result).toMatchObject({ evaluation: { transport: 'injected_fixture' }, telemetry: { costUsd: 0 }, actionIntents: [{ action: 'draft.update', source: 'provider_tool', target: { durationMinutes: 35, equipment: ['dumbbells'] }, reviewRequired: true }], proposals: [], receipts: [] });
    await coach.getByText('Your profile & memory', { exact: true }).click();
    await expect(coach.getByRole('button', { name: 'Confirm change', exact: true })).toBeVisible();
    await expect(coach.getByRole('region', { name: 'After', exact: true })).toContainText('35 min · Dumbbells');
    expect(await readDraft()).toEqual(before);
    await coach.getByRole('button', { name: 'Confirm change', exact: true }).click();
    await expect(coach.getByText('Updated in your private Workout draft.', { exact: true })).toBeVisible();
    await expect.poll(async () => (await readDraft())?.name).toContain('35 min · Dumbbells');
  } finally { noPaid(); }
});
