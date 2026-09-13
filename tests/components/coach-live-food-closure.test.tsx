// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach, { resetGlobalCoachSessionsForActor, type CoachVoiceSlot } from '@/components/assistant/GlobalCoach';
import { LiveVoiceControl } from '@/components/assistant/LiveVoiceControl';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { TextFoodOperation, TextFoodReceipt } from '@/agents/coach-assistant/text-food-contract';
import { textFoodIntakeIntent } from '@/agents/coach-assistant/text-food-intent';
import { COACH_FOOD_REFRESH, COACH_FOOD_REFRESH_DONE, readFoodRefreshRequest } from '@/components/assistant/food-events';

const route = vi.hoisted(() => ({ path: '/dashboard/log' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));
// The canonical reader is injected via `foodRefreshTransport`; stub the browser client module so
// importing the default reader never reaches for auth env in this offline harness.
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) } }));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
/** Stand-in canonical Food readers from prior setup() calls, torn down so a stale one cannot
 * answer a later test's refresh request. */
const refreshListeners: EventListener[] = [];
const item = (grams: number) => ({ raw_text: `${grams}g rice`, food_name: 'Rice', name_localized: 'Rice', quantity: grams, unit: 'g' as const, grams, calories: 130, protein_g: 2.7, carbs_g: 28, fat_g: 0.3, fiber_g: 0.4, sugar_g: 0, confidence: 0.9, source: 'ai_estimate' as const });

// --- WebRTC stub: the real browser session runs; only the transport is faked. -----------------
class Channel extends EventTarget {
  label = 'oai-events'; readyState = 'open'; send = vi.fn();
  emit(data: unknown) { this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(data) })); }
  close() { this.readyState = 'closed'; }
}
class Peer extends EventTarget {
  static latest: Peer;
  channel = new Channel(); connectionState = 'new'; iceGatheringState = 'complete'; localDescription: { sdp: string } | null = null;
  constructor() { super(); Peer.latest = this; }
  createDataChannel() { return this.channel; }
  async createOffer() { return { sdp: 'offer' }; }
  async setLocalDescription(value: { sdp: string }) { this.localDescription = value; }
  async setRemoteDescription() { this.channel.emit({ type: 'session.started', session: { id: 'live_session_1' } }); }
  addTrack() {}
  close() { this.connectionState = 'closed'; }
}

const originalTextFood = process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED;
const originalHistory = process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED;
beforeEach(() => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  HTMLMediaElement.prototype.pause = vi.fn();
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED = '1';
  delete process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED;
  vi.stubGlobal('RTCPeerConnection', Peer);
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ kind: 'audio', enabled: true, stop: vi.fn() }] }) } });
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const target = String(url);
    if (target.includes('outstanding')) return Response.json({ state: 'absent' });
    if (init?.method === 'POST') return Response.json({ sessionId: 'live_session_1', answerSdp: 'answer', deadlineMs: Date.now() + 120_000 });
    return Response.json({ enabled: true });
  }));
});
afterEach(() => {
  cleanup();
  resetGlobalCoachSessionsForActor('A');
  vi.unstubAllGlobals();
  if (originalTextFood === undefined) delete process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED; else process.env.NEXT_PUBLIC_COACH_TEXT_FOOD_ACTIONS_ENABLED = originalTextFood;
  if (originalHistory === undefined) delete process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED; else process.env.NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED = originalHistory;
});

const voiceSlot: CoachVoiceSlot = props => <LiveVoiceControl conversationId={props.conversationId} prepareConversation={props.prepareConversation} onQuery={props.onQuery} onTranscript={props.onTranscript} onLiveCommentary={props.onLiveCommentary} />;

