import { describe, expect, it } from 'vitest';
import { settleMemoryWrites } from '@/agents/memory/bounded-write';

describe('bounded memory writes', () => {
  it('reports completed only when every write succeeds', async () => {
    await expect(settleMemoryWrites([Promise.resolve(), Promise.resolve()], 50)).resolves.toBe('completed');
  });

  it('reports degraded on rejection or response-budget timeout', async () => {
    await expect(settleMemoryWrites([Promise.reject(new Error('failed'))], 50)).resolves.toBe('degraded');
    await expect(settleMemoryWrites([new Promise(() => {})], 5)).resolves.toBe('degraded');
  });
});
