import { photoFoodResultSchema, type PhotoFoodOperation } from '@/agents/coach-assistant/photo-food-actions';
import type { PhotoFoodResult } from '@/agents/coach-assistant/photo-food-contracts';

export type PhotoFoodTransport = (operation: PhotoFoodOperation, signal: AbortSignal) => Promise<PhotoFoodResult>;

export const requestPhotoFood: PhotoFoodTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const parsed = photoFoodResultSchema.safeParse(await response.json());
  if (!parsed.success || !response.ok && parsed.data.ok) throw new Error('invalid_result');
  return parsed.data;
};
