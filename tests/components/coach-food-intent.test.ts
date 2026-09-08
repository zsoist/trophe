import { describe, expect, it } from 'vitest';
import type { CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { acceptedFoodQuantityIntent } from '@/components/assistant/food-intent';

const actor = '11111111-1111-4111-8111-111111111111';
const conversationId = '22222222-2222-4222-8222-222222222222';
const turnId = '33333333-3333-4333-8333-333333333333';
const entryHintId = '44444444-4444-4444-8444-444444444444';
const scopeKey = 'a'.repeat(64);

function response(intent: Record<string, unknown>): CoachConversationResponse {
  return {
    version: 'coach-assistant.v2', conversationId, turnId, ok: true, mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: '55555555-5555-4555-8555-555555555555', capturedAt: '2026-09-08T12:00:00Z', subjectId: actor,
      organizationId: '66666666-6666-4666-8666-666666666666', actorRole: 'client', access: 'self', scopeKey,
      surface: 'food', screenIncluded: true, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' },
      window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' }, capabilities: [],
    },
    evidence: [], proposals: [], receipts: [], attachments: [], actionIntents: [intent] as never[],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
  };
}

const intent = {
  id: 'b'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: actor, scopeKey, surface: 'food',
  target: { selection: 'authorized_food_entry', entryHintId, previousGrams: 250, grams: 150 }, reviewRequired: true,
};

describe('acceptedFoodQuantityIntent', () => {
  it('accepts the one exact self-scoped Food intent', () => {
    expect(acceptedFoodQuantityIntent(response(intent), actor, conversationId, turnId, 'food')).toEqual(intent);
  });

  it.each([
    ['cross subject', { ...intent, subjectId: '77777777-7777-4777-8777-777777777777' }],
    ['cross scope', { ...intent, scopeKey: 'c'.repeat(64) }],
    ['invalid hint', { ...intent, target: { ...intent.target, entryHintId: 'latest' } }],
    ['same amount', { ...intent, target: { ...intent.target, grams: 250 } }],
    ['invalid amount', { ...intent, target: { ...intent.target, grams: 10_001 } }],
  ])('rejects %s', (_name, candidate) => {
    expect(acceptedFoodQuantityIntent(response(candidate), actor, conversationId, turnId, 'food')).toBeNull();
  });
});
