import { readCoachMessageResult } from '@/agents/coach-assistant/message-result-reader';
import type { MessageTransport } from './message-state';

export const requestCoachMessage: MessageTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(operation),
  });
  const result = readCoachMessageResult(await response.json());
  if (!result || !response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
