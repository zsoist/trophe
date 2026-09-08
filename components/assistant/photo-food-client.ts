import type { PhotoFoodOperation } from '@/agents/coach-assistant/photo-food-actions';
import type { PhotoFoodResult } from '@/agents/coach-assistant/photo-food-contracts';
import { readPhotoFoodResult } from '@/agents/coach-assistant/photo-food-result-reader';

export type PhotoFoodTransport = (operation: PhotoFoodOperation, signal: AbortSignal) => Promise<PhotoFoodResult>;

export const requestPhotoFood: PhotoFoodTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const parsed = readPhotoFoodResult(await response.json());
  if (!parsed || !response.ok && parsed.ok) throw new Error('invalid_result');
  return parsed;
};
