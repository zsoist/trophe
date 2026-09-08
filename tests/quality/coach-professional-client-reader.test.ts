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
