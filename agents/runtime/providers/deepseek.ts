import type { ProviderResult } from '../types';

const BASE_URL = 'https://api.deepseek.com';

export async function invokeDeepSeekText(input: {
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro';
  system: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
}): Promise<ProviderResult<string>> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');
  const startedAt = Date.now();
  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: [
        { role: 'system', content: input.system },
        { role: 'user', content: input.prompt },
      ],
      max_tokens: input.maxTokens,
      thinking: { type: 'disabled' },
    }),
    signal: input.signal,
  });
  const data = await response.json() as {
    id?: string;
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
    error?: { message?: string };
  };
  const output = data.choices?.[0]?.message?.content;
  if (!response.ok || !output) throw new Error(data.error?.message ?? `DeepSeek request failed with ${response.status}`);
  return {
    output,
    providerGenerationId: data.id,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: data.usage?.prompt_cache_hit_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}
