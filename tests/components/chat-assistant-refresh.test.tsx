// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { COACH_MESSAGE_REFRESH } from '@/components/assistant/message-events';

const state = vi.hoisted(() => ({ reads: 0 }));
vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, { ...props, ref }, children as React.ReactNode),
  );
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: element('div'), img: element('img'), span: element('span') }, useReducedMotion: () => true };
});
vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span');
  return { Mic: Icon, Paperclip: Icon, Pause: Icon, Play: Icon, Square: Icon, X: Icon };
});
vi.mock('@/components/ui', () => ({ Icon: () => React.createElement('span') }));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/microphone/recording-session', () => ({ startAudioRecordingSession: vi.fn() }));
vi.mock('@/lib/supabase', () => {
  const messages = {
    select: () => {
      state.reads += 1;
      const query = { eq: () => query, order: () => query, limit: async () => ({ data: [] }) };
      return query;
    },
    update: () => { const query = { eq: () => query, is: async () => ({ error: null }) }; return query; },
  };
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { from: () => messages, channel: () => channel, removeChannel: vi.fn(), storage: { from: () => ({}) } } };
});

import ChatThread from '@/components/shared/ChatThread';

beforeEach(() => Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() }));
afterEach(() => { cleanup(); state.reads = 0; });

it('refetches only when the assistant receipt matches the open human thread', async () => {
  const coachId = '11111111-1111-4111-8111-111111111111';
  const clientId = '22222222-2222-4222-8222-222222222222';
  render(<ChatThread coachId={coachId} clientId={clientId} viewerRole="client" />);
  await waitFor(() => expect(state.reads).toBe(1));

  window.dispatchEvent(new CustomEvent(COACH_MESSAGE_REFRESH, { detail: {
    coachId, clientId, messageId: '33333333-3333-4333-8333-333333333333', strategy: 'refetch',
  } }));
  await waitFor(() => expect(state.reads).toBe(2));

  window.dispatchEvent(new CustomEvent(COACH_MESSAGE_REFRESH, { detail: {
    coachId: '44444444-4444-4444-8444-444444444444', clientId,
    messageId: '55555555-5555-4555-8555-555555555555', strategy: 'refetch',
  } }));
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(state.reads).toBe(2);
});
