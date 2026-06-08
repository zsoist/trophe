import { afterEach, describe, expect, it, vi } from 'vitest';
import { deepSeekUserId, invokeDeepSeekText } from '@/agents/runtime/providers/deepseek';
import { estimateModelCostUsd } from '@/agents/router/pricing';
import { invokeTextProvider } from '@/agents/runtime/providers/text';

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DEEPSEEK_API_KEY;
});

describe('DeepSeek governed provider candidate', () => {
  it('uses V4 official pricing', () => {
    expect(estimateModelCostUsd('deepseek-v4-flash', 1_000_000, 1_000_000)).toBeCloseTo(0.42);
    expect(estimateModelCostUsd('deepseek-v4-pro', 1_000_000, 1_000_000)).toBeCloseTo(1.305);
  });

  it('isolates provider cache/safety identity without sending a raw user id', () => {
    expect(deepSeekUserId('user@example.com')).toMatch(/^trophe_[a-f0-9]{32}$/);
    expect(deepSeekUserId('user@example.com')).not.toContain('user@example.com');
  });

  it('maps official token usage and generation id', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'ds-1',
      choices: [{ message: { content: 'answer' } }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 40 },
    }), { status: 200 })));
    const result = await invokeDeepSeekText({
      model: 'deepseek-v4-flash', system: 'system', prompt: 'prompt', maxTokens: 100,
      signal: new AbortController().signal,
    });
    expect(result).toMatchObject({
      output: 'answer', providerGenerationId: 'ds-1',
      usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 40 },
    });
  });

  it('rejects empty content instead of silently accepting JSON-mode/provider failures', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '' } }],
    }), { status: 200 })));
    await expect(invokeDeepSeekText({
      model: 'deepseek-v4-flash', system: 'system', prompt: 'prompt', maxTokens: 100,
      signal: new AbortController().signal,
    })).rejects.toThrow('DeepSeek request failed');
  });

  it('is reachable through the governed text provider boundary', async () => {
    process.env.DEEPSEEK_API_KEY = 'test-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'candidate answer' } }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 })));
    const result = await invokeTextProvider({
      policy: {
        provider: 'deepseek', model: 'deepseek-v4-flash', costClass: 'cheap', latencyClass: 'fast',
        maxTokens: 100, timeoutMs: 1000, maxInputChars: 1000, maxCostUsd: 1, promptVersion: 'test',
      },
      system: 'system', prompt: 'prompt', signal: new AbortController().signal,
    });
    expect(result.output).toBe('candidate answer');
  });
});