function snapshot(subjectId: string): NonNullable<CoachConversationResponse['snapshot']> {
  return { id: crypto.randomUUID(), capturedAt: new Date().toISOString(), subjectId, organizationId: crypto.randomUUID(), screenIncluded: false, actorRole: 'client', access: 'self', scopeKey: 'a'.repeat(64), surface: 'food', capabilities: [], language: 'en', units: { weight: 'kg', energy: 'kcal', protein: 'g' }, window: { start: '2026-09-12', end: '2026-09-12', days: 1, timezone: 'America/Bogota' } };
}
function conversationResponse(request: CoachConversationRequest, text: string, draftRawText: string | null): CoachConversationResponse {
  return {
    version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: snapshot('A'),
    output: { answer: text, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
    telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
    ...(draftRawText === null ? {} : { textFood: { ok: true as const, draft: { kind: 'parsed' as const, id: crypto.randomUUID(), hash: 'a'.repeat(64), action: 'food.text.create' as const, rawText: draftRawText, items: [item(100)], clarification: null, warnings: [], expiresAt: '2099-09-12T23:00:00Z' } } }),
  };
}

function setup(options?: { writeFails?: boolean; clarification?: boolean; delayedApply?: boolean; refresh?: 'ok' | 'fail' | 'hang'; refreshDelayMs?: number; read?: 'ok' | 'fail' | 'hang'; readDelayMs?: number; readTimeoutMs?: number }) {
  const writes: TextFoodOperation[] = [];
  // The canonical Food-surface reader stands in for the real `app/dashboard/log` refresh listener:
  // it responds to a request id only after its authoritative re-read settles.
  let respondRefresh: ((requestId: string, ok: boolean) => void) | null = null;
  for (const listener of refreshListeners.splice(0)) window.removeEventListener(COACH_FOOD_REFRESH, listener);
  const refreshListener = (event: Event) => {
    const request = readFoodRefreshRequest(event);
    if (request) respondRefresh?.(request.requestId, options?.refresh !== 'fail');
  };
  refreshListeners.push(refreshListener);
  window.addEventListener(COACH_FOOD_REFRESH, refreshListener);
  // Mirrors the backend: only a bounded new-meal utterance produces a draft; planning, negation
  // and bare references fall through to normal conversation.
  const conversation = vi.fn(async (request: CoachConversationRequest) => conversationResponse(request, 'Review the meal before saving.', textFoodIntakeIntent(request.message) ? request.message : null));
  if (options?.clarification) {
    conversation.mockImplementation(async (request: CoachConversationRequest) => {
      const base = conversationResponse(request, 'I need one more detail.', request.message);
      return { ...base, textFood: { ok: true, draft: { ...(base.textFood as { ok: true; draft: import('@/agents/coach-assistant/text-food-contract').TextFoodDraft }).draft, items: [], clarification: 'How many grams?' } } };
    });
  }
  const receiptFor = (operation: Extract<TextFoodOperation, { operation: 'text.food.apply' }>): { ok: true; receipt: TextFoodReceipt; refresh: 'refetch' } => ({ ok: true, receipt: { actionId: operation.actionId, proposalId: operation.proposalId, hash: operation.hash, entryIds: [id(3)], loggedDate: '2026-09-12', recordedAt: '2026-09-12T23:00:00Z', status: 'applied' }, refresh: 'refetch' });
  let latestApply: Extract<TextFoodOperation, { operation: 'text.food.apply' }> | null = null;
  let resolveApply: ((result: import('@/agents/coach-assistant/text-food-contract').TextFoodResult) => void) | null = null;
  const textFoodTransport = vi.fn((operation: TextFoodOperation): Promise<import('@/agents/coach-assistant/text-food-contract').TextFoodResult> => {
    writes.push(operation);
    if (operation.operation === 'text.food.propose') {
      return Promise.resolve({ ok: true, proposal: { kind: 'review', id: id(2), hash: 'b'.repeat(64), action: 'food.text.create', draftId: operation.draftId, draftHash: operation.hash, after: operation.after, items: [item(operation.after.items[0].grams)], entryIds: [id(3)], expiresAt: '2099-09-12T23:00:00Z', reviewRequired: true } });
    }
    if (operation.operation === 'text.food.apply') {
      latestApply = operation;
      if (options?.writeFails) return Promise.resolve({ ok: false, error: 'uncertain' as const });
      if (options?.delayedApply) return new Promise(resolve => { resolveApply = resolve; });
      return Promise.resolve(receiptFor(operation));
    }
    if (operation.operation === 'text.food.receipt') return Promise.resolve(latestApply ? receiptFor(latestApply) : { ok: false as const, error: 'not_found' as const });
    return Promise.resolve({ ok: false, error: 'not_found' as const });
  });
  // Injected actor-bound canonical Food read (stands in for the shared authenticated reader). It
  // is independent of any mounted Food page: the acknowledgment is gated on THIS read settling.
  const reads = vi.fn((actorId: string, entryId: string) => new Promise<{ ok: boolean; found: boolean }>(resolve => {
    const mode = options?.read ?? 'ok';
    if (mode === 'hang') return;
    window.setTimeout(() => resolve(mode === 'ok' ? { ok: true, found: true } : { ok: false, found: false }), options?.readDelayMs ?? 0);
  }));
  const refreshes = vi.fn();
  window.addEventListener(COACH_FOOD_REFRESH, refreshes);
  const delay = options?.refreshDelayMs ?? 0;
  respondRefresh = (requestId, ok) => {
    if (options?.refresh === 'hang') return;
    window.setTimeout(() => window.dispatchEvent(new CustomEvent(COACH_FOOD_REFRESH_DONE, { detail: { actorId: 'A', entryId: id(3), requestId, ok } })), delay);
  };
  render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" voiceSlot={voiceSlot} example={conversation as unknown as import('@/components/assistant/conversation-state').ConversationTransport} textFoodTransport={textFoodTransport} foodRefreshTransport={reads} foodRefreshTimeoutMs={options?.readTimeoutMs ?? 8_000} /></I18nProvider>);
  const settleApply = (outcome: 'applied' | 'uncertain' = 'applied') => { resolveApply?.(outcome === 'applied' && latestApply ? receiptFor(latestApply) : { ok: false, error: 'uncertain' as const }); };
  return { conversation, textFoodTransport, writes, refreshes, reads, settleApply };
}

async function startLive() {
  fireEvent.click(await screen.findByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Voice conversation' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Start conversation' }));
  await waitFor(() => expect(Peer.latest).toBeTruthy());
  return Peer.latest.channel;
}
const delegate = (channel: Channel, eventId: string, text: string, delegationId: string) => {
  channel.emit({ type: 'session.input_transcript.delta', event_id: eventId, delta: text, start_ms: 0, end_ms: 500 });
  channel.emit({ type: 'session.delegation.created', delegation: { id: delegationId, target: 'client' } });
};
const commentaries = (channel: Channel) => channel.send.mock.calls.map(([raw]) => JSON.parse(String(raw))).filter(message => message.type === 'session.commentary.append');

