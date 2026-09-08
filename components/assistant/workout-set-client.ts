import { readWorkoutSetResult } from '@/agents/coach-assistant/set-result-reader';
import type { WorkoutSetTransport } from './workout-set-state';

export const requestWorkoutSet: WorkoutSetTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', {
    method: 'POST',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(operation),
  });
  const result = readWorkoutSetResult(await response.json());
  if (!result || (!response.ok && result.ok)) throw new Error('invalid_result');
  return result;
};
