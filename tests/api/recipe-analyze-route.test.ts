import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  run: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/recipe-analyze', () => ({ run: mocks.run }));

import { POST } from '@/app/api/food/recipe-analyze/route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/food/recipe-analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// A raw pipeline internal that must never be shown to a user.
const RAW_INTERNAL = 'DeepSeek incomplete response (length)';

describe('POST /api/food/recipe-analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
  });

  it('maps a returned raw pipeline error to friendly copy without echoing it', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: RAW_INTERNAL,
      telemetry: { rawStatus: 502, model: 'm', traceId: 'g-1' },
    });

    const response = await POST(request({ text: 'flour, water, salt', language: 'en' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe('ai_busy');
    expect(JSON.stringify(body)).not.toContain('DeepSeek');
    expect(JSON.stringify(body)).not.toContain('incomplete response');
    // Existing consumers read `.error`; it must be friendly too.
    expect(body.error).toBe(body.message);
  });

  it('maps a thrown provider error to friendly copy without echoing it', async () => {
    mocks.run.mockRejectedValue(new Error(RAW_INTERNAL));

    const response = await POST(request({ text: 'flour, water, salt', language: 'en' }));
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.code).toBe('ai_busy');
    expect(JSON.stringify(body)).not.toContain('DeepSeek');
    expect(body.error).toBe(body.message);
  });

  it('does not synthesize food on failure — an empty result stays a failure', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'text is required and must be a non-empty string',
      telemetry: { rawStatus: 0, model: 'm', traceId: null },
    });

    const response = await POST(request({ text: 'x', language: 'en' }));
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.code).toBe('try_rephrase');
    expect(body).not.toHaveProperty('ingredients');
  });
});
