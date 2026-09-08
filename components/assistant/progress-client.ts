import { readProgressResult } from '@/agents/coach-assistant/progress-result-reader';
import type { ProgressTransport } from './progress-state';

export const requestProgress: ProgressTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = readProgressResult(await response.json());
  if (!result || !response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
