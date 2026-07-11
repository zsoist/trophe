import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  run: vi.fn(),
  annotateGenerationMetadata: vi.fn(),
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/agents/food-parse', () => ({ run: mocks.run }));
vi.mock('@/agents/runtime/persistence', () => ({
  annotateGenerationMetadata: mocks.annotateGenerationMetadata,
}));

import { POST } from '@/app/api/food/parse/route';

function request(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/food/parse', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('POST /api/food/parse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
    mocks.annotateGenerationMetadata.mockResolvedValue(undefined);
  });

  it('coerces unknown languages to English instead of rejecting', async () => {
    // Language is a prompt hint only — hard-400s on it/de/nl/pt caused 18
    // benchmark failures before the enum was widened + .catch('en') added.
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: 'one egg', language: 'zh' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
  });

  it('accepts the full 8-language UI set', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'Brot' }] },
      telemetry: { rawStatus: 200 },
    });
    const response = await POST(request({ text: 'eine Scheibe Brot', language: 'de' }));
    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'eine Scheibe Brot', language: 'de' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
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
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
  });

  it('maps raw pipeline failures to stable user-safe error codes', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'DeepSeek incomplete response (length)',
      telemetry: { rawStatus: 502, model: 'm', traceId: 'generation-malformed' },
    });
    const response = await POST(request({ text: 'one egg', language: 'en' }));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.code).toBe('ai_busy');
    expect(body.message).not.toContain('DeepSeek');
    expect(body.error).not.toContain('DeepSeek');
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-malformed', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'malformed',
    });
  });

  it('maps over-long input to the too_long code', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'Input too long (720 characters, max 500)',
      errorCode: 'too_long',
      telemetry: { rawStatus: 0, model: 'm', traceId: null },
    });
    const response = await POST(request({ text: 'long input', language: 'en' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('too_long');
  });

  it('maps plausibility failures to try_rephrase', async () => {
    mocks.run.mockResolvedValue({
      ok: false,
      error: 'Nutrition result failed plausibility validation',
      telemetry: { rawStatus: 200, model: 'm', traceId: null },
    });
    const response = await POST(request({ text: 'one egg', language: 'en' }));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.code).toBe('try_rephrase');
    expect(body.message).not.toContain('plausibility');
  });

  it('accepts canary segmentation only from a rate-limit-bypassed eval identity', async () => {
    mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'eval-user', rateLimitBypassed: true });
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200, traceId: 'generation-1' },
    });

    const response = await POST(request(
      { text: 'one egg', language: 'en' },
      { 'x-trophe-eval-suite': 'phase3-luna-watchlist', 'x-request-id': 'watch-1' },
    ));

    expect(response.status).toBe(200);
    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, {
      userId: 'eval-user',
      requestId: 'watch-1',
      metadata: { evalSuite: 'phase3-luna-watchlist', canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    });
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-1', {
      evalSuite: 'phase3-luna-watchlist',
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'success',
    });
  });

  it('ignores canary headers from ordinary users', async () => {
    mocks.run.mockResolvedValue({
      ok: true,
      output: { items: [{ food_name: 'egg' }] },
      telemetry: { rawStatus: 200, traceId: 'generation-2' },
    });

    await POST(request(
      { text: 'one egg', language: 'en' },
      { 'x-trophe-eval-suite': 'phase3-luna-watchlist' },
    ));

    expect(mocks.run).toHaveBeenCalledWith({ text: 'one egg', language: 'en' }, expect.objectContaining({
      userId: 'user-1',
      metadata: { canarySegment: 'consumer-luna-week-1' },
      onGenerationId: expect.any(Function),
    }));
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-2', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'success',
    });
  });

  it('records malformed when post-provider processing throws after generation creation', async () => {
    mocks.run.mockImplementationOnce(async (_input, opts) => {
      opts.onGenerationId('generation-postprocess');
      throw new Error('lookup failed after provider success');
    });

    const response = await POST(request({ text: 'one egg', language: 'en' }));

    expect(response.status).toBe(500);
    expect(mocks.annotateGenerationMetadata).toHaveBeenCalledWith('generation-postprocess', {
      canarySegment: 'consumer-luna-week-1',
      apiOutcome: 'malformed',
    });
  });
});
