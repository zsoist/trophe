import type { ProviderResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function invokeAnthropicJson<T>(input: {
  body: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const startedAt = Date.now();
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(input.body),
    signal: input.signal,
  });
  const latencyMs = Date.now() - startedAt;
  const data = await response.json() as T & {
    id?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message ?? `Anthropic request failed with ${response.status}`);
  }

  return {
    output: data,
    usage: {
      inputTokens: data.usage?.input_tokens ?? 0,
      outputTokens: data.usage?.output_tokens ?? 0,
      cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
      cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
    },
    latencyMs,
    rawStatus: response.status,
    providerGenerationId: data.id,
  };
}
