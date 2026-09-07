import { readFoodQuantityResult } from '@/agents/coach-assistant/food-result-reader';
import type { FoodTransport } from './food-state';
export const requestFoodQuantity: FoodTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = readFoodQuantityResult(await response.json());
  if (!result || !response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
