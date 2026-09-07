import type { CoachActionResult } from '@/agents/coach-assistant/contracts';
import type { PreferenceTransport } from './preference-state';
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export function readPreferenceResult(value: unknown): CoachActionResult {
  if (!object(value) || value.version !== 'coach-assistant.v2' || typeof value.ok !== 'boolean'
    || !['isolated_ephemeral', 'database'].includes(String(value.storage))) throw new Error('invalid_result');
  if (value.proposal) {
    const p = value.proposal;
    if (!object(p) || p.action !== 'preference.update' || typeof p.id !== 'string' || typeof p.hash !== 'string'
      || !object(p.resource) || p.resource.kind !== 'preference' || typeof p.resource.version !== 'string'
      || !object(p.before) || !object(p.after) || ![20, 30, 45, 60].includes(Number(p.before.durationMinutes))
      || ![20, 30, 45, 60].includes(Number(p.after.durationMinutes)) || typeof p.expiresAt !== 'string'
      || !Number.isFinite(Date.parse(p.expiresAt)) || p.reviewRequired !== true) throw new Error('invalid_proposal');
  }
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
