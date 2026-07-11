import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeTextProvider } from '@/agents/runtime/providers/text';

const policy = {
  provider: 'anthropic' as const,
  model: 'claude-haiku-4-5-20251001',
  costClass: 'cheap' as const,
  latencyClass: 'fast' as const,
  cacheSystem: true,
  maxTokens: 256,
  timeoutMs: 1_000,
  maxInputChars: 1_000,
  maxCostUsd: 0.02,
  promptVersion: 'coach-insight-v2-haiku-compliance',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Anthropic text provider correlation', () => {
  it('retains request IDs and cache usage on coach-facing text calls', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'msg_text_123',
      content: [{ type: 'text', text: 'Grounded answer' }],
      usage: {
        input_tokens: 120,
        output_tokens: 15,
        cache_creation_input_tokens: 80,
        cache_read_input_tokens: 40,
      },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'request-id': 'req_text_123' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeTextProvider({
      policy,
      system: 'stable system',
      prompt: 'variable question',
      signal: new AbortController().signal,
    });

    expect(result).toMatchObject({
      output: 'Grounded answer',
      providerGenerationId: 'msg_text_123',
      providerRequestId: 'req_text_123',
      usage: { inputTokens: 120, cacheWriteTokens: 80, cacheReadTokens: 40 },
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request.system).toEqual([{
      type: 'text',
      text: 'stable system',
      cache_control: { type: 'ephemeral' },
    }]);
  });

  it('retains safe billing-failure evidence', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'secret-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      type: 'error',
      error: { type: 'billing_error', message: 'credit balance is too low' },
    }), {
      status: 402,
      headers: { 'content-type': 'application/json', 'request-id': 'req_text_denied' },
    })));

    await expect(invokeTextProvider({
      policy,
      system: 'stable system',
      prompt: 'variable question',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      name: 'AiProviderError',
      provider: 'anthropic',
      status: 402,
      errorType: 'billing_error',
      providerRequestId: 'req_text_denied',
    });
  });
});
