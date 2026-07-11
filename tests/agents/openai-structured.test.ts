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
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 0 },
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
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
    });

    expect(result.output).toEqual({ value: 'ok' });
    expect(result.providerGenerationId).toBe('resp_123');
    expect(result.usage).toMatchObject({ inputTokens: 120, outputTokens: 8, cacheReadTokens: 0, reasoningTokens: 0 });
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(request).toMatchObject({
      model: 'gpt-5.6-luna',
      reasoning_effort: 'none',
      max_completion_tokens: 256,
      tool_choice: { type: 'function', function: { name: 'submit_result' } },
    });
    expect(request.tools[0].function.strict).toBe(true);
    expect(request).not.toHaveProperty('prompt_cache_key');
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
      error: { message: 'invalid model' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })));

    await expect(invokeOpenAiStructured({
      model: 'gpt-5.6-luna', system: 'system', prompt: 'prompt', maxTokens: 256,
      signal: new AbortController().signal, toolName: 'submit_result', description: 'Submit result',
      schema: { type: 'object' }, validator,
    })).rejects.toThrow('invalid model');
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
});
