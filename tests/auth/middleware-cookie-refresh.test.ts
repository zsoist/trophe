import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  createSupabaseMiddlewareClient: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('@/lib/supabase/middleware', () => ({
  createSupabaseMiddlewareClient: mocks.createSupabaseMiddlewareClient,
}));

import { proxy } from '@/proxy';

function request(path: string) {
  return new NextRequest(`http://localhost${path}`, {
    headers: { cookie: 'sb-local-auth-token=stale-token' },
  });
}

describe('proxy session refresh redirects', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const response = NextResponse.next();
    response.cookies.set('sb-local-auth-token', 'rotated-token', {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
    mocks.createSupabaseMiddlewareClient.mockReturnValue({
      supabase: { auth: { getUser: mocks.getUser } },
      response,
    });
  });

  it('keeps rotated cookies when an authenticated user leaves the login page', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });

    const response = await proxy(request('/login'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/dashboard');
    expect(response.cookies.get('sb-local-auth-token')?.value).toBe('rotated-token');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
  });

  it('keeps cookie updates when a protected request redirects to login', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const response = await proxy(request('/dashboard/food'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      'http://localhost/login?redirectTo=%2Fdashboard%2Ffood',
    );
    expect(response.cookies.get('sb-local-auth-token')?.value).toBe('rotated-token');
  });
});