it('links a validated live save back to the exact session, exactly once, and never writes before confirmation', async () => {
  const { conversation, writes, refreshes } = setup();
  const channel = await startLive();
  delegate(channel, 'fragment-a', 'I ate two hot dogs.', 'delegation-a');
  const review = await screen.findByRole('button', { name: 'Review food entry' });
  // Explicit delegation mapping: the transport turn preserved the session and delegation id.
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(conversation.mock.calls[0][0].message).toBe('I ate two hot dogs.');
  // Nothing persisted before the explicit confirmation.
  expect(writes).toEqual([]);
  fireEvent.click(review);
  const confirm = await screen.findByRole('button', { name: 'Confirm and save food' });
  expect(writes.map(operation => operation.operation)).toEqual(['text.food.propose']);
  fireEvent.click(confirm);
  await waitFor(() => expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  // Exactly one spoken acknowledgment, in the same session and delegation it came from, and only
  // AFTER the canonical Food refresh settled.
  await waitFor(() => expect(commentaries(channel).filter(message => message.content === 'Meal saved. Your food log is up to date.')).toHaveLength(1));
  const ack = commentaries(channel).find(message => message.content === 'Meal saved. Your food log is up to date.')!;
  expect(ack.delegation_id).toBe('delegation-a');
  expect(refreshes).toHaveBeenCalled();
  // A duplicate delegation event cannot replay the parse or re-speak.
  channel.emit({ type: 'session.delegation.created', delegation: { id: 'delegation-a', target: 'client' } });
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(commentaries(channel).filter(message => message.content === 'Meal saved. Your food log is up to date.')).toHaveLength(1);
});

it('never says saved when the confirmation is unknown or the live session already ended', async () => {
  const failed = setup({ writeFails: true });
  let channel = await startLive();
  delegate(channel, 'fragment-a', 'I ate two hot dogs.', 'delegation-a');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(failed.writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(commentaries(channel).some(message => message.content === 'Meal saved. Your food log is up to date.')).toBe(false);

  cleanup();
  resetGlobalCoachSessionsForActor('A');
  const ended = setup();
  channel = await startLive();
  delegate(channel, 'fragment-b', 'I ate two hot dogs.', 'delegation-b');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(screen.getByRole('button', { name: 'End conversation' }));
  await waitFor(() => expect(commentaries(channel).length).toBe(1));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(ended.writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(commentaries(channel).some(message => message.content === 'Meal saved. Your food log is up to date.')).toBe(false);
});

it('builds a live meal from bounded follow-up context while planning, negation and bare references stay unwritten', async () => {
  const { conversation, textFoodTransport, writes } = setup();
  const channel = await startLive();
  delegate(channel, 'fragment-a', 'I ate two hot dogs.', 'delegation-a');
  await screen.findByRole('button', { name: 'Review food entry' });

  // Planning stays planning: the backend path receives the raw utterance, never a combined meal.
  delegate(channel, 'fragment-b', 'quiero comer arroz', 'delegation-b');
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(2));
  expect(conversation.mock.calls[1][0].message).toBe('quiero comer arroz');

  // Negation is never converted into a meal.
  delegate(channel, 'fragment-c', 'no comí arroz', 'delegation-c');
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(3));
  expect(conversation.mock.calls[2][0].message).toBe('no comí arroz');

  // A bounded additive continuation is combined with the reviewed draft text.
  delegate(channel, 'fragment-d', 'And 30 ml of cola.', 'delegation-d');
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(4));
  expect(conversation.mock.calls[3][0].message).toBe('I ate two hot dogs. And 30 ml of cola.');

  // A correction re-prepares a review from bounded context; still no write.
  delegate(channel, 'fragment-e', 'Actually 150g of rice.', 'delegation-e');
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(5));
  expect(conversation.mock.calls[4][0].message).toContain('Actually 150g of rice.');

  // A bare save reference only points at the existing review and NEVER writes.
  delegate(channel, 'fragment-f', 'log it', 'delegation-f');
  await waitFor(() => expect(commentaries(channel).some(message => message.content === 'Estimated nutrition. Check portions and date; nothing is saved until you confirm.')).toBe(true));
  expect(conversation).toHaveBeenCalledTimes(5);
  expect(writes).toEqual([]);
  expect(textFoodTransport).not.toHaveBeenCalled();
});

