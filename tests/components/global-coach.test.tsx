// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { ConversationController, coachSurface } from '@/components/assistant/conversation-state';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
const route = vi.hoisted(() => ({ path: '/dashboard/workout' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
const response = (request: CoachConversationRequest, text = 'Recorded summary'): CoachConversationResponse => ({
  version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
  output: { answer: text, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});
afterEach(() => { cleanup(); vi.useRealTimers(); route.path = '/dashboard/workout'; });
function mounted(transport: (request: CoachConversationRequest, signal: AbortSignal) => Promise<CoachConversationResponse>, identity = 'A', subjectId?: string) {
  return <I18nProvider defaultLang="en"><GlobalCoach identity={identity} subjectId={subjectId} example={transport} /></I18nProvider>;
}
it('keeps the same conversation and editable draft across real Food and Workout routes without automatic inference', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  const view = render(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(transport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'My training today' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Recorded summary');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What about lunch?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close coach' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask coach' }));
  route.path = '/dashboard/log'; view.rerender(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('What about lunch?');
  expect(transport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await act(async () => {});
  expect(transport.mock.calls[1][0].conversationId).toBe(transport.mock.calls[0][0].conversationId);
  expect(transport.mock.calls[0][0].context?.surface).toBe('workout');
  expect(transport.mock.calls[1][0].context?.surface).toBe('food');
  expect(transport.mock.calls[1][0].history).toHaveLength(2);
});
it('detaches screen context and aborts a late response when the subject changes on the same mounted shell', async () => {
  let settle!: (value: CoachConversationResponse) => void;
  const transport = vi.fn((_request: CoachConversationRequest, _signal: AbortSignal) => new Promise<CoachConversationResponse>(resolve => { settle = resolve; }));
  const view = render(mounted(transport, 'A', 'client-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(transport.mock.calls[0][0].context?.includeScreen).toBe(false);
  view.rerender(mounted(transport, 'A', 'client-2'));
  expect(transport.mock.calls[0][1].aborted).toBe(true);
  await act(async () => settle(response(transport.mock.calls[0][0], 'Private answer A')));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.queryByText('Private answer A')).toBeNull();
  expect(screen.queryByText('Private question')).toBeNull();
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
});
it('releases a hung transport on deadline and preserves an independently edited next question', async () => {
  vi.useFakeTimers();
  const controller = new ConversationController(); controller.identify('A'); controller.setDraft('First');
  void controller.send({ surface: 'food', includeScreen: true }, () => new Promise(() => {}));
  controller.setDraft('Next draft');
  await vi.advanceTimersByTimeAsync(45000);
  expect(controller.snapshot()).toMatchObject({ pending: false, error: 'failed', draft: 'Next draft' });
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  await controller.send(undefined, transport);
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0][0].history).toEqual([]);
});
it.each([['/dashboard/log', 'food'], ['/dashboard/workout/build', 'plan'], ['/dashboard/workout/live', 'live'], ['/dashboard/checkin', 'habits'], ['/dashboard/workout/atlas', 'atlas']])('maps %s to its actual surface', (path, expected) => expect(coachSurface(path)).toBe(expected));
