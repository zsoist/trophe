import { describe, expect, it, vi } from 'vitest';

vi.mock('@/db/client', () => ({
  db: { execute: vi.fn(async () => ({ rows: [{ '?column?': 1 }] })) },
}));

import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns a minimal connected health response', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: 'ok', db: 'connected' });
    expect(body.version).toBeTypeOf('string');
    expect(body.timestamp).toBeTypeOf('string');
    expect(body.routing.foodParse).toEqual({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      fallbackProvider: 'anthropic',
      fallbackModel: 'claude-haiku-4-5-20251001',
      promptVersion: 'food-parse-v8-luna',
    });
    expect(body).not.toHaveProperty('env');
    expect(body).not.toHaveProperty('tables');
  });
});
