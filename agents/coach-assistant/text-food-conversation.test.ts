import { describe, it, expect, vi } from 'vitest';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import { textFoodIntakeIntent } from './text-food-intent';
import type { TextFoodResult } from './text-food-contract';
const request = { version: 'coach-assistant.v2', conversationId: '00000000-0000-4000-8000-000000000001', turnId: '00000000-0000-4000-8000-000000000002', message: 'I just ate 100g rice' };
function fixture() {
  const repository = fixtureRepository();
  const authorize = repository.authorize;
  repository.authorize = async (...args) => ({ ...await authorize(...args), language: 'es' });
  const food = vi.spyOn(repository, 'nutrition');
  const resolve = vi.fn(async (): Promise<TextFoodResult> => ({ ok: false, error: 'not_connected' }));
  return { food, resolve, options: { actorId: 'synthetic-client', repository, now: new Date('2026-09-12T22:00:00Z'), signal: new AbortController().signal, mode: 'offline' as const, resolveTextFoodIntake: resolve } };
}
describe('new meal conversation boundary', () => {
  it('uses latest English instead of Spanish profile and never reads unrelated calorie totals', async () => {
    const f = fixture(), result = await runConversation(request, f.options);
    expect(result.ok).toBe(true); expect(result.output?.answer).toContain('no food was saved'); expect(result.snapshot?.language).toBe('en');
    expect(f.food).not.toHaveBeenCalled(); expect(result.evidence).toEqual([]); expect(result.telemetry.costUsd).toBeNull();
  });
  it('routes negative/planned requests to normal conversation without intake interpretation', async () => {
    const f = fixture(); const parse = vi.fn();
    const resolveTextFoodIntake = async (input: { message: string }) => { if (!textFoodIntakeIntent(input.message)) return null; parse(); return { ok: false as const, error: 'not_connected' as const }; };
    await runConversation({ ...request, message: 'I will eat rice tomorrow' }, { ...f.options, resolveTextFoodIntake }); expect(parse).not.toHaveBeenCalled();
  });
  it('reauthorizes after intake and strips the draft if scope changes', async () => {
    const f = fixture(); let changed = false; const authorize = f.options.repository.authorize;
    f.options.repository.authorize = async (...args) => ({ ...await authorize(...args), organizationId: changed ? 'other-org' : 'synthetic-org' });
    f.resolve.mockImplementationOnce(async () => { changed = true; return { ok: false, error: 'not_connected' }; });
    const result = await runConversation(request, f.options); expect(result.ok).toBe(false); expect(result.textFood).toBeUndefined(); expect(result.output).toBeUndefined();
  });
});
