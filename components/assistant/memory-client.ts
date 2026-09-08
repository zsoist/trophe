import { readPersistentMemoryResult } from '@/agents/coach-assistant/memory-result-reader';
import type { MemoryTransport } from './memory-state';
export const requestMemory: MemoryTransport = async (operation, signal) => {
  const response = await fetch('/api/coach-assistant', { method: 'POST', credentials: 'same-origin', redirect: 'error', signal,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(operation) });
  const result = readPersistentMemoryResult(await response.json());
  if (!result || !response.ok && result.ok) throw new Error('invalid_result');
  return result;
};
