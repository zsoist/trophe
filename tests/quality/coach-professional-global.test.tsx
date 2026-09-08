// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { ConversationTransport } from '@/components/assistant/conversation-state';

let path = '/coach/inbox/11111111-1111-4111-8111-111111111111';
vi.mock('next/navigation', () => ({ usePathname: () => path }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); path = '/coach/inbox/11111111-1111-4111-8111-111111111111'; });

const actor = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const clientA = '11111111-1111-4111-8111-111111111111';
const clientB = '22222222-2222-4222-8222-222222222222';

it('shows the selected professional subject and keeps a draft while that subject stays selected', () => {
 const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientA} example={vi.fn()} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 expect(screen.getByText('Client · 11111111')).toBeTruthy();
 const input = screen.getByLabelText('Your question');
 fireEvent.change(input, { target: { value: 'Draft for A' } });
 view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientA} example={vi.fn()} /></I18nProvider>);
 expect(screen.getByDisplayValue('Draft for A')).toBeTruthy();
});

it('cancels and clears ephemeral state before adopting another professional subject', async () => {
 let signal: AbortSignal | undefined;
 const transport: ConversationTransport = async (_request, nextSignal) => {
   signal = nextSignal;
   return new Promise(() => undefined);
 };
 const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientA} example={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Private A draft' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 expect(signal?.aborted).toBe(false);
 path = `/coach/inbox/${clientB}`;
 view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientB} example={transport} /></I18nProvider>);
 expect(signal?.aborted).toBe(true);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 expect(screen.queryByText('Private A draft')).toBeNull();
 expect(screen.getByText('Client · 22222222')).toBeTruthy();
});

it('rejects a successful response for a different server-authorized subject', async () => {
 const transport: ConversationTransport = async request => ({
   version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId,
   ok: true, mode: 'offline', dataSource: 'authorized_records',
   snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: clientB, organizationId: crypto.randomUUID(), actorRole: 'coach', access: 'assigned_professional', scopeKey: 'wrong-scope', surface: 'messages', screenIncluded: true, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' }, capabilities: [] },
   output: { answer: 'This belongs to B', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
   evidence: [], proposals: [], receipts: [], attachments: [], telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
 } as Awaited<ReturnType<ConversationTransport>>);
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientA} example={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Question for A' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 expect(await screen.findByText('This request could not finish. You can edit your question and send it again.')).toBeTruthy();
 expect(screen.queryByText('This belongs to B')).toBeNull();
});

it('shows the server-reported capability status for the professional surface', async () => {
 const transport: ConversationTransport = async request => ({
   version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId,
   ok: true, mode: 'offline', dataSource: 'authorized_records',
   snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: clientA, organizationId: crypto.randomUUID(), actorRole: 'coach', access: 'assigned_professional', scopeKey: 'scope-a', surface: 'messages', screenIncluded: true, language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-01', end: '2026-09-08', days: 7, timezone: 'UTC' }, capabilities: [{ key: 'messages', status: 'not_connected', reason: 'messages_service_not_connected' }] },
   output: { answer: 'Authorized records only.', evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } },
   evidence: [], proposals: [], receipts: [], attachments: [], telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
 } as Awaited<ReturnType<ConversationTransport>>);
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={actor} subjectId={clientA} example={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Can you explain this?' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 expect(await screen.findByText('Messages · Not connected')).toBeTruthy();
});

it('keeps the professional shell usable but does not send without a selected client', () => {
 path = '/coach/calendar';
 const transport = vi.fn();
 render(<I18nProvider defaultLang="en"><GlobalCoach professional identity={actor} example={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 expect(screen.getByText('Select a client to ask about this screen.')).toBeTruthy();
 expect(screen.getByText('Booking')).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Your question'), { target: { value: 'Who is next?' } });
 expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(true);
 expect(transport).not.toHaveBeenCalled();
});
