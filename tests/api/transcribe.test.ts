import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  consumeRateLimit: vi.fn(),
  runTranscription: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/lib/security/durable-rate-limit', () => ({ consumeRateLimit: mocks.consumeRateLimit }));
vi.mock('@/agents/transcribe', () => ({ runTranscription: mocks.runTranscription }));

import { POST } from '@/app/api/ai/transcribe/route';

function audioRequest(input: {
  type?: string;
  size?: number;
  locale?: string;
  context?: string;
  durationMs?: string;
} = {}): NextRequest {
  const form = new FormData();
  form.set('file', new File(['x'.repeat(input.size ?? 512)], 'voice', { type: input.type ?? 'audio/webm' }));
  form.set('locale', input.locale ?? 'en');
  form.set('context', input.context ?? 'food');
  form.set('durationMs', input.durationMs ?? '10_000'.replace('_', ''));
  return new Request('http://localhost/api/ai/transcribe', { method: 'POST', body: form }) as NextRequest;
}

describe('POST /api/ai/transcribe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.runTranscription.mockResolvedValue({ output: { text: 'two eggs and toast', languages: ['en'] } });
  });

  it('authenticates before parsing multipart data', async () => {
    const response = new Response(JSON.stringify({ error: 'Authentication required' }), { status: 401 });
    mocks.guardAiRoute.mockResolvedValue({ ok: false, response });
    const request = { formData: vi.fn() } as unknown as NextRequest;

    expect((await POST(request)).status).toBe(401);
    expect(request.formData).not.toHaveBeenCalled();
    expect(mocks.consumeRateLimit).not.toHaveBeenCalled();
  });

  it('applies a dedicated per-user rate limit before parsing', async () => {
    mocks.consumeRateLimit.mockResolvedValue({ allowed: false, retryAfter: 44 });
    const request = { formData: vi.fn() } as unknown as NextRequest;
    const response = await POST(request);

    expect(mocks.consumeRateLimit).toHaveBeenCalledWith('transcribe:user-1', 10, 900);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('44');
    expect(request.formData).not.toHaveBeenCalled();
  });

  it('rejects audio larger than 2 MiB', async () => {
    expect((await POST(audioRequest({ size: 2 * 1024 * 1024 + 1 }))).status).toBe(413);
    expect(mocks.runTranscription).not.toHaveBeenCalled();
  });

  it('rejects unsupported media types', async () => {
    expect((await POST(audioRequest({ type: 'text/plain' }))).status).toBe(415);
    expect(mocks.runTranscription).not.toHaveBeenCalled();
  });

  it('rejects duration or locale fields outside the bounded contract', async () => {
    expect((await POST(audioRequest({ durationMs: '30001' }))).status).toBe(400);
    expect((await POST(audioRequest({ locale: 'xx' }))).status).toBe(400);
    expect(mocks.runTranscription).not.toHaveBeenCalled();
  });

  it('returns only the validated transcription fields', async () => {
    const response = await POST(audioRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'two eggs and toast', languages: ['en'] });
    expect(mocks.runTranscription).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en', context: 'food', durationMs: 10_000 }),
      expect.objectContaining({ userId: 'user-1' }),
    );
  });

  it('maps malformed provider output to a safe 502', async () => {
    mocks.runTranscription.mockResolvedValue({ output: { text: '', languages: [] } });
    const response = await POST(audioRequest());
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      code: 'transcription_failed',
      message: 'We could not transcribe that recording. Please try again.',
    });
  });
});
