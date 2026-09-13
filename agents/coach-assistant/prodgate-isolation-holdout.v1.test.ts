import { describe, expect, it, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import type { PilotBudgetStore } from './pilot-budget';
import {
  ASK_TROPHE_SHARED_PILOT_ID,
  createSharedPilotBudgetRuntime,
  previewCohortAdmitted,
  productionCohortAdmitted,
  productionCohortConfigured,
  sharedPilotRuntimeGate,
} from '@/lib/workout/shared-pilot-budget';

const actor = 'synthetic-client';
const otherActor = '00000000-0000-4000-8000-000000000202';
const request = () => new Request('https://app.invalid/api/coach-assistant', { method: 'POST', body: JSON.stringify({ message: 'Today?', intent: 'today' }) });

const productionEnv = (overrides: Record<string, string | undefined> = {}) => ({
  VERCEL_ENV: 'production',
  COACH_ASSISTANT_ENABLED: '1',
  COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED: '1',
  COACH_ASSISTANT_PRODUCTION_USER_IDS: actor,
  COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
  ...overrides,
});
const previewEnv = (overrides: Record<string, string | undefined> = {}) => ({
  VERCEL_ENV: 'preview',
  COACH_ASSISTANT_ENABLED: '1',
  COACH_ASSISTANT_PREVIEW_USER_IDS: actor,
  ...overrides,
});
const deps = (env: Record<string, string | undefined>, overrides: Record<string, unknown> = {}) => {
  const repository = fixtureRepository(); repository.dataSource = 'authorized_records';
  repository.authorize = async () => ({ actorId: actor, subjectId: actor, organizationId: 'org', timezone: 'America/Bogota', language: 'en' });
  return { env, guard: vi.fn(async () => ({ userId: actor })), createRepository: vi.fn(() => repository), now: () => new Date('2026-09-07T03:30:00Z'), ...overrides };
};

describe('production cohort admission helper', () => {
  it('requires the exact server flag, authoritative data and a nonempty allowlist', () => {
    expect(productionCohortConfigured(productionEnv())).toBe(true);
    expect(productionCohortConfigured(productionEnv({ COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED: '0' }))).toBe(false);
    expect(productionCohortConfigured(productionEnv({ COACH_ASSISTANT_DATA_SOURCE: 'synthetic' }))).toBe(false);
    expect(productionCohortConfigured(productionEnv({ COACH_ASSISTANT_PRODUCTION_USER_IDS: '' }))).toBe(false);
    expect(productionCohortConfigured(productionEnv({ CI: 'true' }))).toBe(false);
    expect(productionCohortConfigured(productionEnv({ GITHUB_ACTIONS: 'true' }))).toBe(false);
  });

  it('admits only a listed authenticated production actor and never preview ids', () => {
    expect(productionCohortAdmitted(productionEnv(), actor)).toBe(true);
    expect(productionCohortAdmitted(productionEnv(), otherActor)).toBe(false);
    expect(productionCohortAdmitted(productionEnv({ COACH_ASSISTANT_PREVIEW_USER_IDS: otherActor }), otherActor)).toBe(false);
    expect(productionCohortAdmitted(productionEnv({ VERCEL_ENV: 'preview' }), actor)).toBe(false);
  });

  it('keeps preview admission non-production and allowlist bound', () => {
    expect(previewCohortAdmitted(previewEnv(), actor)).toBe(true);
    expect(previewCohortAdmitted(previewEnv(), otherActor)).toBe(false);
    expect(previewCohortAdmitted(previewEnv({ VERCEL_ENV: 'production' }), actor)).toBe(false);
  });
});

describe('shared pilot runtime gate with the production cohort', () => {
  const paidEnv = (overrides: Record<string, string | undefined> = {}) => productionEnv({
    COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1', TROPHE_ALLOW_PAID_AI: '1', OPENAI_API_KEY: 'injected-only', ...overrides,
  });

  it('defaults production off without the exact flag', () => {
    expect(sharedPilotRuntimeGate(productionEnv({ COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED: '0' }), actor)).toEqual({ ok: false, error: 'disabled' });
  });

  it('admits the authorized production cohort only with paid AI and a provider key', () => {
    expect(sharedPilotRuntimeGate(paidEnv(), actor)).toEqual({ ok: true });
    expect(sharedPilotRuntimeGate(paidEnv({ TROPHE_ALLOW_PAID_AI: '0' }), actor)).toEqual({ ok: false, error: 'disabled' });
    expect(sharedPilotRuntimeGate(paidEnv({ COACH_ASSISTANT_LIVE_PILOT_ENABLED: '0' }), actor)).toEqual({ ok: false, error: 'disabled' });
    expect(sharedPilotRuntimeGate(paidEnv({ OPENAI_API_KEY: '' }), actor)).toEqual({ ok: false, error: 'provider_unavailable' });
    expect(sharedPilotRuntimeGate(paidEnv(), otherActor)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('keeps the preview cohort regressions intact', () => {
    const preview = previewEnv({ COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1', TROPHE_ALLOW_PAID_AI: '1', OPENAI_API_KEY: 'injected-only' });
    expect(sharedPilotRuntimeGate(preview, actor)).toEqual({ ok: true });
    expect(sharedPilotRuntimeGate({ ...preview, COACH_ASSISTANT_PREVIEW_USER_IDS: '' }, actor)).toEqual({ ok: false, error: 'forbidden' });
  });

  it('binds production to the same code-owned pilot id and authority', async () => {
    const execute = vi.fn(async () => ({ storage: 'database', ok: false, error: 'not_found' }));
    const runtime = createSharedPilotBudgetRuntime(paidEnv(), actor, { execute } as PilotBudgetStore);
    expect(runtime).toMatchObject({ ok: true, pilotId: ASK_TROPHE_SHARED_PILOT_ID, actorId: actor });
    expect(createSharedPilotBudgetRuntime(productionEnv({ COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED: '0' }), actor, { execute } as PilotBudgetStore).ok).toBe(false);
  });
});

describe('coach handler production cohort gate', () => {
  it('keeps production disabled by default without touching auth', async () => {
    const guard = vi.fn(async () => { throw new Error('must not run'); });
    expect((await handleCoachRequest(request(), deps(productionEnv({ COACH_ASSISTANT_PRODUCTION_PILOT_ENABLED: '0' }), { guard }))).status).toBe(404);
    expect((await handleCoachRequest(request(), deps(productionEnv({ COACH_ASSISTANT_PRODUCTION_USER_IDS: '' }), { guard }))).status).toBe(404);
    expect((await handleCoachRequest(request(), deps(productionEnv({ COACH_ASSISTANT_DATA_SOURCE: 'synthetic' }), { guard }))).status).toBe(404);
    expect(guard).not.toHaveBeenCalled();
  });

  it('serves an explicitly authorized production actor', async () => {
    const config = deps(productionEnv());
    const response = await handleCoachRequest(request(), config);
    expect(response.status).toBe(200);
    expect((await response.json()).ok).toBe(true);
    expect(config.guard).toHaveBeenCalledTimes(1);
  });

  it('denies a wrong actor or a preview-id-only actor before service dispatch', async () => {
    const wrong = deps(productionEnv(), { guard: vi.fn(async () => ({ userId: otherActor })) });
    expect((await handleCoachRequest(request(), wrong)).status).toBe(403);
    const previewOnly = deps(productionEnv({ COACH_ASSISTANT_PREVIEW_USER_IDS: otherActor }), { guard: vi.fn(async () => ({ userId: otherActor })) });
    expect((await handleCoachRequest(request(), previewOnly)).status).toBe(403);
  });

  it('never promotes isolated or fixture compositions to production', async () => {
    const guard = vi.fn(async () => { throw new Error('must not run'); });
    expect((await handleCoachRequest(request(), deps(productionEnv({ COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1' }), { guard }))).status).toBe(404);
    expect((await handleCoachRequest(request(), deps(productionEnv({ CI: 'true', GITHUB_ACTIONS: 'true' }), { guard }))).status).toBe(404);
    expect(guard).not.toHaveBeenCalled();
  });

  it('preserves the preview cohort regression on the same endpoint', async () => {
    const response = await handleCoachRequest(request(), deps(previewEnv()));
    expect(response.status).toBe(200);
    const denied = await handleCoachRequest(request(), deps(previewEnv({ COACH_ASSISTANT_PREVIEW_USER_IDS: otherActor })));
    expect(denied.status).toBe(403);
  });
});

// AG4 independent production-isolation holdout; no provider or database calls.
describe('AG4 production excludes legacy isolated branches', () => {
  it('rejects isolated attachment preparation in production', async () => {
    const response = await handleCoachRequest(new Request('https://app.invalid/api/coach-assistant', {method:'POST',body:JSON.stringify({version:'coach-assistant.v2',conversationId:'00000000-0000-4000-8000-000000000901',operation:'attachment.prepare',mime:'image/png',bytes:32})}), deps(productionEnv({COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED:'1'})));
    const body=await response.json();
    console.log('AG4 isolated attachment witness',response.status,body);
    expect(response.status).toBe(404);
  });
  it('rejects isolated action dispatch in production', async () => {
    const response=await handleCoachRequest(new Request('https://app.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify({version:'coach-assistant.v2',conversationId:'00000000-0000-4000-8000-000000000902',turnId:'00000000-0000-4000-8000-000000000903',operation:'receipt',actionId:'00000000-0000-4000-8000-000000000904'})}),deps(productionEnv({COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED:'1'})));
    console.log('AG4 isolated action witness',response.status,await response.json());
    expect(response.status).toBe(404);
  });
});
