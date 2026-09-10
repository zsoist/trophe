// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach, { resetGlobalCoachSessionsForActor } from '@/components/assistant/GlobalCoach';
import { ConversationController, coachSurface, type ConversationTransport } from '@/components/assistant/conversation-state';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { publishScreenDate } from '@/components/assistant/screen-date';
const route = vi.hoisted(() => ({ path: '/dashboard/workout' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
const response = (request: CoachConversationRequest, text = 'Recorded summary'): CoachConversationResponse => ({
  version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
  output: { answer: text, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});
afterEach(() => { cleanup(); resetGlobalCoachSessionsForActor('A'); resetGlobalCoachSessionsForActor('route-mount-actor'); publishScreenDate(null)(); vi.useRealTimers(); route.path = '/dashboard/workout'; });
function mounted(transport: (request: CoachConversationRequest, signal: AbortSignal) => Promise<CoachConversationResponse>, identity = 'A', subjectId?: string) {
  return <I18nProvider defaultLang="en"><GlobalCoach identity={identity} subjectId={subjectId} example={transport} /></I18nProvider>;
}
it('keeps the same conversation and editable draft across real Food and Workout routes without automatic inference', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  const view = render(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(transport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'My training today' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Recorded summary');
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'What about lunch?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Close Ask Trophē' }));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Ask Trophē' }));
  route.path = '/dashboard/log'; view.rerender(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('What about lunch?');
  expect(transport).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await act(async () => {});
  expect(transport.mock.calls[1][0].conversationId).toBe(transport.mock.calls[0][0].conversationId);
  expect(transport.mock.calls[0][0].context?.surface).toBe('workout');
  expect(transport.mock.calls[1][0].context?.surface).toBe('food');
  expect(transport.mock.calls[1][0].history).toHaveLength(2);
});
it('keeps one conversation while rebinding each Food, Workout and Progress turn to its active surface', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  route.path = '/dashboard/log';
  const view = render(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  for (const [path, message] of [
    ['/dashboard/log', 'What is recorded for lunch?'],
    ['/dashboard/workout', 'What workout is planned?'],
    ['/dashboard/progress', 'What progress is recorded?'],
  ] as const) {
    route.path = path;
    view.rerender(mounted(transport));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: message } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await act(async () => {});
  }
  expect(transport.mock.calls.map(([request]) => request.context?.surface)).toEqual(['food', 'workout', 'progress']);
  expect(new Set(transport.mock.calls.map(([request]) => request.conversationId))).toHaveProperty('size', 1);
  expect(transport.mock.calls[2][0].history).toHaveLength(4);
});
it('captures the selected Food calendar day only for the matching included screen', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  route.path='/dashboard/log';
  publishScreenDate({path:route.path,date:'2026-09-10'});
  const transport=vi.fn(async(request:CoachConversationRequest)=>response(request));
  const view=render(mounted(transport));
  fireEvent.click(screen.getByRole('button',{name:'Ask Trophē'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Your question'}),{target:{value:'What food is recorded?'}});
  fireEvent.click(screen.getByRole('button',{name:'Send question'}));
  await act(async()=>{});
  expect(transport.mock.calls[0][0].context).toMatchObject({surface:'food',includeScreen:true,screenDate:'2026-09-10'});
  route.path='/dashboard/workout';view.rerender(mounted(transport));
  fireEvent.change(screen.getByRole('textbox',{name:'Your question'}),{target:{value:'What training is recorded?'}});
  fireEvent.click(screen.getByRole('button',{name:'Send question'}));
  await act(async()=>{});
  expect(transport.mock.calls[1][0].context).not.toHaveProperty('screenDate');
});
it('keeps the open conversation when dashboard navigation swaps the route-owned coach mount', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const identity = 'route-mount-actor';
  const transport = vi.fn<ConversationTransport>(async request => response(request, `Answer for ${request.context?.surface}`));
  route.path = '/dashboard/log';
  publishScreenDate({ path: route.path, date: '2026-09-10' });
  const food = render(mounted(transport, identity));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What food is recorded?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Answer for food');
  food.unmount();

  route.path = '/dashboard/workout';
  const workout = render(mounted(transport, identity));
  expect(screen.getByRole('button', { name: 'Ask Trophē' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Answer for food')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What workout is recorded?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Answer for workout');
  expect(transport.mock.calls[1][0].conversationId).toBe(transport.mock.calls[0][0].conversationId);
  expect(transport.mock.calls[1][0].history).toHaveLength(2);
  expect(transport.mock.calls[1][0].context).toMatchObject({ surface: 'workout', includeScreen: true });
  expect(transport.mock.calls[1][0].context).not.toHaveProperty('screenDate');
  workout.unmount();

  route.path = '/dashboard/progress';
  const progress = render(mounted(transport, identity));
  expect(screen.getByRole('button', { name: 'Ask Trophē' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Answer for workout')).toBeTruthy();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What progress is recorded?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Answer for progress');
  expect(transport.mock.calls[2][0].conversationId).toBe(transport.mock.calls[0][0].conversationId);
  expect(transport.mock.calls[2][0].history).toHaveLength(4);
  expect(transport.mock.calls[2][0].context).toMatchObject({ surface: 'progress', includeScreen: true });
  expect(transport.mock.calls[2][0].context).not.toHaveProperty('screenDate');
  progress.unmount();
});
it('keeps route state through the lazy Workout mount gap, then releases an abandoned scope', async () => {
  vi.useFakeTimers();
  HTMLElement.prototype.scrollTo = vi.fn();
  const identity = 'route-mount-actor';
  const transport = vi.fn<ConversationTransport>(async request => response(request, 'Durable route answer'));
  route.path = '/dashboard/log';
  const food = render(mounted(transport, identity));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Read current records' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await act(async () => {});
  expect(screen.getByText('Durable route answer')).toBeTruthy();
  food.unmount();

  await act(async () => { vi.advanceTimersByTime(1_000); });
  route.path = '/dashboard/workout';
  const workout = render(mounted(transport, identity));
  expect(screen.getByRole('button', { name: 'Ask Trophē' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Durable route answer')).toBeTruthy();
  workout.unmount();

  await act(async () => { vi.advanceTimersByTime(5_000); });
  const abandoned = render(mounted(transport, identity));
  expect(screen.getByRole('button', { name: 'Ask Trophē' }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByText('Durable route answer')).toBeNull();
  abandoned.unmount();
});
it('renders the server supplied limitation even when the response has no evidence rows', async () => {
  HTMLElement.prototype.scrollTo = vi.fn();
  const limitation = 'No Food records were found for the selected day; this does not prove that nothing was consumed.';
  const transport = vi.fn(async (request: CoachConversationRequest): Promise<CoachConversationResponse> => {
    const base = response(request, 'No records found for this day.');
    return { ...base, output: { ...base.output!, limitations: [limitation] } };
  });
  const view = render(mounted(transport));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What did I eat today?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('No records found for this day.');
  fireEvent.click(screen.getByText('Evidence and limits'));
  expect(screen.getByText(limitation)).toBeTruthy();
  view.unmount();
});
it('detaches screen context and aborts a late response when the subject changes on the same mounted shell', async () => {
  let settle!: (value: CoachConversationResponse) => void;
  const transport = vi.fn<ConversationTransport>((request, signal) => {
    void request;
    void signal;
    return new Promise<CoachConversationResponse>(resolve => { settle = resolve; });
  });
  const view = render(mounted(transport, 'A', 'client-1'));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Private question' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  expect(transport.mock.calls[0][0].context?.includeScreen).toBe(false);
  view.rerender(mounted(transport, 'A', 'client-2'));
  expect(transport.mock.calls[0][1].aborted).toBe(true);
  await act(async () => settle(response(transport.mock.calls[0][0], 'Private answer A')));
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
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
it('preserves a reviewed voice turn id when it enters the ordinary text transport', async () => {
  const controller = new ConversationController(); controller.identify('A'); controller.setDraft('Reviewed voice text');
  const transport = vi.fn(async (request: CoachConversationRequest) => response(request));
  const turnId = crypto.randomUUID();
  await controller.send({ surface: 'workout', includeScreen: true }, transport, [], undefined, turnId);
  expect(transport.mock.calls[0][0]).toMatchObject({ turnId, message: 'Reviewed voice text' });
  expect(controller.snapshot().turns[0].response?.ok).toBe(true);
});
it.each([['/dashboard/log', 'food'], ['/dashboard/workout/build', 'plan'], ['/dashboard/workout/live', 'live'], ['/dashboard/checkin', 'habits'], ['/dashboard/workout/atlas', 'atlas']])('maps %s to its actual surface', (path, expected) => expect(coachSurface(path)).toBe(expected));
