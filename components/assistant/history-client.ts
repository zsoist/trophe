import { COACH_CHAT_VERSION } from '@/agents/coach-assistant/chat-contract';
import { readHistoryDelete, readHistoryMessage, readHistoryEnvelope, readHistoryList, readHistoryPage, readHistoryThread, readHistoryThreadResult, type HistoryList, type HistoryPage } from '@/agents/coach-assistant/chat-result-reader';
export type { HistoryList, HistoryPage } from '@/agents/coach-assistant/chat-result-reader';
import type { ConversationRecoveryTransport } from './conversation-state';
const thread = readHistoryThread;
export interface HistoryTransport {
  recover?: ConversationRecoveryTransport;
  remove?(threadId: string, signal: AbortSignal): Promise<{ thread: HistoryPage['thread']; cleanup: 'complete' | 'pending' }>;
  rename?(threadId: string, title: string, expectedRevision: string, signal: AbortSignal): Promise<HistoryPage['thread']>;
  create?(requestId: string, title: string, signal: AbortSignal): Promise<HistoryPage['thread']>;
  list(signal: AbortSignal, before?: HistoryList['nextCursor']): Promise<HistoryList>;
  read(threadId: string, signal: AbortSignal, afterSequence?: number): Promise<HistoryPage>;
}

async function request<T>(operation: object, readValue: (value: unknown) => T, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ version: COACH_CHAT_VERSION, ...operation }) });
  if (!response.ok) throw new Error('history_unavailable');
  return readHistoryEnvelope(await response.json(), readValue);
}

/** Historical text remains historical text; it never creates a live response or a finality proof. */
export const requestHistory: HistoryTransport = {
  async recover(threadId, turnId, signal) {
    return request({ operation: 'recover', threadId, turnId }, value => {
      if (!value || typeof value !== 'object') throw new Error('history_mismatch');
      const result = value as Record<string, unknown>;
      const thread = readHistoryThread(result.thread), user = readHistoryMessage(result.user);
      const status = result.status;
      if (thread.id !== threadId || thread.state !== 'active' || result.turnId !== turnId || user.turnId !== turnId || user.role !== 'user'
        || !['settled', 'failed', 'inflight'].includes(String(status))) throw new Error('history_mismatch');
      const assistant = result.assistant === null ? null : readHistoryMessage(result.assistant);
      if (status === 'settled' ? !assistant || assistant.turnId !== turnId || assistant.role !== 'assistant' || assistant.sequence <= user.sequence : assistant !== null) throw new Error('history_mismatch');
      return { thread, status: status as 'settled' | 'failed' | 'inflight', user, assistant };
    }, signal);
  },
  async remove(threadId, signal) {
    const result = await request({ operation: 'delete', threadId, reviewed: true }, readHistoryDelete, signal);
    if (result.thread.id !== threadId || result.thread.state === 'active' || (result.cleanup === 'complete') !== (result.thread.state === 'deleted')) throw new Error('history_mismatch');
    return result;
  },
  async rename(threadId, title, expectedRevision, signal) {
    const result = await request({ operation: 'rename', threadId, title, expectedRevision }, readHistoryThreadResult, signal);
    if (result.thread.id !== threadId || result.thread.state !== 'active' || result.thread.title !== title.trim() || BigInt(result.thread.revision) <= BigInt(expectedRevision)) throw new Error('history_mismatch');
    return result.thread;
  },
  async create(requestId, title, signal) {
    const result = await request({ operation: 'create', requestId, title }, readHistoryThreadResult, signal);
    if (result.thread.state !== 'active') throw new Error('history_mismatch');
    return result.thread;
  },
  list: (signal, before) => request({ operation: 'list', limit: 20, ...(before ? { before } : {}) }, readHistoryList, signal),
  async read(threadId, signal, afterSequence = 0) {
    const result = await request({ operation: 'read', threadId, afterSequence, limit: 50 }, readHistoryPage, signal);
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
