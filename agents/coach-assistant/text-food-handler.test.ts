import { describe, it, expect, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import type { TextFoodService } from './text-food-actions';
import { fixtureRepository } from './fixtures';
const actor = '00000000-0000-4000-8000-000000000001';
const operation = { version: 'coach-assistant.v2', operation: 'text.food.parse', conversationId: actor, turnId: actor, requestId: actor, text: 'I ate 100g rice', language: 'en' };
const request = () => new Request('https://private.invalid/api/coach-assistant', { method: 'POST', body: JSON.stringify(operation) });
function fixture() {
  const repository = fixtureRepository(); repository.dataSource = 'authorized_records';
  repository.authorize = vi.fn(async () => ({ actorId: actor, subjectId: actor, organizationId: actor, timezone: 'UTC', language: 'en' }));
  const execute = vi.fn<TextFoodService['execute']>(async () => ({ ok: false as const, error: 'not_connected' as const }));
  const deps = { env: { COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: actor, COACH_ASSISTANT_TEXT_FOOD_ACTIONS_ENABLED: '1', VERCEL_ENV: 'preview' }, guard: vi.fn(async () => ({ userId: actor })), createRepository: vi.fn(() => repository), createTextFoodService: vi.fn(() => ({ execute })) };
  return { deps, execute, repository };
}
describe('gated text Food handler', () => {
  it('stays dark and does not construct the service with flag off', async () => { const f = fixture(); f.deps.env.COACH_ASSISTANT_TEXT_FOOD_ACTIONS_ENABLED = '0'; expect((await handleCoachRequest(request(), f.deps)).status).toBe(404); expect(f.deps.createTextFoodService).not.toHaveBeenCalled(); });
  it('retains actor allowlist before service dispatch', async () => { const f = fixture(); f.deps.env.COACH_ASSISTANT_PREVIEW_USER_IDS = ''; expect((await handleCoachRequest(request(), f.deps)).status).toBe(403); expect(f.execute).not.toHaveBeenCalled(); });
  it('returns SQL-HOLD unavailable from the authorized service', async () => { const f = fixture(); const response = await handleCoachRequest(request(), f.deps); expect(response.status).toBe(503); expect(await response.json()).toEqual({ ok: false, error: 'not_connected' }); expect(f.execute.mock.calls[0]?.[0]).toMatchObject({ actorId: actor, subjectId: actor, organizationId: actor, operation }); });
  it('blocks production before authentication or service construction', async () => { const f = fixture(); f.deps.env.VERCEL_ENV = 'production'; expect((await handleCoachRequest(request(), f.deps)).status).toBe(404); expect(f.deps.guard).not.toHaveBeenCalled(); });
});
