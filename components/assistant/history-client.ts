import { z } from 'zod';
import { COACH_CHAT_VERSION } from '@/agents/coach-assistant/chat-contract';

const thread = z.object({ id: z.string().uuid(), title: z.string().max(80), createdAt: z.string().datetime({ offset: true }), revision: z.string().regex(/^(0|[1-9]\d*)$/), state: z.enum(['active', 'cleanup_pending', 'deleted']) });
const message = z.object({ id: z.string().uuid(), turnId: z.string().uuid(), role: z.enum(['user', 'assistant']), text: z.string(), sequence: z.number().int().positive(), revision: z.string().uuid(), createdAt: z.string().datetime({ offset: true }) });
const cursor = z.object({ createdAt: z.string().datetime({ offset: true }), id: z.string().uuid() });
const list = z.object({ threads: z.array(thread).max(50), nextCursor: cursor.nullable() });
const page = z.object({ thread, messages: z.array(message).max(50), nextSequence: z.number().int().positive().nullable() });
export type HistoryList = z.infer<typeof list>;
export type HistoryPage = z.infer<typeof page>;
export interface HistoryTransport {
  remove?(threadId: string, signal: AbortSignal): Promise<{ thread: HistoryPage['thread']; cleanup: 'complete' | 'pending' }>;
  rename?(threadId: string, title: string, expectedRevision: string, signal: AbortSignal): Promise<HistoryPage['thread']>;
  create?(requestId: string, title: string, signal: AbortSignal): Promise<HistoryPage['thread']>;
  list(signal: AbortSignal, before?: HistoryList['nextCursor']): Promise<HistoryList>;
  read(threadId: string, signal: AbortSignal, afterSequence?: number): Promise<HistoryPage>;
}

async function request<T>(operation: object, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ version: COACH_CHAT_VERSION, ...operation }) });
  const parsed = z.object({ version: z.literal(COACH_CHAT_VERSION), storage: z.literal('database'), ok: z.literal(true), value: schema }).safeParse(await response.json());
  if (!response.ok || !parsed.success) throw new Error('history_unavailable');
  return parsed.data.value;
}

/** Historical text remains historical text; it never creates a live response or a finality proof. */
export const requestHistory: HistoryTransport = {
  async remove(threadId, signal) {
    const result = await request({ operation: 'delete', threadId, reviewed: true }, z.object({ thread, cleanup: z.enum(['complete', 'pending']) }), signal);
    if (result.thread.id !== threadId || result.thread.state === 'active' || (result.cleanup === 'complete') !== (result.thread.state === 'deleted')) throw new Error('history_mismatch');
    return result;
  },
  async rename(threadId, title, expectedRevision, signal) {
    const result = await request({ operation: 'rename', threadId, title, expectedRevision }, z.object({ thread }), signal);
    if (result.thread.id !== threadId || result.thread.state !== 'active' || result.thread.title !== title.trim() || BigInt(result.thread.revision) <= BigInt(expectedRevision)) throw new Error('history_mismatch');
    return result.thread;
  },
  async create(requestId, title, signal) {
    const result = await request({ operation: 'create', requestId, title }, z.object({ thread }), signal);
    if (result.thread.state !== 'active') throw new Error('history_mismatch');
    return result.thread;
  },
  list: (signal, before) => request({ operation: 'list', limit: 20, ...(before ? { before } : {}) }, list, signal),
  async read(threadId, signal, afterSequence = 0) {
    const result = await request({ operation: 'read', threadId, afterSequence, limit: 50 }, page, signal);
    if (result.thread.id !== threadId || result.thread.state !== 'active') throw new Error('history_mismatch');
    let previous = afterSequence;
    const ids = new Set<string>();
    for (const item of result.messages) {
      if (item.sequence <= previous || ids.has(item.id)) throw new Error('history_mismatch');
      previous = item.sequence; ids.add(item.id);
    }
    if (result.nextSequence !== null && (result.messages.length === 0 || result.nextSequence !== previous)) throw new Error('history_mismatch');
    return result;
  },
};
