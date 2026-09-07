// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { DietTransport } from '@/components/assistant/diet-state';
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/food' }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('opens the visible dietary section using the active self and conversation, then resets on account change', async () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED', '1');
  const actor = crypto.randomUUID(), nextActor = crypto.randomUUID();
  const requests: Array<{ profileId: string; conversationId: string }> = [];
  const turns: string[] = [];
  const diet: DietTransport = async operation => {
    requests.push(operation);
    return { version: 'coach-assistant.v2', storage: 'database', ok: true, snapshot: { profileId: operation.profileId, version: '0', preferences: { version: 1, dietPattern: null } } };
  };
  const example = vi.fn(async (request: { conversationId: string }) => { turns.push(request.conversationId); throw new Error('fixture_no_answer'); });
  const node = (identity: string) => <I18nProvider defaultLang="en"><GlobalCoach identity={identity} example={example} dietTransport={diet} /></I18nProvider>;
  const view = render(node(actor));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  fireEvent.click(document.querySelector('#global-coach summary')!);
  await screen.findByRole('combobox', { name: 'Diet preference' });
  expect(requests).toHaveLength(1); expect(requests[0].profileId).toBe(actor);
  fireEvent.change(document.getElementById('global-coach-question')!, { target: { value: 'My meals' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
  await waitFor(() => expect(turns).toHaveLength(1));
  expect(turns[0]).toBe(requests[0].conversationId);
  view.rerender(node(nextActor));
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  fireEvent.click(document.querySelector('#global-coach summary')!);
  await screen.findByRole('combobox', { name: 'Diet preference' });
  expect(requests).toHaveLength(2); expect(requests[1].profileId).toBe(nextActor);
  expect(requests[1].conversationId).not.toBe(requests[0].conversationId);
});
it('does not expose dietary writes for another subject or an example without its own transport', () => {
  vi.stubEnv('NEXT_PUBLIC_COACH_DIET_ACTIONS_ENABLED', '1');
  const identity = crypto.randomUUID(), subjectId = crypto.randomUUID();
  const example = vi.fn();
  const view = render(<I18nProvider defaultLang="en"><GlobalCoach identity={identity} subjectId={subjectId} example={example} dietTransport={vi.fn()} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.queryByText('Diet preference')).toBeNull();
  view.rerender(<I18nProvider defaultLang="en"><GlobalCoach identity={identity} example={example} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Ask coach' }));
  expect(screen.queryByText('Diet preference')).toBeNull();
});
