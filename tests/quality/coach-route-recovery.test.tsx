// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import GlobalCoach from '@/components/assistant/GlobalCoach';
import { I18nProvider } from '@/lib/i18n';
import type { ConversationTransport } from '@/components/assistant/conversation-state';
const location = vi.hoisted(() => ({ path: '/dashboard/log' }));
vi.mock('next/navigation', () => ({ usePathname: () => location.path }));
Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });
it('keeps an initiated durable turn and the new draft through closing and route remount without redispatch', async () => {
 vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
 const actor = crypto.randomUUID(); const id = crypto.randomUUID();
 let resolve!: (value: Awaited<ReturnType<ConversationTransport>>) => void;
 const transport = vi.fn<ConversationTransport>(() => new Promise(done => { resolve = done; }));
 const history = { create: vi.fn(async () => ({ id, title: 'Question', revision: '1', state: 'active' as const, createdAt: new Date().toISOString() })), list: vi.fn(async () => ({ threads: [], nextCursor: null })), read: vi.fn() };
 const ui = () => <I18nProvider defaultLang="en"><GlobalCoach identity={actor} example={transport} historyTransport={history} /></I18nProvider>;
 const first = render(ui());
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'First question' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 await waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Next question' } });
 fireEvent.click(screen.getByRole('button', { name: 'Close Ask Trophē' }));
 expect(transport.mock.calls[0][1].aborted).toBe(false);
 first.unmount(); location.path = '/dashboard/workout'; render(ui());
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 const request = transport.mock.calls[0][0];
 await act(async () => resolve({ conversationId: id, turnId: request.turnId, ok: true, output: { answer: 'Saved answer', limitations: [], evidenceRefs: [] }, evidence: [] } as unknown as Awaited<ReturnType<ConversationTransport>>));
 expect(await screen.findByText('Saved answer')).toBeTruthy();
 expect((screen.getByRole('textbox', { name: 'Your question' }) as HTMLTextAreaElement).value).toBe('Next question');
 expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(false);
 expect(transport).toHaveBeenCalledTimes(1);
});

it('checks an uncertain turn automatically and restores its saved answer without another generation', async () => {
 vi.stubEnv('NEXT_PUBLIC_COACH_CHAT_HISTORY_ENABLED', '1');
 const id = crypto.randomUUID();
 let original!: Parameters<ConversationTransport>[0];
 const transport = vi.fn<ConversationTransport>(async request => { original = request; throw new Error('response lost'); });
 const thread = { id, title: 'Question', revision: '1', state: 'active' as const, createdAt: new Date().toISOString() };
 const recover = vi.fn(async () => {
   const user = { id: crypto.randomUUID(), turnId: original.turnId, role: 'user' as const, text: original.message, sequence: 1, revision: crypto.randomUUID(), createdAt: thread.createdAt };
   return { thread, status: 'settled' as const, user, assistant: { ...user, id: crypto.randomUUID(), role: 'assistant' as const, sequence: 2, text: 'Recovered answer' } };
 });
 render(<I18nProvider defaultLang="en"><GlobalCoach identity={crypto.randomUUID()} example={transport} historyTransport={{ create: async () => thread, list: vi.fn(), read: vi.fn(), recover }} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Ask Trophē' }));
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Question' } });
 fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
 expect(await screen.findByText('Recovered answer')).toBeTruthy();
 expect(recover).toHaveBeenCalledTimes(1); expect(transport).toHaveBeenCalledTimes(1);
 fireEvent.change(screen.getByRole('textbox', { name: 'Your question' }), { target: { value: 'Follow-up' } });
 expect(screen.getByRole('button', { name: 'Send question' }).hasAttribute('disabled')).toBe(false);
 expect(screen.queryByText(/Open this conversation from/)).toBeNull();
});
