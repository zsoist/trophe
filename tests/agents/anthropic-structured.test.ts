import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';

const validator = z.object({ value: z.string() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Anthropic structured provider hardening', () => {
  it('caches the stable system block and retains provider correlation', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_123',
      content: [{ type: 'tool_use', name: 'submit_result', input: { value: 'ok' } }],
      usage: {
        input_tokens: 120,
        output_tokens: 8,
        cache_creation_input_tokens: 80,
        cache_read_input_tokens: 40,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'request-id': 'req_anthropic_123' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeStructuredProvider({
      policy: {
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        costClass: 'cheap',
        latencyClass: 'fast',
        cacheSystem: true,
        maxTokens: 256,
        timeoutMs: 1_000,
        maxInputChars: 1_000,
        maxCostUsd: 0.02,
        promptVersion: 'food-parse-v7-haiku-fallback',
      },
      system: 'stable system',
      prompt: 'variable prompt',
      signal: new AbortController().signal,
      schema: {
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
      },
      validator,
      clientRequestId: 'client-generation-456',
    });

    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.system).toEqual([{
      type: 'text',
      text: 'stable system',
      cache_control: { type: 'ephemeral' },
    }]);
    expect(result).toMatchObject({
      output: { value: 'ok' },
      providerGenerationId: 'msg_123',
      providerRequestId: 'req_anthropic_123',
      clientRequestId: 'client-generation-456',
      usage: { cacheWriteTokens: 80, cacheReadTokens: 40 },
    });
  });

  it('retains typed billing failures without leaking the API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'secret-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'error',
      error: { type: 'billing_error', message: 'credit balance is too low' },
      request_id: 'req_body_456',
    }), {
      status: 402,
      headers: { 'Content-Type': 'application/json', 'request-id': 'req_header_456' },
    })));

    const rejection = expect(invokeAnthropicJson({
      signal: new AbortController().signal,
      body: { model: 'claude-haiku-4-5-20251001' },
      clientRequestId: 'client-402',
    })).rejects;

    await rejection.toThrow('credit balance is too low');
    await rejection.toMatchObject({
      name: 'AiProviderError',
      provider: 'anthropic',
      status: 402,
      errorType: 'billing_error',
      providerRequestId: 'req_header_456',
      clientRequestId: 'client-402',
    });
  });
});
