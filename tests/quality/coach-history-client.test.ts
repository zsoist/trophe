import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestHistory } from '@/components/assistant/history-client';

const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const thread = { id, title: 'Saved conversation', revision: '2', state: 'active', createdAt: '2026-09-07T10:00:00Z' };
const message = { id, turnId: other, role: 'assistant', text: 'A saved answer', sequence: 2, revision: other, createdAt: thread.createdAt };
function respond(value: unknown) {
  return vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ version: 'coach-assistant.chat.v1', storage: 'database', ok: true, value }))));
}
afterEach(() => vi.unstubAllGlobals());
describe('durable history HTTP boundary', () => {
  it('loads stored text without constructing live coach metadata', async () => {
    respond({ thread, messages: [message], nextSequence: null });
    const page = await requestHistory.read(id, new AbortController().signal);
    expect(page.messages[0].text).toBe('A saved answer');
    expect(page.messages[0]).not.toHaveProperty('snapshot');
    expect(fetch).toHaveBeenCalledWith('/api/coach-assistant', expect.objectContaining({ credentials: 'same-origin', redirect: 'error', body: expect.stringContaining('"operation":"read"') }));
  });
  it('fails closed when the database envelope is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('null')));
    await expect(requestHistory.read(id, new AbortController().signal)).rejects.toThrow('history_unavailable');
  });
  it.each([
    { thread: { ...thread, id: other }, messages: [message], nextSequence: null },
    { thread, messages: [message, message], nextSequence: null },
    { thread, messages: [message], nextSequence: 3 },
    { thread, messages: [], nextSequence: 2 },
    { thread: { ...thread, state: 'deleted' }, messages: [message], nextSequence: null },
  ])('rejects mismatched thread, duplicate sequence or invalid continuation', async value => {
    respond(value);
    await expect(requestHistory.read(id, new AbortController().signal)).rejects.toThrow('history_mismatch');
  });
});

it('correlates a rename with thread, title and a newer revision', async () => {
 respond({ thread: { ...thread, title: 'New name', revision: '3' } });
 expect((await requestHistory.rename!(id, 'New name', '2', new AbortController().signal)).title).toBe('New name');
 respond({ thread: { ...thread, title: 'New name', revision: '2' } });
 await expect(requestHistory.rename!(id, 'New name', '2', new AbortController().signal)).rejects.toThrow('history_mismatch');
 respond({ thread: { ...thread, id: other, title: 'New name', revision: '3' } });
 await expect(requestHistory.rename!(id, 'New name', '2', new AbortController().signal)).rejects.toThrow('history_mismatch');
});

it('validates exact terminal recovery without trusting a mismatched turn or assistant', async () => {
 const user = { ...message, role: 'user', sequence: 1 };
 const assistant = { ...message, id: crypto.randomUUID(), sequence: 2 };
 respond({ thread, turnId: other, status: 'settled', user, assistant });
 expect((await requestHistory.recover!(id, other, new AbortController().signal)).status).toBe('settled');
 expect(fetch).toHaveBeenCalledWith('/api/coach-assistant', expect.objectContaining({ body: expect.stringContaining('"operation":"recover"') }));
 respond({ thread, turnId: other, status: 'settled', user, assistant: { ...assistant, turnId: id } });
 await expect(requestHistory.recover!(id, other, new AbortController().signal)).rejects.toThrow();
 respond({ thread, turnId: other, status: 'inflight', user, assistant });
 await expect(requestHistory.recover!(id, other, new AbortController().signal)).rejects.toThrow();
 respond({ thread, turnId: other, status: 'inflight', user, assistant: null });
 expect((await requestHistory.recover!(id, other, new AbortController().signal)).status).toBe('inflight');
});
