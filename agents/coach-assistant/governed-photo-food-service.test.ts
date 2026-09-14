import { describe, expect, it, vi } from 'vitest';
import type { db } from '@/db/client';
import { LUNA_MODEL } from '@/agents/router/policies';
import { PHOTO_PILOT_PRICING_VERSION } from '@/agents/router/pricing';
import { PHOTO_ATTEMPT_RESERVATION_NANO_USD, type PilotAttemptBinding, type PilotBudgetStore } from './pilot-budget';
import type { PhotoFoodResult } from './photo-food-contracts';
import { createGovernedPhotoFoodService } from './governed-photo-food-service';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const operation = { version: 'coach-assistant.v2', operation: 'photo.food.read', conversationId: id(4), turnId: id(5), attachmentId: id(6) } as const;
const scope = { actorId: id(2), subjectId: id(2), organizationId: id(3), operation, signal: new AbortController().signal };
const success = { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { observationId: id(7), attachmentId: id(6), source: 'validated_photo_analysis', trust: 'untrusted_image_data', reviewRequired: true, items: [] } } as PhotoFoodResult;
const binding: PilotAttemptBinding = { pilotId: id(1), actorId: id(2), attemptId: id(8), agentRunId: id(9), turnId: id(5), model: LUNA_MODEL, pricingVersion: PHOTO_PILOT_PRICING_VERSION, reservedNanoUsd: PHOTO_ATTEMPT_RESERVATION_NANO_USD, requestHash: 'a'.repeat(64) };

describe('governed private photo composition', () => {
  it('analyzes one missing observation under the shared governor before publishing the settled read', async () => {
    const events: string[] = [];
    const service = { execute: vi.fn(async () => { events.push('read'); return events.filter(value => value === 'read').length === 1 ? { version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_connected' } as PhotoFoodResult : success; }) };
    const observations = { analyzeAndRecord: vi.fn(async (_scope, input) => { events.push('analyze'); expect(input.pilotBinding).toEqual(binding); return { result: { selectedPolicy: { provider: 'openai', model: LUNA_MODEL, promptVersion: 'photo-analyze-v3' }, isFallback: false, usage: { inputTokens: 1, outputTokens: 1 }, rawStatus: 200, latencyMs: 1, output: {} }, observation: {} }; }) };
    const govern = vi.fn(async input => { events.push('reserve'); const result = await input.run(binding); events.push('settle'); return result; });
    const composed = createGovernedPhotoFoodService({ database: {} as typeof db, actorId: id(2), pilotId: id(1), store: {} as PilotBudgetStore, observations: observations as never, invoke: vi.fn() as never, service, govern: govern as never });
    await expect(composed.execute(scope)).resolves.toEqual(success);
    expect(events).toEqual(['read', 'reserve', 'analyze', 'settle', 'read']);
    expect(govern).toHaveBeenCalledWith(expect.objectContaining({ task: 'photo_analyze', actorId: id(2), turnId: id(5), identityParts: expect.arrayContaining([id(4), id(5), id(6)]) }));
    await expect(composed.execute({...scope,operation:{...operation,turnId:id(10)}})).resolves.toEqual(success);
    expect(govern).toHaveBeenCalledTimes(1);
    expect(events).toEqual(['read', 'reserve', 'analyze', 'settle', 'read', 'read']);
  });

  it('does not dispatch for an existing observation, a missing attachment, or another actor', async () => {
    const govern = vi.fn();
    for (const [result, actorId] of [[success, id(2)], [{ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_found' } as PhotoFoodResult, id(2)], [{ version: 'coach-assistant.v2', storage: 'database', ok: false, error: 'not_connected' } as PhotoFoodResult, id(10)]] as const) {
      const service = { execute: vi.fn(async () => result) };
      const composed = createGovernedPhotoFoodService({ database: {} as typeof db, actorId, store: {} as PilotBudgetStore, observations: {} as never, invoke: vi.fn() as never, service, govern: govern as never });
      await expect(composed.execute(scope)).resolves.toEqual(result);
    }
    expect(govern).not.toHaveBeenCalled();
  });
});
