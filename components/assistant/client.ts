import type { CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { readCoachResponse } from '@/components/workout/coach/client';
import type { ConversationTransport } from './conversation-state';

export function readConversationResponse(value: unknown): CoachConversationResponse {
  if (!value || typeof value !== 'object') throw new Error('invalid_output');
  const row = value as Record<string, unknown>;
  if (row.version !== 'coach-assistant.v2' || typeof row.conversationId !== 'string' || typeof row.turnId !== 'string'
    || !Array.isArray(row.proposals) || !Array.isArray(row.receipts) || !Array.isArray(row.attachments)) throw new Error('invalid_output');
  readCoachResponse({ ...row, version: 'coach-assistant.v1' });
  if (row.ok && (!row.snapshot || typeof row.snapshot !== 'object')) throw new Error('invalid_output');
  if (row.snapshot) {
    const snapshot = row.snapshot as Record<string, unknown>;
    if (typeof snapshot.id !== 'string' || typeof snapshot.capturedAt !== 'string' || typeof snapshot.subjectId !== 'string'
      || typeof snapshot.organizationId !== 'string' || typeof snapshot.screenIncluded !== 'boolean'
      || !(snapshot.surface === null || typeof snapshot.surface === 'string') || !Array.isArray(snapshot.capabilities)) throw new Error('invalid_output');
  }
  return value as CoachConversationResponse;
}

export const requestConversation: ConversationTransport = async (request, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(request) });
  const result = readConversationResponse(await response.json());
  if ((!response.ok && result.ok) || result.dataSource !== 'authorized_records') throw new Error('invalid_output');
  return result;
};
