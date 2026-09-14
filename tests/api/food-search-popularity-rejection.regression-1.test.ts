import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Regression (recovery/error handling): the local branch of /api/food/search bumps
// result popularity with a fire-and-forget RPC. supabase-js rejects that promise on
// a transport failure (not a PostgREST error), and the old `.then(() => {})` left
// the rejection unhandled. Under Node's default unhandled-rejection policy (`throw`,
// since Node 15) that terminates the serverless invocation — so a transient network
// blip during a best-effort popularity bump failed a search whose results were
// already computed. The bump must swallow its own failure.

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  from: vi.fn(),
}));

vi.mock('@/lib/auth/require-role', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({
    from: mocks.from,
    rpc: vi.fn(() => Promise.reject(new Error('popularity transport failed'))),
  }),
}));

import { GET } from '@/app/api/food/search/route';

function request(q: string) {
  return new NextRequest(`http://localhost/api/food/search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

const ROWS = [
  { id: '1', name: 'Milk', name_el: 'γάλα', name_es: 'leche', calories_per_100g: 42, popularity: 90 },
];

describe('GET /api/food/search — popularity bump failure', () => {
  it('still returns the local matches when the best-effort popularity RPC rejects', async () => {
    mocks.requireRole.mockResolvedValue({ session: { userId: 'user-1', role: 'client' } });
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        order: () => query,
        or: () => query,
        limit: () => Promise.resolve({ data: ROWS, error: null }),
      };
      return query;
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ foods: [] }), { status: 200 })));

    const response = await GET(request('milk'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.source).toBe('local');
    expect(body.foods.map((f: { description: string }) => f.description)).toEqual(['Milk']);
    // Let the fire-and-forget rejection settle: an unhandled rejection fails this run.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
