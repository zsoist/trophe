import { afterEach, describe, expect, it, vi } from 'vitest';
import { inspect } from 'node:util';
import { z } from 'zod';
import { invokeOpenAiStructured } from '../../agents/runtime/providers/openai';
import { providerErrorMetadata } from '@/agents/runtime/providers/errors';

const validator = z.object({ value: z.string() });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('invokeOpenAiStructured', () => {
  it('sends a strict forced function call and validates its arguments', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_123',
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 8,
        prompt_tokens_details: { cached_tokens: 32, cache_write_tokens: 64 },
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_openai_123' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await invokeOpenAiStructured({
      model: 'gpt-5.6-luna',
      system: 'system',
      prompt: 'prompt',
      maxTokens: 256,
      signal: new AbortController().signal,
      toolName: 'submit_result',
      description: 'Submit result',
      schema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'], additionalProperties: false },
      validator,
      strict: true,
      cacheKey: 'trophe:food-parse-v7-luna:submit_result',
      clientRequestId: 'client-generation-123',
    });

    expect(result.output).toEqual({ value: 'ok' });
    expect(result.providerGenerationId).toBe('resp_123');
    expect(result).toMatchObject({
      providerRequestId: 'req_openai_123',
      clientRequestId: 'client-generation-123-attempt-1',
      usage: {
        inputTokens: 120,
        outputTokens: 8,
        cacheReadTokens: 32,
        cacheWriteTokens: 64,
        reasoningTokens: 0,
      },
    });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-Client-Request-Id': 'client-generation-123-attempt-1',
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'none',
      max_completion_tokens: 256,
      prompt_cache_key: 'trophe:food-parse-v7-luna:submit_result',
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
      tool_choice: { type: 'function', function: { name: 'submit_result' } },
    });
    expect(request.messages[0]).toEqual({
      role: 'system',
      content: [{
        type: 'text',
        text: 'system',
        prompt_cache_breakpoint: { mode: 'explicit' },
      }],
    });
    expect(request.tools[0].function.strict).toBe(true);
  });

  it('rejects missing tool output', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_missing_tool',
      choices: [{ finish_reason: 'stop', message: {} }],
      usage: { prompt_tokens: 5, completion_tokens: 1 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna',
      system: 'system',
      prompt: 'prompt',
      maxTokens: 256,
      signal: new AbortController().signal,
      toolName: 'submit_result',
      description: 'Submit result',
      schema: { type: 'object' },
      validator,
    })).rejects.toThrow('missing tool call');
  });

  it('surfaces provider errors without leaking the API key', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'secret-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'invalid model', type: 'invalid_request_error', code: 'model_not_found' },
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_denied_123' },
    })));

    const rejection = expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, cacheKey: 'trophe:test', clientRequestId: 'client-403',
    })).rejects;
    await rejection.toThrow('invalid model');
    await rejection.toMatchObject({
      name: 'AiProviderError',
      provider: 'openai',
      status: 403,
      errorType: 'invalid_request_error',
      errorCode: 'model_not_found',
      providerRequestId: 'req_denied_123',
      clientRequestId: 'client-403-attempt-1',
    });
  });

  it('retries a rate limit using Retry-After', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0.001' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp_retry',
        choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] } }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-retry-id',
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([, init]) => (init?.headers as Record<string, string>)['X-Client-Request-Id']))
      .toEqual(['logical-retry-id-attempt-1', 'logical-retry-id-attempt-2']);
    await expect(pending).resolves.toMatchObject({ clientRequestId: 'logical-retry-id-attempt-2' });
    vi.useRealTimers();
  });

  it('retries a non-JSON 5xx response instead of failing during response parsing', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<html>upstream unavailable</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'resp_retry_non_json',
        choices: [{
          finish_reason: 'tool_calls',
          message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
        }],
        usage: { prompt_tokens: 5, completion_tokens: 2 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('classifies a terminal non-JSON response and retains both request IDs', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>denied</html>', {
      status: 403,
      headers: { 'content-type': 'text/html', 'x-request-id': 'req_non_json' },
    })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-non-json',
    })).rejects.toMatchObject({
      name: 'AiProviderError',
      status: 403,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
      providerRequestId: 'req_non_json',
      clientRequestId: 'logical-non-json-attempt-1',
    });
  });

  it('classifies a JSON null root as an invalid provider response', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('null', {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_null' },
    })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-null',
    })).rejects.toMatchObject({
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
      providerRequestId: 'req_null',
      clientRequestId: 'logical-null-attempt-1',
    });
  });

  it('retains the per-attempt client ID when fetch fails before a response', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-network',
    })).rejects.toMatchObject({
      name: 'AiProviderError',
      errorType: 'network_error',
      clientRequestId: 'logical-network-attempt-1',
    });
  });

  it('retains both request IDs when the response body cannot be read', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const response = {
      status: 200,
      headers: new Headers({ 'x-request-id': 'req_unreadable' }),
      text: vi.fn().mockRejectedValue(new Error('stream reset')),
    } as unknown as Response;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-read',
    })).rejects.toMatchObject({
      status: 200,
      errorType: 'provider_protocol_error',
      errorCode: 'response_read_failed',
      providerRequestId: 'req_unreadable',
      clientRequestId: 'logical-read-attempt-1',
    });
  });

  it('aborts during Retry-After backoff without issuing another request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'rate limited' },
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60', 'x-request-id': 'req_rate_limited' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: controller.signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-abort',
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toMatchObject({
      name: 'AiProviderError',
      status: 429,
      errorType: 'request_aborted',
      errorCode: 'aborted',
      providerRequestId: 'req_rate_limited',
      clientRequestId: 'logical-abort-attempt-1',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('rejects a tool payload without generation and usage evidence', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }), { status: 200, headers: { 'x-request-id': 'req_missing_evidence' } })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, clientRequestId: 'logical-evidence',
    })).rejects.toMatchObject({
      errorType: 'provider_protocol_error',
      errorCode: 'missing_generation_id',
      providerRequestId: 'req_missing_evidence',
      clientRequestId: 'logical-evidence-attempt-1',
      usage: { inputTokens: 5, outputTokens: 2 },
    });
  });

  it('rejects malformed optional usage counters', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_bad_usage',
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
      usage: {
        prompt_tokens: 5,
        completion_tokens: 2,
        prompt_tokens_details: { cached_tokens: 'bad' },
      },
    }), { status: 200, headers: { 'x-request-id': 'req_bad_usage' } })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator,
    })).rejects.toMatchObject({ errorCode: 'invalid_usage_evidence' });
  });

  it('does not retain user-derived tool text in error causes or metadata', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const sentinel = 'my insulin snack';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_private',
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: `{"value":"${sentinel}` } }] },
      }],
      usage: { prompt_tokens: 5, completion_tokens: 2 },
    }), { status: 200, headers: { 'x-request-id': 'req_private' } })));

    let thrown: unknown;
    try {
      await invokeOpenAiStructured({
        model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
        signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
        schema: { type: 'object' }, validator,
      });
    } catch (error) {
      thrown = error;
    }

    expect(inspect(thrown)).not.toContain(sentinel);
    expect(JSON.stringify(providerErrorMetadata(thrown))).not.toContain(sentinel);
  });
});
