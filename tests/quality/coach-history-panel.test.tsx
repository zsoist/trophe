// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryPanel } from '@/components/assistant/HistoryPanel';
import type { HistoryTransport } from '@/components/assistant/history-client';
import { I18nProvider } from '@/lib/i18n';
afterEach(cleanup);
const thread = { id: crypto.randomUUID(), title: 'Yesterday', revision: '1', state: 'active' as const, createdAt: new Date().toISOString() };
it('loads only on explicit interaction and opens a saved answer with heading focus', async () => {
  const transport: HistoryTransport = { list: vi.fn(async () => ({ threads: [thread], nextCursor: null })), read: vi.fn(async () => ({ thread, messages: [{ id: crypto.randomUUID(), turnId: crypto.randomUUID(), role: 'assistant' as const, text: 'Saved answer', sequence: 1, revision: crypto.randomUUID(), createdAt: thread.createdAt }], nextSequence: null })) };
  render(<I18nProvider defaultLang="en"><HistoryPanel transport={transport} /></I18nProvider>);
  expect(transport.list).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Load conversations' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
  expect(await screen.findByText('Saved answer')).toBeTruthy();
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Yesterday' })));
});
it('aborts pending reads when the authenticated surface unmounts', async () => {
  let signal: AbortSignal | undefined;
  const transport: HistoryTransport = { list: vi.fn(current => { signal = current; return new Promise<Awaited<ReturnType<HistoryTransport['list']>>>(() => {}); }), read: vi.fn() };
  const view = render(<I18nProvider defaultLang="en"><HistoryPanel transport={transport} /></I18nProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'Load conversations' }));
  expect(signal?.aborted).toBe(false);
  view.unmount();
  expect(signal?.aborted).toBe(true);
});

it('requires deletion review and preserves a retry for pending cleanup', async () => {
 const remove = vi.fn<NonNullable<HistoryTransport['remove']>>(async () => ({ thread: { ...thread, title: '', state: 'cleanup_pending' }, cleanup: 'pending' }));
 const transport: HistoryTransport = { list: async () => ({ threads: [thread], nextCursor: null }), read: async () => ({ thread, messages: [], nextSequence: null }), remove };
 render(<I18nProvider defaultLang="en"><HistoryPanel transport={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Load conversations' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Delete conversation' }));
 expect(remove).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));
 expect(await screen.findByRole('button', { name: 'Retry cleanup' })).toBeTruthy();
 expect(remove).toHaveBeenCalledTimes(1);
 expect(screen.queryByRole('button', { name: 'Yesterday' })).toBeNull();
});

it('does not merge pages from different conversation revisions', async () => {
 const read = vi.fn<HistoryTransport['read']>();
 const item = { id: crypto.randomUUID(), turnId: crypto.randomUUID(), role: 'user' as const, text: 'Old revision', sequence: 1, revision: crypto.randomUUID(), createdAt: thread.createdAt };
 read.mockResolvedValueOnce({ thread, messages: [item], nextSequence: 1 });
 read.mockResolvedValueOnce({ thread: { ...thread, revision: '2' }, messages: [{ ...item, id: crypto.randomUUID(), sequence: 2, text: 'Changed revision' }], nextSequence: null });
 const transport: HistoryTransport = { list: async () => ({ threads: [thread], nextCursor: null }), read };
 render(<I18nProvider defaultLang="en"><HistoryPanel transport={transport} /></I18nProvider>);
 fireEvent.click(screen.getByRole('button', { name: 'Load conversations' }));
 fireEvent.click(await screen.findByRole('button', { name: 'Yesterday' }));
 fireEvent.click(await screen.findByRole('button', { name: 'More messages' }));
 await screen.findByRole('alert');
 expect(screen.queryByText('Changed revision')).toBeNull();
 expect(screen.queryByText('Old revision')).toBeNull();
});
