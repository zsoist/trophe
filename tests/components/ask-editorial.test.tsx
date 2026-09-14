// @vitest-environment jsdom
import React from 'react';
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/lib/i18n';
import GlobalCoach, { resetGlobalCoachSessionsForActor } from '@/components/assistant/GlobalCoach';
import type { ConversationTransport } from '@/components/assistant/conversation-state';
import type { CoachConversationRequest, CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import type { HistoryPage, HistoryTransport } from '@/components/assistant/history-client';

const route = vi.hoisted(() => ({ path: '/dashboard/workout' }));
vi.mock('next/navigation', () => ({ usePathname: () => route.path }));

const UUID = '00000000-0000-4000-8000-000000000001';
const UUID2 = '00000000-0000-4000-8000-000000000002';
const UUID3 = '00000000-0000-4000-8000-000000000003';
const AT = '2026-09-12T12:00:00.000Z';

const completed = (request: CoachConversationRequest, text = 'Recorded summary'): CoachConversationResponse => ({
  version: 'coach-assistant.v2', conversationId: request.conversationId, turnId: request.turnId, ok: true, mode: 'offline', dataSource: 'synthetic', snapshot: null,
  output: { answer: text, evidenceRefs: [], limitations: [], suggestions: [], escalation: { required: false, reason: null, draft: null } }, evidence: [], proposals: [], receipts: [], attachments: [],
  telemetry: { model: null, provider: null, promptVersion: 'test', modelCalls: 0, dataReads: 0, tokensIn: 0, tokensOut: 0, reasoningTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, latencyMs: 0, costUsd: 0, pricingVersion: 'test' },
});

function canonicalHistory(): HistoryTransport {
  const thread = { id: UUID, title: 'Sprint plan', createdAt: AT, revision: UUID2, state: 'active' as const };
  const page: HistoryPage = {
    thread,
    messages: [
      { id: UUID3, turnId: UUID2, role: 'user', text: 'Plan my week. See [example](https://example.com/plan) too.', sequence: 1, revision: UUID2, createdAt: AT },
      { id: UUID, turnId: UUID2, role: 'assistant', text: 'Four sessions this week.', sequence: 2, revision: UUID2, createdAt: AT },
    ],
    nextSequence: null,
  };
  return { list: async () => ({ threads: [thread], nextCursor: null }), read: async () => page };
}

async function openHistoryAndResume() {
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByRole('button', { name: 'Saved conversations' }));
  fireEvent.click(await screen.findByText('Sprint plan'));
  await screen.findByText('Four sessions this week.');
}

beforeEach(() => {
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollTo = vi.fn();
  vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
  // A prior I18nProvider persists its language; clear the exact key so defaultLang is the real default.
  window.localStorage.removeItem('trophe_lang');
});
afterEach(() => {
  cleanup();
  resetGlobalCoachSessionsForActor('A');
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Ask editorial persisted-message receipt', () => {
  it('shows exactly one confirmed receipt for the canonical persisted user row, never for the assistant row, and preserves semantic links', async () => {
    const transport = vi.fn(async (request: CoachConversationRequest) => completed(request));
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} historyTransport={canonicalHistory()} /></I18nProvider>);
    await openHistoryAndResume();

    const checks = screen.getAllByRole('img', { name: 'Saved message' });
    expect(checks).toHaveLength(1);
    // The single receipt belongs to the user question, not to the assistant answer.
    const userRow = screen.getByText('Plan my week. See', { exact: false }).closest('article');
    expect(userRow?.contains(checks[0])).toBe(true);
    const assistantRow = screen.getByText('Four sessions this week.').closest('article');
    expect(assistantRow?.querySelector('[role="img"]')).toBeNull();
    // Semantic markdown links survive the editorial wrapper.
    expect(screen.getByRole('link', { name: 'example' }).getAttribute('href')).toBe('https://example.com/plan');
    expect(transport).not.toHaveBeenCalled();
  });

  it('anchors a recovered user receipt to the USER question, never under the assistant answer', async () => {
    const durableHistory: HistoryTransport = {
      list: async () => ({ threads: [], nextCursor: null }),
      read: async () => { throw new Error('unused'); },
      create: async () => ({ id: UUID, title: 'Recovered', createdAt: AT, revision: UUID2, state: 'active' as const }),
      recover: async (_threadId, turnId) => ({
        thread: { id: UUID }, status: 'settled',
        user: { id: UUID3, turnId, role: 'user', text: 'Recovered question?', sequence: 1, revision: UUID2, createdAt: AT },
        assistant: { id: UUID, turnId, role: 'assistant', text: 'Recovered answer.', sequence: 2, revision: UUID2, createdAt: AT },
      }),
    };
    const lost = vi.fn(async () => { throw new Error('response lost'); });
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={lost} historyTransport={durableHistory} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Recovered question?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Recovered answer.');

    const checks = screen.getAllByRole('img', { name: 'Saved message' });
    expect(checks).toHaveLength(1);
    // The receipt sits in the USER question paragraph, not inside the assistant answer body.
    expect(checks[0].closest('p')?.textContent).toBe('Recovered question?');
    const answerBody = screen.getByText('Recovered answer.').closest('div');
    expect(answerBody?.contains(checks[0])).toBe(false);
  });

  it('localizes the receipt label from the existing saved-message translation', async () => {
    const transport = vi.fn(async (request: CoachConversationRequest) => completed(request));
    render(<I18nProvider defaultLang="es"><GlobalCoach identity="A" example={transport} historyTransport={canonicalHistory()} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conversaciones guardadas' }));
    fireEvent.click(await screen.findByText('Sprint plan'));
    await screen.findByText('Four sessions this week.');
    expect(screen.getAllByRole('img', { name: 'Mensaje guardado' })).toHaveLength(1);
  });

  it('renders no saved receipt for a completed assistant response that has no canonical message proof', async () => {
    const transport = vi.fn(async (request: CoachConversationRequest) => completed(request, 'Nothing is persisted here.'));
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Just a question' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Nothing is persisted here.');
    expect(screen.queryByRole('img', { name: 'Saved message' })).toBeNull();
    expect(screen.queryByText('Saved message')).toBeNull();
  });

  it('renders no saved receipt for a clarification-only response', async () => {
    const transport = vi.fn(async (request: CoachConversationRequest) => completed(request, 'Which meal do you mean?'));
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'I ate something' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Which meal do you mean?');
    expect(screen.queryByRole('img', { name: 'Saved message' })).toBeNull();
  });
});

