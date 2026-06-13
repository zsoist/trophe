import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.fn();

vi.mock('@/db/client', () => ({
  db: { execute },
}));

describe('consumeRateLimit', () => {
  beforeEach(() => {
    execute.mockReset();
  });

  it('uses a non-reserved CTE name and returns the counter result', async () => {
    execute.mockResolvedValue({
      rows: [{ request_count: 1, retry_after: 900 }],
    });

    const { consumeRateLimit } = await import('@/lib/security/durable-rate-limit');
    await expect(consumeRateLimit('ai:user', 60, 900)).resolves.toEqual({
      allowed: true,
      retryAfter: 900,
    });

    const query = execute.mock.calls[0][0];
    const sqlText = query.queryChunks
      .map((chunk: { value?: string[] }) => chunk.value?.join('') ?? '')
      .join('');

    expect(sqlText).toContain('WITH rate_window AS');
    expect(sqlText).toContain('FROM rate_window');
    expect(sqlText).not.toContain('WITH window AS');
  });
});
