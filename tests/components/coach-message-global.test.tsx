// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { MessageTransport } from '@/components/assistant/message-state';
import { COACH_MESSAGE_REFRESH } from '@/components/assistant/message-events';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/messages' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });

afterEach(() => {
  cleanup();
  delete process.env.NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED;
});

it('renders the exact server-prepared human message and refreshes chat only after its receipt', async () => {
  process.env.NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED = '1';
  const actorId = '11111111-1111-4111-8111-111111111111';
  const coachId = '22222222-2222-4222-8222-222222222222';
  const proposalId = '33333333-3333-4333-8333-333333333333';
  const proposal = {
    id: proposalId, hash: 'a'.repeat(64), action: 'chat.message.send' as const,
    recipient: { coachId, name: 'Coach Ana', version: 'recipient-v1' },
    after: { message: 'Can we review my plan on Friday?' }, expiresAt: '2099-09-08T12:05:00.000Z', reviewRequired: true as const,
  };
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: {
      id: crypto.randomUUID(), capturedAt: '2026-09-08T12:00:00.000Z', subjectId: actorId, organizationId: crypto.randomUUID(),
      actorRole: 'client', access: 'self', scopeKey: 'b'.repeat(64), surface: 'messages', screenIncluded: true, language: 'en',
      units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' },
      capabilities: [{ key: 'messages', status: 'available', reason: 'review_required' }],
    },
    output: { answer: 'I prepared a message for review.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    capabilityResult: { tool: 'coach.message.propose', status: 'review_required', result: { ok: true, proposal }, applied: false },
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  } as CoachConversationResponse));
  const message = vi.fn<MessageTransport>(async operation => {
    if (operation.operation !== 'message.apply') return { ok: false, error: 'invalid_input' };
    return {
      ok: true,
      receipt: { id: '44444444-4444-4444-8444-444444444444', actionId: operation.actionId, proposalId, messageId: '55555555-5555-4555-8555-555555555555', coachId, status: 'stored', recordedAt: '2026-09-08T12:06:00.000Z' },
      refresh: { coachId, clientId: actorId, strategy: 'refetch' },
    };
  });
  const refresh = vi.fn();
  window.addEventListener(COACH_MESSAGE_REFRESH, refresh);

  render(<I18nProvider defaultLang="en"><GlobalCoach identity={actorId} example={conversation} messageTransport={message} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Write a message to my coach.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(await screen.findAllByText(proposal.after.message)).toHaveLength(2);
  expect(screen.getByText('Coach Ana')).toBeTruthy();
  expect(screen.getByRole('textbox', { name: 'Your question' }).hasAttribute('disabled')).toBe(true);
  expect(message).not.toHaveBeenCalled();
  expect(refresh).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Send to your coach' }));
  expect(await screen.findByText('Saved in your chat')).toBeTruthy();
  expect(message).toHaveBeenCalledTimes(1);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect((refresh.mock.calls[0][0] as CustomEvent).detail).toEqual({ coachId, clientId: actorId, messageId: '55555555-5555-4555-8555-555555555555', strategy: 'refetch' });
  window.removeEventListener(COACH_MESSAGE_REFRESH, refresh);
});

it('keeps an uncertain action isolated across A to B to A remounts and checks the same action without reapplying', async () => {
  process.env.NEXT_PUBLIC_COACH_MESSAGE_ACTIONS_ENABLED = '1';
  const actorA = '71111111-1111-4111-8111-111111111111';
  const actorB = '72222222-2222-4222-8222-222222222222';
  const coachId = '73333333-3333-4333-8333-333333333333';
  const proposalId = '74444444-4444-4444-8444-444444444444';
  const proposal = { id: proposalId, hash: 'd'.repeat(64), action: 'chat.message.send' as const,
    recipient: { coachId, name: 'Coach Recovery', version: 'v1' }, after: { message: 'Please review this.' },
    expiresAt: '2099-09-08T12:05:00.000Z', reviewRequired: true as const };
  const conversation = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => ({
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true,
    mode: 'model', dataSource: 'authorized_records',
    snapshot: { id: crypto.randomUUID(), capturedAt: '2026-09-08T12:00:00.000Z', subjectId: actorA, organizationId: crypto.randomUUID(), actorRole: 'client', access: 'self', scopeKey: 'e'.repeat(64), surface: 'messages', screenIncluded: true, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' }, capabilities: [] },
    output: { answer: 'Prepared.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
    evidence: [], proposals: [], receipts: [], attachments: [],
    capabilityResult: { tool: 'coach.message.propose', status: 'review_required', result: { ok: true, proposal }, applied: false },
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 1, costUsd: 0, pricingVersion: 'test' },
  } as CoachConversationResponse));
  const operations: Array<{ operation: string; actionId?: string }> = [];
  const transport = vi.fn<MessageTransport>(async operation => {
    operations.push(operation);
    if (operation.operation === 'message.apply') throw new Error('response_lost');
    if (operation.operation === 'message.receipt') return { ok: true,
      receipt: { id: crypto.randomUUID(), actionId: operation.actionId, proposalId, messageId: crypto.randomUUID(), coachId, status: 'stored', recordedAt: '2026-09-08T12:06:00.000Z' },
      refresh: { coachId, clientId: actorA, strategy: 'refetch' } };
    return { ok: false, error: 'invalid_input' };
  });
  const mount = (identity: string) => render(<I18nProvider defaultLang="en"><GlobalCoach identity={identity} example={conversation} messageTransport={transport} /></I18nProvider>);

  mount(actorA); fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Write a message to my coach.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Send to your coach' }));
  expect(await screen.findByText(/save result is not confirmed/i)).toBeTruthy();
  const originalAction = operations[0].actionId; expect(originalAction).toMatch(/^[a-f0-9-]{36}$/);

  cleanup(); mount(actorB); fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByRole('button', { name: 'Check send status' })).toBeNull();

  cleanup(); mount(actorA); fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByRole('button', { name: 'Check send status' }));
  expect(await screen.findByText('Saved in your chat')).toBeTruthy();
  expect(operations.map(operation => operation.operation)).toEqual(['message.apply', 'message.receipt']);
  expect(operations[1].actionId).toBe(originalAction);
});
