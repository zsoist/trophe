import type { CoachResponse } from '@/agents/coach-assistant/contracts';
import type { CoachTransport } from './WorkoutCoachEntry';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object';
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 16000);

/** Reject incompatible/error HTML or malformed content before it reaches the response surface. */
export function readCoachResponse(value: unknown): CoachResponse {
  if (!record(value) || value.version !== 'coach-assistant.v1' || typeof value.ok !== 'boolean'
    || !['offline', 'model'].includes(String(value.mode))
    || !['synthetic', 'authorized_records'].includes(String(value.dataSource))
    || !Array.isArray(value.evidence) || value.evidence.length > 100) throw new Error('invalid_output');
  for (const item of value.evidence) {
    if (!record(item) || typeof item.id !== 'string' || typeof item.statement !== 'string'
      || !record(item.window) || typeof item.window.start !== 'string' || typeof item.window.end !== 'string'
      || typeof item.window.timezone !== 'string' || !['complete', 'partial'].includes(String(item.completeness))) throw new Error('invalid_output');
  }
  if (value.ok) {
    const output = value.output;
    if (!record(output) || typeof output.answer !== 'string' || output.answer.length > 16000
      || !strings(output.evidenceRefs) || !strings(output.limitations) || !strings(output.suggestions)
      || !record(output.escalation) || typeof output.escalation.required !== 'boolean'
      || !(output.escalation.reason === null || typeof output.escalation.reason === 'string')
      || !(output.escalation.draft === null || typeof output.escalation.draft === 'string')) throw new Error('invalid_output');
    const ids = new Set(value.evidence.map(item => item.id));
    if (output.evidenceRefs.some(id => !ids.has(id))) throw new Error('invalid_output');
  } else if (!record(value.error) || typeof value.error.code !== 'string' || typeof value.error.retryable !== 'boolean') throw new Error('invalid_output');
  return value as unknown as CoachResponse;
}

export const requestWorkoutCoach: CoachTransport = async (request, signal) => {
  const response = await fetch('/api/coach-assistant', {
    method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(request),
  });
  const result = readCoachResponse(await response.json());
  if (!response.ok && result.ok) throw new Error('invalid_output');
  // An authenticated request never silently substitutes example records.
  if (result.dataSource !== 'authorized_records') throw new Error('invalid_output');
  return result;
};
