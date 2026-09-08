import { COACH_IMAGE_LIMITS, type CoachConversationResponse } from '@/agents/coach-assistant/contracts';
import { readCoachResponse } from '@/components/workout/coach/client';
import type { ConversationTransport } from './conversation-state';

const exactKeys = (value: Record<string, unknown>, keys: string[]) => {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
};
const coachSurfaces = ['home', 'food', 'recipe', 'workout', 'plan', 'live', 'library', 'exercise', 'atlas', 'history', 'progress', 'profile', 'habits', 'coach', 'messages', 'intake', 'booking', 'supplements', 'form_check'];

function validActionIntent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const target = item.target as Record<string, unknown> | undefined;
  if (item.action === 'workout.set.reps.update') {
    return exactKeys(item, ['id', 'action', 'source', 'subjectId', 'scopeKey', 'surface', 'target', 'reviewRequired'])
      && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)
      && item.source === 'provider_tool' && typeof item.subjectId === 'string'
      && typeof item.scopeKey === 'string' && /^[a-f0-9]{64}$/.test(item.scopeKey)
      && coachSurfaces.includes(String(item.surface)) && item.reviewRequired === true
      && Boolean(target) && exactKeys(target!, ['selection', 'reps'])
      && target!.selection === 'latest_open_session_set' && Number.isInteger(target!.reps) && Number(target!.reps) > 0;
  }
  if (item.action === 'food.quantity.update') {
    const entryHintId = target?.entryHintId;
    const positiveGrams = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 10_000;
    return exactKeys(item, ['id', 'action', 'source', 'subjectId', 'scopeKey', 'surface', 'target', 'reviewRequired'])
      && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)
      && item.source === 'provider_tool' && typeof item.subjectId === 'string'
      && typeof item.scopeKey === 'string' && /^[a-f0-9]{64}$/.test(item.scopeKey)
      && coachSurfaces.includes(String(item.surface)) && item.reviewRequired === true
      && Boolean(target) && exactKeys(target!, ['selection', 'entryHintId', 'previousGrams', 'grams'])
      && target!.selection === 'authorized_food_entry'
      && (entryHintId === null || typeof entryHintId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entryHintId))
      && positiveGrams(target!.previousGrams) && positiveGrams(target!.grams) && target!.previousGrams !== target!.grams;
  }
  const resource = item.resource as Record<string, unknown> | undefined;
  return exactKeys(item, ['id', 'action', 'source', 'subjectId', 'scopeKey', 'surface', 'resource', 'target', 'reviewRequired'])
    && typeof item.id === 'string' && /^[a-f0-9]{64}$/.test(item.id)
    && item.action === 'draft.update' && item.source === 'provider_tool' && typeof item.subjectId === 'string'
    && typeof item.scopeKey === 'string' && /^[a-f0-9]{64}$/.test(item.scopeKey)
    && (item.surface === 'workout' || item.surface === 'plan') && item.reviewRequired === true
    && Boolean(resource) && exactKeys(resource!, ['kind', 'id', 'version']) && resource!.kind === 'draft'
    && typeof resource!.id === 'string' && typeof resource!.version === 'string' && /^[a-f0-9]{64}$/.test(String(resource!.version))
    && Boolean(target) && exactKeys(target!, ['durationMinutes', 'equipment'])
    && Number.isInteger(target!.durationMinutes) && Number(target!.durationMinutes) >= 5 && Number(target!.durationMinutes) <= 180
    && Array.isArray(target!.equipment) && target!.equipment.length === 1 && target!.equipment[0] === 'dumbbells';
}

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
  if (row.actionIntents !== undefined && (!Array.isArray(row.actionIntents) || row.actionIntents.length > 1 || row.actionIntents.some(item => !validActionIntent(item)))) throw new Error('invalid_output');
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
