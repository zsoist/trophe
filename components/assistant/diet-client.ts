import { readFoodPreferenceResult } from '@/agents/coach-assistant/food-preference-result-reader';
import type { DietTransport } from './diet-state';
export const requestDiet: DietTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = readFoodPreferenceResult(await response.json());
  if (!result || !response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
