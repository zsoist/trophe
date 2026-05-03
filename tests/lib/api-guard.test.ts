import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const getUser = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser },
  })),
}));

async function loadGuard() {
  vi.resetModules();
  return import('../../lib/api-guard');
}

function request(auth?: string) {
  return new NextRequest('https://trophe.test/api/ai/meal-suggest', {
    method: 'POST',
    headers: auth ? { authorization: auth } : undefined,
  });
}

describe('guardAiRoute', () => {
  beforeEach(() => {
    getUser.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('returns 401 when the bearer token is missing', async () => {
    const { guardAiRoute } = await loadGuard();

    const result = await guardAiRoute(request());

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('returns 401 when Supabase rejects the bearer token', async () => {
    getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('invalid JWT'),
    });
    const { guardAiRoute } = await loadGuard();

    const result = await guardAiRoute(request('Bearer forged.jwt'));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
    expect(getUser).toHaveBeenCalledWith('forged.jwt');
  });

  it('returns the verified Supabase user id for valid bearer tokens', async () => {
    getUser.mockResolvedValue({
      data: { user: { id: '00000000-0000-4000-8000-000000000123' } },
      error: null,
    });
    const { guardAiRoute } = await loadGuard();

    const result = await guardAiRoute(request('Bearer verified.jwt'));

    expect(result).toEqual({ ok: true, userId: '00000000-0000-4000-8000-000000000123' });
    expect(getUser).toHaveBeenCalledWith('verified.jwt');
  });
});