describe('Ask pixel waiting mark', () => {
  const pendingTransport: ConversationTransport = (_request, signal) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });

  it('shows the pixel wait mark only while pending and unmounts it on completion', async () => {
    let captured: CoachConversationRequest | null = null;
    let release: ((value: CoachConversationResponse) => void) | null = null;
    const transport: ConversationTransport = request => { captured = request; return new Promise(resolve => { release = resolve; }); };
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={transport} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Wait for me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    const waiting = await screen.findByText('Preparing your answer…');
    expect(waiting.querySelector('svg')).not.toBeNull();
    await act(async () => { release?.(completed(captured as unknown as CoachConversationRequest, 'Done.')); });
    await waitFor(() => expect(screen.queryByText('Preparing your answer…')).toBeNull());
    expect(await screen.findByText('Done.')).toBeTruthy();
  });

  it('unmounts the wait mark on cancel without acknowledging a saved message', async () => {
    render(<I18nProvider defaultLang="en"><GlobalCoach identity="A" example={pendingTransport} /></I18nProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Never mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await screen.findByText('Preparing your answer…');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(screen.queryByText('Preparing your answer…')).toBeNull());
    expect(screen.queryByRole('img', { name: 'Saved message' })).toBeNull();
  });
});

describe('Ask editorial assets and scoped CSS', () => {
  const css = readFileSync(path.join(process.cwd(), 'components/assistant/GlobalCoach.module.css'), 'utf8');

  it('declares the scoped subset serif with swap and no global page preload', () => {
    expect(css).toMatch(/@font-face\s*\{[^}]*font-family:\s*'AskEditorial'[^}]*\}/);
    expect(css).toContain("url('/fonts/ask/source-serif4-latin.ttf')");
    expect(css).toMatch(/font-display:\s*swap/);
    expect(css).not.toMatch(/rel="preload"|preload:/);
  });

  it('scopes serif prose and keeps the pixel wait mark on transform/opacity steps', () => {
    expect(css).toMatch(/\.answer,\s*\.responseText,\s*\.intro,\s*\.question,\s*\.composeRail textarea\s*\{[^}]*var\(--ask-serif\)/);
    expect(css).toMatch(/@keyframes ask-wait\s*\{[^}]*translateY[^}]*\}/);
    expect(css).toMatch(/animation:\s*ask-wait\s*1100ms\s*steps\(4,\s*end\)\s*infinite/);
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.waitMark\s*\{\s*animation:\s*none/);
  });

  it('ships only the subset font plus its OFL license', () => {
    const font = path.join(process.cwd(), 'public/fonts/ask/source-serif4-latin.ttf');
    expect(statSync(font).size).toBe(608960);
    expect(statSync(path.join(process.cwd(), 'public/fonts/ask/OFL.txt')).size).toBeGreaterThan(0);
  });
});
