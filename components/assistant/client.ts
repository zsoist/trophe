import { COACH_IMAGE_LIMITS, type CoachConversationResponse } from '@/agents/coach-assistant/contracts';
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
      || !['client', 'coach', 'admin', 'super_admin'].includes(String(snapshot.actorRole))
      || !['self', 'assigned_professional'].includes(String(snapshot.access))
      || typeof snapshot.scopeKey !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.scopeKey)
      || !(snapshot.surface === null || typeof snapshot.surface === 'string') || !Array.isArray(snapshot.capabilities)) throw new Error('invalid_output');
    if (snapshot.capabilities.length > 20 || snapshot.capabilities.some(item => !item || typeof item !== 'object'
      || typeof item.key !== 'string' || !['available', 'unknown', 'unauthorized', 'not_connected'].includes(item.status))) throw new Error('invalid_output');
  }
  if (row.profile !== undefined) {
    const p = row.profile as Record<string, unknown>;
    if (!p || typeof p !== 'object' || typeof p.language !== 'string' || typeof p.timezone !== 'string' || typeof p.version !== 'string'
      || !['authorized_profile', 'isolated_fixture'].includes(String(p.source)) || !p.preferences || typeof p.preferences !== 'object'
      || ![20, 30, 45, 60].includes((p.preferences as { durationMinutes: number }).durationMinutes)) throw new Error('invalid_output');
  }
  if (row.memories !== undefined && (!Array.isArray(row.memories) || row.memories.length > 10 || row.memories.some(item => !item || typeof item !== 'object'
    || typeof item.id !== 'string' || typeof item.text !== 'string' || item.text.length > 2000 || typeof item.createdAt !== 'string'
    || !['user_input', 'coach', 'agent_inference', 'wearable'].includes(item.source)
    || !['user', 'session', 'agent'].includes(item.scope) || !['unconfirmed', 'confirmed'].includes(item.confirmation)))) throw new Error('invalid_output');
  if (row.uploads !== undefined) {
    const upload = row.uploads as Record<string, unknown>;
    const limits = upload?.limits as Record<string, unknown> | undefined;
    if (!upload || upload.images !== true || upload.storage !== 'isolated_ephemeral' || upload.analysis !== 'not_connected' || !limits
      || Object.entries(COACH_IMAGE_LIMITS).some(([key, value]) => limits[key] !== value)) throw new Error('invalid_upload_capability');
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
