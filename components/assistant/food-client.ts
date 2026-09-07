import { foodQuantityResultSchema } from '@/agents/coach-assistant/food-actions';
import type { FoodTransport } from './food-state';
export const requestFoodQuantity: FoodTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = foodQuantityResultSchema.parse(await response.json());
  if (!response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