it('asks for clarification instead of writing when the parsed draft is ambiguous', async () => {
  const { writes } = setup({ clarification: true });
  const channel = await startLive();
  delegate(channel, 'fragment-a', 'I ate some rice', 'delegation-a');
  await screen.findByText('How many grams?');
  expect(screen.queryByRole('button', { name: 'Confirm and save food' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Review food entry' })).toBeNull();
  expect(writes).toEqual([]);
});

// A live revision must never replace, unmount, re-parse or hide the recovery of an apply that is
// still in flight or may already have committed. It is only allowed after the action is known-safe.
it('blocks live revision while an apply is delayed or unknown, then resumes only after receipt recovery', async () => {
  const { conversation, writes, settleApply } = setup({ delayedApply: true });
  const channel = await startLive();
  delegate(channel, 'a1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));

  // Apply still in flight: a correction must not re-parse or replace the unresolved review.
  delegate(channel, 'a2', 'Actually 150g rice.', 'd2');
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Review food entry' })).toBeNull();

  // The apply returns uncertain (may already have committed): still unresolved.
  settleApply('uncertain');
  await screen.findByRole('button', { name: 'Check saved change' });
  delegate(channel, 'a3', 'And 30 ml cola.', 'd3');
  await new Promise(resolve => setTimeout(resolve, 40));
  expect(conversation).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('button', { name: 'Review food entry' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Check saved change' })).toBeTruthy();

  // Explicit receipt recovery resolves the original envelope to a known-safe state and speaks once.
  fireEvent.click(screen.getByRole('button', { name: 'Check saved change' }));
  await waitFor(() => expect(commentaries(channel).filter(message => message.content === 'Meal saved. Your food log is up to date.')).toHaveLength(1));

  // Only now may an intentional revision prepare a new review from the bounded context.
  delegate(channel, 'a4', 'And 30 ml cola.', 'd4');
  await waitFor(() => expect(conversation).toHaveBeenCalledTimes(2));
  expect(conversation.mock.calls[1][0].message).not.toContain('I ate 100g rice.');
  expect(conversation.mock.calls[1][0].message).toContain('30 ml cola');
});

// The acknowledgment waits for the authoritative canonical refresh to complete, not for the mere
// refresh request. A delayed read must not be announced early.
it('speaks the saved acknowledgment only after the canonical refresh completes', async () => {
  const { writes } = setup({ readDelayMs: 60 });
  const channel = await startLive();
  delegate(channel, 'b1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(commentaries(channel).some(message => message.content === 'Meal saved. Your food log is up to date.')).toBe(false);
  await waitFor(() => expect(commentaries(channel).filter(message => message.content === 'Meal saved. Your food log is up to date.')).toHaveLength(1));
});

// A failed canonical refresh keeps the truthful visible receipt, offers an explicit reload, and
// never announces an updated log or re-applies the write.
it('keeps the visible receipt and offers a reload when the canonical read fails', async () => {
  const { writes, reads } = setup({ read: 'fail' });
  const channel = await startLive();
  delegate(channel, 'c1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  await waitFor(() => expect(reads).toHaveBeenCalled());
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(commentaries(channel).some(message => message.content === 'Meal saved. Your food log is up to date.')).toBe(false);
  expect(screen.getByText('Meal saved. Your food log is refreshing.')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Reload food log' })).toBeTruthy();
  expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1);
});

// A live session that ends while the canonical refresh is still settling must not be spoken into.
it('does not speak when the live session ends during the canonical refresh', async () => {
  const { writes } = setup({ readDelayMs: 60 });
  const channel = await startLive();
  delegate(channel, 'e1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(operation => operation.operation === 'text.food.apply')).toHaveLength(1));
  fireEvent.click(screen.getByRole('button', { name: 'End conversation' }));
  await new Promise(resolve => setTimeout(resolve, 120));
  expect(commentaries(channel).some(message => message.content === 'Meal saved. Your food log is up to date.')).toBe(false);
});

// P2 — the acknowledgment is bound to a REAL actor-bound canonical read, not the mounted Food
// reader. A hung read never claims an updated log; the reload RE-ISSUES the same read and re-arms.
it('completes the canonical read with no Food reader mounted and reload re-arms it', async () => {
  const { writes, reads } = setup({ read: 'hang', readTimeoutMs: 250 });
  for (const listener of refreshListeners.splice(0)) window.removeEventListener(COACH_FOOD_REFRESH, listener);
  const channel = await startLive();
  delegate(channel, 'h1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(o => o.operation === 'text.food.apply')).toHaveLength(1));
  const reload = await screen.findByRole('button', { name: 'Reload food log' });
  expect(commentaries(channel).some(m => m.content === 'Meal saved. Your food log is up to date.')).toBe(false);
  const before = reads.mock.calls.length;
  reads.mockImplementation(() => Promise.resolve({ ok: true, found: true }));
  fireEvent.click(reload);
  await waitFor(() => expect(reads.mock.calls.length).toBeGreaterThan(before));
  await waitFor(() => expect(commentaries(channel).filter(m => m.content === 'Meal saved. Your food log is up to date.')).toHaveLength(1));
  expect(writes.filter(o => o.operation === 'text.food.apply')).toHaveLength(1);
});

it('never claims an updated log for a wrong-actor/not-found read and does not re-apply', async () => {
  const { writes, reads } = setup();
  for (const listener of refreshListeners.splice(0)) window.removeEventListener(COACH_FOOD_REFRESH, listener);
  reads.mockImplementation(() => Promise.resolve({ ok: true, found: false }));
  const channel = await startLive();
  delegate(channel, 'w1', 'I ate 100g rice.', 'd1');
  fireEvent.click(await screen.findByRole('button', { name: 'Review food entry' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm and save food' }));
  await waitFor(() => expect(writes.filter(o => o.operation === 'text.food.apply')).toHaveLength(1));
  await waitFor(() => expect(reads).toHaveBeenCalled());
  await screen.findByRole('button', { name: 'Reload food log' });
  expect(commentaries(channel).some(m => m.content === 'Meal saved. Your food log is up to date.')).toBe(false);
  expect(writes.filter(o => o.operation === 'text.food.apply')).toHaveLength(1);
});
