import { expect, it } from 'vitest';
import { readConversationResponse } from '@/components/assistant/client';

function response() {
  return {
    version: 'coach-assistant.v2', conversationId: crypto.randomUUID(), turnId: crypto.randomUUID(), ok: true,
    mode: 'offline', dataSource: 'authorized_records',
    snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: crypto.randomUUID(), organizationId: crypto.randomUUID(), actorRole: 'coach', access: 'assigned_professional', scopeKey: 'a'.repeat(64), surface: 'messages', screenIncluded: true, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' }, capabilities: [{ key: 'messages', status: 'not_connected', reason: 'messages_service_not_connected' }] },
    output: { answer: 'Authorized summary', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
  };
}

it('accepts a complete server-derived professional scope and rejects an incomplete one', () => {
  expect(readConversationResponse(response()).snapshot).toMatchObject({ actorRole: 'coach', access: 'assigned_professional', scopeKey: 'a'.repeat(64) });
  const incomplete = response();
  delete (incomplete.snapshot as Partial<typeof incomplete.snapshot>).scopeKey;
  expect(() => readConversationResponse(incomplete)).toThrow('invalid_output');
});

it('accepts the bounded plan draft intent shape and rejects unrelated surfaces', () => {
  const value = response();
  value.snapshot.actorRole = 'client';
  value.snapshot.access = 'self';
  value.snapshot.surface = 'plan';
  const actionIntent = {
    id: 'b'.repeat(64), action: 'draft.update', source: 'provider_tool', subjectId: value.snapshot.subjectId,
    scopeKey: value.snapshot.scopeKey, surface: 'plan', resource: { kind: 'draft', id: value.snapshot.subjectId, version: 'c'.repeat(64) },
    target: { durationMinutes: 35, equipment: ['dumbbells'] }, reviewRequired: true,
  };
  expect(readConversationResponse({ ...value, actionIntents: [actionIntent] }).actionIntents).toHaveLength(1);
  expect(() => readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, surface: 'food' }] })).toThrow('invalid_output');
});

it('accepts only the bounded latest-set correction intent shape', () => {
  const value = response();
  value.snapshot.actorRole = 'client';
  value.snapshot.access = 'self';
  value.snapshot.surface = 'live';
  const actionIntent = {
    id: 'd'.repeat(64), action: 'workout.set.reps.update', source: 'provider_tool', subjectId: value.snapshot.subjectId,
    scopeKey: value.snapshot.scopeKey, surface: 'live', target: { selection: 'latest_open_session_set', reps: 10 }, reviewRequired: true,
  };
  expect(readConversationResponse({ ...value, actionIntents: [actionIntent] }).actionIntents).toHaveLength(1);
  expect(readConversationResponse({ ...value, snapshot: { ...value.snapshot, surface: 'home' }, actionIntents: [{ ...actionIntent, surface: 'home' }] }).actionIntents).toHaveLength(1);
  expect(() => readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, target: { ...actionIntent.target, reps: 10.5 } }] })).toThrow('invalid_output');
  expect(() => readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, resource: { kind: 'workout_set' } }] })).toThrow('invalid_output');
});

it('accepts only a bounded Food quantity correction intent', () => {
  const value = response();
  value.snapshot.actorRole = 'client';
  value.snapshot.access = 'self';
  value.snapshot.surface = 'food';
  const actionIntent = {
    id: 'e'.repeat(64), action: 'food.quantity.update', source: 'provider_tool', subjectId: value.snapshot.subjectId,
    scopeKey: value.snapshot.scopeKey, surface: 'food', target: {
      selection: 'authorized_food_entry', entryHintId: crypto.randomUUID(), previousGrams: 250, grams: 150,
    }, reviewRequired: true,
  };
  expect(readConversationResponse({ ...value, actionIntents: [actionIntent] }).actionIntents).toHaveLength(1);
  expect(readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, target: { ...actionIntent.target, entryHintId: null } }] }).actionIntents).toHaveLength(1);
  expect(() => readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, target: { ...actionIntent.target, previousGrams: 150 } }] })).toThrow('invalid_output');
  expect(() => readConversationResponse({ ...value, actionIntents: [{ ...actionIntent, target: { ...actionIntent.target, entryHintId: 'latest' } }] })).toThrow('invalid_output');
});

it('accepts only a strict review-only human-message capability result', () => {
  const value = response();
  value.snapshot.actorRole = 'client'; value.snapshot.access = 'self';
  const proposal = {
    id: crypto.randomUUID(), hash: 'f'.repeat(64), action: 'chat.message.send',
    recipient: { coachId: crypto.randomUUID(), name: 'Coach Ana', version: 'v1' },
    after: { message: 'Please review my plan.' }, expiresAt: '2099-09-08T12:05:00.000Z', reviewRequired: true,
  };
  const capabilityResult = { tool: 'coach.message.propose', status: 'review_required', result: { ok: true, proposal }, applied: false };
  expect(readConversationResponse({ ...value, capabilityResult }).capabilityResult).toEqual(capabilityResult);
  expect(() => readConversationResponse({ ...value, capabilityResult: { ...capabilityResult, applied: true } })).toThrow('invalid_output');
  expect(() => readConversationResponse({ ...value, capabilityResult: { ...capabilityResult, result: { ok: true, proposal, html: '<b>send</b>' } } })).toThrow('invalid_output');
  expect(() => readConversationResponse({ ...value, capabilityResult: { ...capabilityResult, status: 'read' } })).toThrow('invalid_output');
});
