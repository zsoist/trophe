import type { CoachActionResult } from '@/agents/coach-assistant/contracts';
import type { PreferenceTransport } from './preference-state';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function readPreferenceResult(value: unknown): CoachActionResult {
  if (!object(value) || value.version !== 'coach-assistant.v2' || typeof value.ok !== 'boolean'
    || !['isolated_ephemeral', 'database'].includes(String(value.storage))) throw new Error('invalid_result');
  if (value.proposal) {
    const p = value.proposal;
    if (!object(p) || !['preference.update', 'memory.confirm', 'memory.correct', 'memory.delete'].includes(String(p.action)) || typeof p.id !== 'string' || typeof p.hash !== 'string'
      || !object(p.resource) || !['preference', 'memory'].includes(String(p.resource.kind)) || typeof p.resource.version !== 'string'
      || !object(p.before) || !object(p.after) || typeof p.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(p.expiresAt)) || p.reviewRequired !== true) throw new Error('invalid_proposal');
    if (p.action === 'preference.update' ? p.resource.kind !== 'preference' || ![20, 30, 45, 60].includes(Number(p.before.durationMinutes)) || ![20, 30, 45, 60].includes(Number(p.after.durationMinutes))
      : p.resource.kind !== 'memory' || typeof p.resource.id !== 'string' || typeof p.before.text !== 'string' || (p.action === 'memory.delete' ? p.after.deleted !== true : typeof p.after.text !== 'string' || p.after.confirmation !== 'confirmed')) throw new Error('invalid_proposal');
  }
  if (value.memory !== undefined && value.memory !== null) {
    const m = value.memory;
    if (!object(m) || typeof m.id !== 'string' || typeof m.version !== 'string' || typeof m.text !== 'string' || m.text.length > 500
      || !['user_input', 'coach', 'agent_inference', 'wearable'].includes(String(m.source)) || !['user', 'session', 'agent'].includes(String(m.scope))
      || !['confirmed', 'unconfirmed'].includes(String(m.confirmation)) || typeof m.createdAt !== 'string' || !Number.isFinite(Date.parse(m.createdAt))) throw new Error('invalid_memory');
  }
  if (value.invalidatedMemoryVersions !== undefined && (!Array.isArray(value.invalidatedMemoryVersions) || value.invalidatedMemoryVersions.length > 10 || value.invalidatedMemoryVersions.some(item => !object(item) || typeof item.id !== 'string' || typeof item.version !== 'string'))) throw new Error('invalid_memory_versions');
  if (value.receipt) {
    const r = value.receipt;
    if (!object(r) || typeof r.id !== 'string' || typeof r.actionId !== 'string' || typeof r.proposalId !== 'string'
      || !['applied', 'rejected', 'uncertain'].includes(String(r.status)) || typeof r.recordedAt !== 'string'
      || !(r.resourceVersion === null || typeof r.resourceVersion === 'string')) throw new Error('invalid_receipt');
  }
  return value as unknown as CoachActionResult;
}
export const requestPreference: PreferenceTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = readPreferenceResult(await response.json());
  if (!response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
