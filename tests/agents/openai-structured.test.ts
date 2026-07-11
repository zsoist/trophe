import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { invokeOpenAiStructured } from '../../agents/runtime/providers/openai';

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
      cacheKey: 'trophe:food-parse-v7-luna',
      clientRequestId: 'client-generation-123',
    });

    expect(result.output).toEqual({ value: 'ok' });
    expect(result.providerGenerationId).toBe('resp_123');
    expect(result).toMatchObject({
      providerRequestId: 'req_openai_123',
      clientRequestId: 'client-generation-123',
      usage: {
        inputTokens: 120,
        outputTokens: 8,
        cacheReadTokens: 32,
        cacheWriteTokens: 64,
        reasoningTokens: 0,
      },
    });
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      'X-Client-Request-Id': 'client-generation-123',
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'none',
      max_completion_tokens: 256,
      prompt_cache_key: 'trophe:food-parse-v7-luna',
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
      choices: [{ finish_reason: 'stop', message: {} }],
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
      clientRequestId: 'client-403',
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
        choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] } }],
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

  it('retries a non-JSON 5xx response instead of failing during response parsing', async () => {
    vi.useFakeTimers();
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('<html>upstream unavailable</html>', {
        status: 503,
        headers: { 'Content-Type': 'text/html' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
        }],
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

  it('aborts during Retry-After backoff without issuing another request', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key');
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'rate limited' },
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: controller.signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toThrow('retry aborted');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
