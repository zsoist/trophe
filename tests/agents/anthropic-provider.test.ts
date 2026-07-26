import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { callAnthropicMessages } from '@/agents/clients/anthropic';
import { AnthropicApiError, invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';
import { providerErrorTelemetry } from '@/agents/runtime/provider-error';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
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

  it.each([
    ['code', { code: SENSITIVE_SENTINEL, type: 'rate_limit_error' }, { 'request-id': 'req_safe_123' }],
    ['type', { code: 'rate_limited', type: SENSITIVE_SENTINEL }, { 'request-id': 'req_safe_123' }],
    ['generation id', { code: 'rate_limited', type: 'rate_limit_error' }, { 'request-id': 'req_safe_123' }, SENSITIVE_SENTINEL],
    ['request-id', { code: 'rate_limited', type: 'rate_limit_error' }, { 'request-id': SENSITIVE_SENTINEL }],
    ['x-request-id', { code: 'rate_limited', type: 'rate_limit_error' }, { 'x-request-id': SENSITIVE_SENTINEL }],
  ] as const)('omits an untrusted Anthropic %s from errors and telemetry', async (_field, providerError, headers, id: string = 'msg_safe_123') => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id,
      error: providerError,
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 429, headers }));

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001' },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));
    const telemetry = providerErrorTelemetry(error);

    expect(error).toBeInstanceOf(AnthropicApiError);
    expect(String(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(JSON.stringify(telemetry)).not.toContain(SENSITIVE_SENTINEL);
    expect(telemetry.metadata?.providerError).not.toEqual(expect.objectContaining({
      code: SENSITIVE_SENTINEL,
      type: SENSITIVE_SENTINEL,
      requestId: SENSITIVE_SENTINEL,
    }));
    expect(telemetry.providerGenerationId).not.toBe(SENSITIVE_SENTINEL);
  });

  it('requires complete integer usage while preserving valid zero and absent optional cache counts', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_zero_123',
      content: [{ type: 'text', text: 'zero-token response' }],
      usage: { input_tokens: 0, output_tokens: 0 },
    }), { status: 200 }));

    const result = await callAnthropicMessages({
      model: 'claude-haiku-4-5-20251001',
      system: 'system',
      userMessage: 'prompt',
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    expect(result.usage).not.toHaveProperty('cache_creation_input_tokens');
    expect(result.usage).not.toHaveProperty('cache_read_input_tokens');
  });

  it.each([
    undefined,
    { output_tokens: 1 },
    { input_tokens: '1', output_tokens: 1 },
    { input_tokens: -1, output_tokens: 1 },
    { input_tokens: 1.5, output_tokens: 1 },
    { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: -1 },
    { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0.5 },
  ])('rejects malformed successful usage %j instead of fabricating zero cost', async (usage) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_invalid_usage',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      ...(usage === undefined ? {} : { usage }),
    }), { status: 200 }));

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001' },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));

    expect(error).toMatchObject({
      name: 'AnthropicApiError',
      status: 200,
      code: 'invalid_response',
      type: 'response_validation_error',
    } satisfies Partial<AnthropicApiError>);
  });

  it.each([
    ['empty body', ''],
    ['whitespace body', ' \n\t '],
    ['empty content', JSON.stringify({ id: 'msg_empty_123', content: [], usage: { input_tokens: 1, output_tokens: 1 } })],
  ])('normalizes a %s as the fixed malformed response error', async (_name, body) => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001' },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));

    expect(error).toMatchObject({
      name: 'AnthropicApiError',
      status: 200,
      code: 'invalid_response',
      type: 'response_validation_error',
    } satisfies Partial<AnthropicApiError>);
  });

  it('rejects an oversized Content-Length before buffering the provider body', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 200,
      headers: { 'content-length': '1000000000' },
    }));

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001', max_tokens: 1 },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));

    expect(error).toMatchObject({ code: 'invalid_response', type: 'response_validation_error' });
  });

  it('uses the fixed malformed category when an error response exceeds the body cap', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', {
      status: 503,
      headers: { 'content-length': '1000000000' },
    }));

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001', max_tokens: 1 },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));

    expect(error).toMatchObject({ code: 'invalid_response', type: 'response_validation_error' });
  });

  it('cancels an oversized streamed body before buffering it', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(2_000_000));
      },
      cancel() {
        cancelled = true;
      },
    }), { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);

    const error = await captureError(() => invokeAnthropicJson({
      body: { model: 'claude-haiku-4-5-20251001', max_tokens: 1 },
      signal: new AbortController().signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    }));

    expect(error).toMatchObject({ code: 'invalid_response', type: 'response_validation_error' });
    expect(cancelled).toBe(true);
  });

  it('forwards the exact signal through the structured Anthropic boundary to injected fetch', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_structured_123',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      usage: { input_tokens: 0, output_tokens: 0 },
    }), { status: 200 }));

    await expect(invokeStructuredProvider({
      policy: {
        provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
      },
      system: 'system', prompt: 'prompt', signal,
      schema: { type: 'object' }, validator: z.object({ value: z.string() }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).resolves.toMatchObject({ output: { value: 'ok' } });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal });
  });

  it('sends strict Anthropic tools with a cacheable system block when policy caching is enabled', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const schema = {
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
      additionalProperties: false,
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_cached_strict_123',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200 }));

    await invokeStructuredProvider({
      policy: {
        provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
        cacheSystem: true,
      },
      system: 'system',
      prompt: 'prompt',
      signal: new AbortController().signal,
      schema,
      validator: z.object({ value: z.string() }),
      strict: true,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      system: [{
        type: 'text',
        text: 'system',
        cache_control: { type: 'ephemeral' },
      }],
      tools: [{
        name: 'submit_result',
        input_schema: schema,
        strict: true,
      }],
    });
  });

  it('omits the Anthropic strict field when structured strict mode is disabled', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_non_strict_123',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200 }));

    await invokeStructuredProvider({
      policy: {
        provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
        cacheSystem: true,
      },
      system: 'system',
      prompt: 'prompt',
      signal: new AbortController().signal,
      schema: { type: 'object' },
      validator: z.object({ value: z.string() }),
      strict: false,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.tools[0]).not.toHaveProperty('strict');
  });

  it('keeps the uncached Anthropic system prompt as a plain string', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_uncached_123',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      usage: { input_tokens: 1, output_tokens: 1 },
    }), { status: 200 }));

    await invokeStructuredProvider({
      policy: {
        provider: 'anthropic', model: 'claude-haiku-4-5-20251001', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
        cacheSystem: false,
      },
      system: 'system',
      prompt: 'prompt',
      signal: new AbortController().signal,
      schema: { type: 'object' },
      validator: z.object({ value: z.string() }),
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.system).toBe('system');
  });

  it('forwards the exact signal through the shared direct adapter used by photo analysis', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    blockGlobalFetch();
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_photo_123',
      content: [{ type: 'tool_use', name: 'submit_food_photo_analysis', input: { foods: [] } }],
      usage: { input_tokens: 0, output_tokens: 0 },
    }), { status: 200 }));

    await expect(invokeAnthropicJson({
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64' } }] }],
        tools: [{ name: 'submit_food_photo_analysis' }],
      },
      signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).resolves.toMatchObject({ providerGenerationId: 'msg_photo_123' });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal });
  });
});
