import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const or = vi.fn(() => ({ order }));
  const select = vi.fn(() => ({ or }));
  const from = vi.fn(() => ({ select }));
  return {
    consumeRateLimit: vi.fn(),
    from,
    limit,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.from })),
}));
vi.mock('@/lib/security/durable-rate-limit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { GET } from '@/app/api/food/local-search/route';

function request(limit: string) {
  return new NextRequest(`http://localhost/api/food/local-search?q=rice&limit=${limit}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

describe('GET /api/food/local-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-anon';
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.limit.mockResolvedValue({ data: [], error: null });
  });

  it.each([
    ['garbage', 15],
    ['3foods', 15],
    ['0', 1],
    ['1000', 50],
    ['12', 12],
  ])('normalizes limit %s to %s before querying', async (raw, expected) => {
    const response = await GET(request(raw));

    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith(expected);
  });

  it('returns stable public copy without leaking database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.limit.mockResolvedValue({
      data: null,
      error: {
        name: 'PostgrestError',
        code: '42P01',
        message: 'relation private_food_shadow does not exist',
        details: 'internal database topology',
      },
    });

    const response = await GET(request('15'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Food search temporarily unavailable' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private_food_shadow');
    expect(JSON.stringify(log.mock.calls)).not.toContain('internal database topology');
    log.mockRestore();
  });
});
