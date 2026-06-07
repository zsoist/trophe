import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/food-parse', () => ({ run: mocks.run }));

import { POST } from '@/app/api/food/parse/route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/food/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/food/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1' });
  });

  it('rejects unsupported languages before invoking the model', async () => {
    const response = await POST(request({ text: 'one egg', language: 'fr' }));
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('rejects inputs above the governed parser ceiling', async () => {
    const response = await POST(request({ text: 'x'.repeat(12_001), language: 'en' }));
    expect(response.status).toBe(400);
    expect(mocks.run).not.toHaveBeenCalled();
  });

  it('passes normalized supported input to the parser', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: '  one egg  ', language: 'en' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, { userId: 'user-1' });
  });
});
