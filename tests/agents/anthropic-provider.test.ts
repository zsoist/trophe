import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAnthropicMessages } from '@/agents/clients/anthropic';
import { AnthropicApiError, invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';
import { invokeTextProvider } from '@/agents/runtime/providers/text';

const SENSITIVE_SENTINEL = 'SENSITIVE_SENTINEL_DO_NOT_LOG';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function blockGlobalFetch() {
  vi.stubGlobal('fetch', () => {
    throw new Error('unexpected global fetch');
  });
}

async function captureError(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }
  throw new Error('expected work to fail');
}

describe('Anthropic provider transport', () => {
  it('forwards the exact abort signal through the text dispatcher to the injected transport', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_text_123',
      content: [{ type: 'text', text: 'safe answer' }],
      usage: {
        input_tokens: 12,
        output_tokens: 3,
        cache_creation_input_tokens: 4,
        cache_read_input_tokens: 5,
      },
    }), { status: 200 }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const result = await invokeTextProvider({
      policy: {
        provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
      },
      system: 'system',
      prompt: 'prompt',
      signal,
      fetchImpl,
    });

    expect(result).toMatchObject({
      output: 'safe answer',
      usage: { inputTokens: 12, outputTokens: 3, cacheWriteTokens: 4, cacheReadTokens: 5 },
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal });
  });

  it.each([
    [403, { type: 'permission_error', code: 'forbidden' }, 'req_forbidden'],
    [429, { type: 'rate_limit_error', code: 'rate_limited' }, 'req_rate_limited'],
    [503, undefined, 'req_unavailable'],
  ] as const)('normalizes a %i response without retaining provider body text', async (status, providerError, requestId) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const responseBody = providerError
      ? JSON.stringify({
          id: 'msg_error_123',
          error: { ...providerError, message: SENSITIVE_SENTINEL },
          usage: {
            input_tokens: 12,
            output_tokens: 3,
            cache_creation_input_tokens: 4,
            cache_read_input_tokens: 5,
          },
        })
      : `<html>${SENSITIVE_SENTINEL}</html>`;
    const fetchMock = vi.fn().mockResolvedValue(new Response(responseBody, {
      status,
      headers: { 'request-id': requestId },
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001' },
      signal: new AbortController().signal,
      fetchImpl,
    }));

    expect(error).toBeInstanceOf(AnthropicApiError);
    expect(error).toMatchObject({
      status,
      code: providerError?.code,
      type: providerError?.type ?? 'http_error',
      requestId,
      providerGenerationId: providerError ? 'msg_error_123' : undefined,
      usage: providerError ? {
        inputTokens: 12,
        outputTokens: 3,
        cacheWriteTokens: 4,
        cacheReadTokens: 5,
      } : undefined,
    });
    expect(error).toHaveProperty('latencyMs');
    expect(String(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(error).not.toHaveProperty('rawError');
    expect(error).not.toHaveProperty('responseBody');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal: expect.any(AbortSignal) });
  });

  it('normalizes malformed successful JSON as a typed provider error', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{malformed', {
      status: 200,
      headers: { 'request-id': 'req_malformed' },
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001' },
      signal: new AbortController().signal,
      fetchImpl,
    }));

    expect(error).toMatchObject({
      name: 'AnthropicApiError',
      status: 200,
      code: 'invalid_response',
      type: 'response_validation_error',
      requestId: 'req_malformed',
    } satisfies Partial<AnthropicApiError>);
    expect(String(error)).not.toContain('{malformed');
  });

  it('throws a safe typed error for failed text responses', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { type: 'authentication_error', message: SENSITIVE_SENTINEL },
    }), {
      status: 403,
      headers: { 'request-id': 'req_text_forbidden' },
    }));
    const fetchImpl = fetchMock as unknown as typeof fetch;

    const error = await captureError(() => callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      system: 'system',
      userMessage: 'prompt',
      signal: new AbortController().signal,
      fetchImpl,
    }));

    expect(error).toMatchObject({
      name: 'AnthropicApiError',
      status: 403,
      type: 'authentication_error',
      requestId: 'req_text_forbidden',
    } satisfies Partial<AnthropicApiError>);
    expect(String(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_SENTINEL);
  });
});
