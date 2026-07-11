import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AiProviderError } from '@/agents/runtime/providers/errors';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  executeAiTask: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: mocks.executeAiTask }));

import { POST } from '@/app/api/ai/photo-analyze/route';

describe('POST /api/ai/photo-analyze provider failures', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1' });
  });

  it('returns a safe 502 for an upstream protocol failure', async () => {
    mocks.executeAiTask.mockRejectedValue(new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic photo response missing tool call',
      status: 200,
      errorType: 'provider_protocol_error',
      errorCode: 'missing_tool_call',
      providerRequestId: 'req_photo',
    }));
    const request = new NextRequest('http://localhost/api/ai/photo-analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'AAAA', mediaType: 'image/jpeg' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: 'Could not read reliable nutrition from this photo — try a clearer shot or enter it manually',
    });
  });

  it('returns a retryable 503 for a provider transport failure', async () => {
    mocks.executeAiTask.mockRejectedValue(new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic network request failed',
      errorType: 'network_error',
    }));
    const request = new NextRequest('http://localhost/api/ai/photo-analyze', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ imageBase64: 'AAAA', mediaType: 'image/jpeg' }),
    });

    const response = await POST(request);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Photo analysis is temporarily unavailable — please try again.',
    });
  });
});
