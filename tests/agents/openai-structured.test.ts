import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { invokeOpenAiStructured, OpenAiApiError } from '../../agents/runtime/providers/openai';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';

const validator = z.object({ value: z.string() });

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
  delete process.env.OPENAI_API_KEY;
  vi.stubGlobal('fetch', () => {
    throw new Error('unexpected global fetch');
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('invokeOpenAiStructured', () => {
  it('blocks before global fetch when no transport is injected', async () => {
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
    })).rejects.toMatchObject({
      name: 'PaidProviderAccessBlockedError',
      code: 'paid_provider_access_blocked',
      provider: 'openai',
    });
  });

  it('propagates injected fetch through the structured dispatcher', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
    }), { status: 200 }));

    await expect(invokeStructuredProvider({
      policy: {
        provider: 'openai', model: 'gpt-5.6-luna', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1_000, maxInputChars: 1_000, maxCostUsd: 1, promptVersion: 'test',
      },
      system: 'system',
      prompt: 'prompt',
      signal,
      schema: { type: 'object' },
      validator,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).resolves.toMatchObject({ output: { value: 'ok' } });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ signal });
  });

  it('sends a strict forced function call and validates its arguments', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_123',
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 8,
        prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 12 },
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(result.output).toEqual({ value: 'ok' });
    expect(result.providerGenerationId).toBe('resp_123');
    expect(result.usage).toMatchObject({
      inputTokens: 120,
      outputTokens: 8,
      cacheReadTokens: 80,
      cacheWriteTokens: 12,
      reasoningTokens: 0,
    });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'none',
      max_completion_tokens: 256,
      prompt_cache_options: { mode: 'explicit' },
      tool_choice: { type: 'function', function: { name: 'submit_result' } },
    });
    expect(request.messages).toEqual([
      {
        role: 'system',
        content: [{
          type: 'text',
          text: 'system',
          prompt_cache_breakpoint: { mode: 'explicit' },
        }],
      },
      { role: 'user', content: 'prompt' },
    ]);
    expect(request.tools[0].function.strict).toBe(true);
    expect(request.prompt_cache_key).toMatch(/^trophe-structured-[a-f0-9]{32}$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: {
        Authorization: 'Bearer trophe-offline-placeholder',
        'Content-Type': 'application/json',
      },
    });
  });

  it('uses one stable cache key for the same static prompt prefix', async () => {
    const success = () => new Response(JSON.stringify({
      choices: [{
        finish_reason: 'tool_calls',
        message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    const fetchMock = vi.fn().mockImplementation(success);
    const common = {
      model: 'gpt-5.6-luna',
      system: 'large stable system prompt',
      maxTokens: 256,
      signal: new AbortController().signal,
      toolName: 'submit_result',
      description: 'Submit result',
      schema: { type: 'object' },
      validator,
      fetchImpl: fetchMock as unknown as typeof fetch,
    };

    await invokeOpenAiStructured({ ...common, prompt: 'dynamic request one' });
    await invokeOpenAiStructured({ ...common, prompt: 'dynamic request two' });

    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    expect(first.prompt_cache_key).toBe(second.prompt_cache_key);
  });

  it('rejects missing tool output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_malformed',
      choices: [{ finish_reason: 'stop', message: {} }],
      usage: {
        prompt_tokens: 120,
        completion_tokens: 8,
        prompt_tokens_details: { cached_tokens: 80, cache_write_tokens: 12 },
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_malformed' },
    }));

    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna',
      system: 'system',
      prompt: 'prompt',
      maxTokens: 256,
      signal: new AbortController().signal,
      toolName: 'submit_result',
      description: 'Submit result',
      schema: { type: 'object' },
      validator,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(pending).rejects.toMatchObject({
      message: 'OpenAI structured response missing tool call',
      status: 200,
      code: 'invalid_structured_output',
      type: 'response_validation_error',
      requestId: 'req_malformed',
      providerGenerationId: 'resp_malformed',
      usage: {
        inputTokens: 120,
        outputTokens: 8,
        cacheReadTokens: 80,
        cacheWriteTokens: 12,
      },
    } satisfies Partial<OpenAiApiError>);
  });

  it('surfaces structured provider diagnostics without retrying permissions failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: 'You have insufficient permissions for this operation.',
        code: 'insufficient_permissions',
        type: 'invalid_request_error',
      },
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_luna_123' },
    }));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(pending).rejects.toMatchObject({
      name: 'OpenAiApiError',
      message: 'You have insufficient permissions for this operation.',
      status: 403,
      code: 'insufficient_permissions',
      type: 'invalid_request_error',
      requestId: 'req_luna_123',
    } satisfies Partial<OpenAiApiError>);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('retries a rate limit using Retry-After', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'rate limited' } }), {
        status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '0.001' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ finish_reason: 'tool_calls', message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] } }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries a non-JSON 5xx response instead of failing during response parsing', async () => {
    vi.useFakeTimers();
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
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it.each([408, 409])('retries retryable HTTP status %i', async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'retry me' } }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('retries a transient network failure', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{
          finish_reason: 'tool_calls',
          message: { tool_calls: [{ function: { name: 'submit_result', arguments: '{"value":"ok"}' } }] },
        }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toMatchObject({ output: { value: 'ok' } });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('caps retryable failures at three total attempts', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({
      error: { message: 'upstream unavailable', code: 'server_error' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const rejection = expect(pending).rejects.toMatchObject({ status: 503, code: 'server_error' });
    await vi.runAllTimersAsync();
    await rejection;
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('disables same-provider retries for controlled measurement probes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'upstream unavailable', code: 'server_error' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, maxAttempts: 1,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).rejects.toMatchObject({ status: 503, code: 'server_error' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('aborts during Retry-After backoff without issuing another request', async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'rate limited' },
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
    }));
    const pending = invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: controller.signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator, fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toThrow('retry aborted');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
