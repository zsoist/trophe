import { textFoodResultSchema, type TextFoodOperation, type TextFoodResult } from '@/agents/coach-assistant/text-food-contract';
export type TextFoodTransport = (operation: TextFoodOperation, signal: AbortSignal) => Promise<TextFoodResult>;
export const requestTextFood: TextFoodTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = textFoodResultSchema.parse(await response.json());
  if (!response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
