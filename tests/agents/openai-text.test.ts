import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invokeOpenAiText } from '@/agents/runtime/providers/openai';
import { invokeTextProvider } from '@/agents/runtime/providers/text';

describe('Luna text adapter', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL_ENV', undefined);
    vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
    vi.stubEnv('OPENAI_API_KEY', 'test-only-key');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('maps the Responses text output and usage without an Anthropic request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 'resp_text', model: 'gpt-5.6-luna', status: 'completed',
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Grounded insight.' }] }],
      usage: { input_tokens: 12, output_tokens: 7, output_tokens_details: { reasoning_tokens: 1 } },
    }), { status: 200, headers: { 'x-request-id': 'req_text' } }));
    const result = await invokeTextProvider({
      policy: { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'low', costClass: 'cheap', latencyClass: 'fast', maxTokens: 100, timeoutMs: 1000, maxInputChars: 1000, maxCostUsd: 1, promptVersion: 'test' },
      system: 'grounding rules', prompt: 'summarize', signal: new AbortController().signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(result.output).toBe('Grounded insight.');
    expect(result.responseModel).toBe('gpt-5.6-luna');
    expect(result.requestId).toBe('req_text');
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body as string);
    expect(body.input).toEqual([
      { role: 'developer', content: [{ type: 'input_text', text: 'grounding rules' }] },
      { role: 'user', content: [{ type: 'input_text', text: 'summarize' }] },
    ]);
    expect(body.reasoning).toEqual({ effort: 'low' });
  });

  it('rejects an unsupported non-Luna OpenAI text model before transport', async () => {
    const fetchImpl = vi.fn();
    await expect(invokeOpenAiText({ model: 'gpt-4o', system: 'rules', prompt: 'text', maxTokens: 10, signal: new AbortController().signal, fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toThrow('text_not_supported');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
