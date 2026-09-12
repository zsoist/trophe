// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach, { resetGlobalCoachSessionsForActor } from '@/components/assistant/GlobalCoach';
import { ConversationController, coachSurface, type ConversationTransport } from '@/components/assistant/conversation-state';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { PhotoFoodResult } from '@/agents/coach-assistant/photo-food-contracts';
import { publishScreenDate } from '@/components/assistant/screen-date';
import type { PhotoFoodTransport } from '@/components/assistant/photo-food-client';
import type { HistoryTransport } from '@/components/assistant/history-client';
const route = vi.hoisted(() => ({ path: '/dashboard/workout' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
const originalPhotoFoodFlag = process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED;
const originalHistoryFlag = process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED;
const response = (request: CoachConversationRequest, text = 'Recorded summary'): CoachConversationResponse => ({
  version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
  output: { answer: text, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});
afterEach(() => {
  cleanup();
  resetGlobalCoachSessionsForActor('A');
  resetGlobalCoachSessionsForActor('route-mount-actor');
  publishScreenDate(null)();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  route.path = '/dashboard/workout';
  if (originalPhotoFoodFlag === undefined) delete process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED;
  else process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED = originalPhotoFoodFlag;
  if (originalHistoryFlag === undefined) delete process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED;
  else process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED = originalHistoryFlag;
});
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
it('offers Food review after the deliberate photo-and-question turn without an auxiliary chat turn', async () => {
  const attachmentId = '00000000-0000-4000-8000-000000000002';
  const durableConversationId = '00000000-0000-4000-8000-000000000003';
  const attachment = { id: attachmentId, kind: 'image' as const, status: 'available' as const };
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST' && JSON.parse(String(init.body)).message
    ? { ...response(JSON.parse(String(init.body)), 'Photo response'), dataSource: 'authorized_records', attachments: [attachment], snapshot: { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId: 'A', organizationId: crypto.randomUUID(), screenIncluded: false, actorRole: 'client', access: 'self', scopeKey: 'a'.repeat(64), surface: null, capabilities: [] } }
    : init?.method === 'PUT'
    ? { version: 'coach-assistant.v2', storage: 'private_storage', analysis: 'not_connected', ok: true, state: 'available', attachment }
    : { version: 'coach-assistant.v2', storage: 'private_storage', analysis: 'not_connected', ok: true, state: 'prepared', attachment: { ...attachment, status: 'pending' }, uploadToken: 'a'.repeat(64) }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  const photoFoodTransport = vi.fn<PhotoFoodTransport>(async input => {
    if (input.operation !== 'photo.food.read') throw new Error('unexpected operation');
    return {
      version: 'coach-assistant.v2', storage: 'offline_fixture', ok: true,
    snapshot: {
      observationId: crypto.randomUUID(), attachmentId: input.attachmentId, source: 'offline_fixture', trust: 'untrusted_image_data', reviewRequired: true,
      items: [{ index: 0, version: crypto.randomUUID(), foodName: 'Fixture rice', identityStatus: 'identified', estimatedGrams: 100, estimatedCalories: 130, confidence: 0.7, accuracyNote: 'Estimate' }],
    },
    } satisfies PhotoFoodResult;
  });
  const createThread = vi.fn<NonNullable<HistoryTransport['create']>>(async (_requestId, title) => ({ id: durableConversationId, title, createdAt: '2026-09-11T12:00:00.000Z', revision: '0', state: 'active' }));
  const historyTransport: HistoryTransport = { create: createThread, list: vi.fn(), read: vi.fn() };
  process.env.NEXT_PUBLIC_COACH_PHOTO_FOOD_ACTIONS_ENABLED = '1';
  delete process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED;
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:food-photo');
  URL.revokeObjectURL = vi.fn();
  const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" photoFoodTransport={photoFoodTransport} historyTransport={historyTransport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByText('Photos'));
  const bytes = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7n8AAAAASUVORK5CYII='), character => character.charCodeAt(0));
  fireEvent.change(screen.getByLabelText('Choose photos'), { target: { files: [new File([bytes], 'meal.png', { type: 'image/png' })] } });
  await screen.findByText('meal.png');
  expect(fetchMock).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Review upload' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Review food in photo' })).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'What is in this photo?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await screen.findByText('Photo response');
  expect(screen.getByText('Uploaded')).toBeTruthy();
  expect(screen.queryByText('Uploaded · not analyzed')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Review food in photo' }));
  await screen.findByRole('button', { name: /Fixture rice/ });
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(createThread).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saved conversations' })).toBeTruthy();
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ operation: 'attachment.prepare', conversationId: durableConversationId });
  expect(photoFoodTransport).toHaveBeenCalledTimes(1);
  expect(photoFoodTransport.mock.calls[0][0]).toMatchObject({ operation: 'photo.food.read', attachmentId, conversationId: durableConversationId });
  expect(screen.queryByText('Recorded summary')).toBeNull();
  view.unmount();
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
it('keeps route state through a delayed lazy Workout mount until explicit actor cleanup', async () => {
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

  await act(async () => { vi.advanceTimersByTime(30_000); });
  route.path = '/dashboard/workout';
  const workout = render(mounted(transport, identity));
  expect(screen.getByRole('button', { name: 'Ask Trophē' }).getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText('Durable route answer')).toBeTruthy();
  workout.unmount();

  resetGlobalCoachSessionsForActor(identity);
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
  fireEvent.click(screen.getByRole('button', { name: 'Remove screen selection: Workout' }));
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
