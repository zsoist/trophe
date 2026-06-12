/**
 * POST /api/client/message — unified messaging quick-send.
 * Covers the 2026-06-12 audit hardening: auth, zod bounds, durable rate
 * limit, coach-assignment requirement, and the messages-table insert shape.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const maybeSingle = vi.fn();
  const insert = vi.fn();
  const from = vi.fn((table: string) => {
    if (table === 'client_profiles') {
      return { select: () => ({ eq: () => ({ maybeSingle }) }) };
    }
    return { insert };
  });
  return {
    getUser,
    maybeSingle,
    insert,
    from,
    consumeRateLimit: vi.fn(),
  };
});

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));
vi.mock('@/lib/durable-rate-limit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { POST } from '@/app/api/client/message/route';

function request(body: unknown, token = 'valid-token') {
  return new NextRequest('http://localhost/api/client/message', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/client/message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'client-1' } }, error: null });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.maybeSingle.mockResolvedValue({ data: { coach_id: 'coach-1' } });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('rejects requests without a bearer token', async () => {
    const response = await POST(request({ message: 'hi' }, ''));
    expect(response.status).toBe(401);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('rejects empty and oversized messages before any DB write', async () => {
    expect((await POST(request({ message: '' }))).status).toBe(400);
    expect((await POST(request({ message: 'x'.repeat(2001) }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('enforces the durable rate limit with Retry-After', async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfter: 42 });
    const response = await POST(request({ message: 'hello' }));
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('42');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('requires an assigned coach', async () => {
    mocks.maybeSingle.mockResolvedValue({ data: null });
    const response = await POST(request({ message: 'hello' }));
    expect(response.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('inserts into the unified messages thread as the client', async () => {
    const response = await POST(request({ message: '  hello coach  ' }));
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('messages');
    expect(mocks.insert).toHaveBeenCalledWith({
      coach_id: 'coach-1',
      client_id: 'client-1',
      sender_role: 'client',
      body: 'hello coach',
    });
  });
});
