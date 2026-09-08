// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { MemoryTransport } from '@/components/assistant/memory-state';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('uses the active conversation identity for memory, hides it when disabled, and resets across accounts', async () => {
  const memoryRequests: string[] = [], turns: string[] = [];
  const memory: MemoryTransport = async operation => {
    memoryRequests.push(operation.conversationId);
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, memories: [], scopeRevision: '0', derivedContext: 'excluded' };
  };
  const example = vi.fn(async (request: { conversationId: string }) => { turns.push(request.conversationId); throw new Error('fixture_no_answer'); });
  const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity="actor-one" example={example} memoryTransport={memory} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  expect(screen.queryByRole('button', { name: 'Load saved memories' })).toBeNull();
  vi.stubEnv('NEXT_PUBLIC_COACH_MEMORY_ACTIONS_ENABLED', '1');
  view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity="actor-one" example={example} memoryTransport={memory} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Load saved memories', hidden: true }));
  await waitFor(() => expect(memoryRequests).toHaveLength(1));
  fireEvent.change(document.getElementById('global-coach-question')!, { target: { value: 'My workout' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await waitFor(() => expect(turns).toHaveLength(1));
  expect(memoryRequests[0]).toBe(turns[0]);
  view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity="actor-two" example={example} memoryTransport={memory} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load saved memories', hidden: true }));
  await waitFor(() => expect(memoryRequests).toHaveLength(2));
  expect(memoryRequests[1]).not.toBe(memoryRequests[0]);
});
