import type { ProviderResult } from '../types';
import { createHash } from 'node:crypto';
import type { z } from 'zod';

const BASE_URL = 'https://api.deepseek.com';

export function deepSeekUserId(value?: string): string | undefined {
  if (!value) return undefined;
  return `trophe_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

async function requestDeepSeek(body: Record<string, unknown>, signal: AbortSignal, beta = false) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch(`${BASE_URL}${beta ? '/beta' : ''}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json() as {
      id?: string;
      choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number };
      error?: { message?: string };
    };
    if (response.ok) return { response, data };
    if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 2) {
      throw new Error(data.error?.message ?? `DeepSeek request failed with ${response.status}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw new Error('DeepSeek request failed');
}

export async function invokeDeepSeekText(input: {
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro';
  system: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
  userId?: string;
}): Promise<ProviderResult<string>> {
  const startedAt = Date.now();
  const { response, data } = await requestDeepSeek({
    model: input.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: input.maxTokens,
    thinking: { type: 'disabled' },
    user_id: deepSeekUserId(input.userId),
  }, input.signal);
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error(`DeepSeek request failed with ${response.status}`);
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

export async function invokeDeepSeekStructured<T>(input: {
  model: 'deepseek-v4-flash' | 'deepseek-v4-pro';
  system: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
  userId?: string;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
}): Promise<ProviderResult<T>> {
  const startedAt = Date.now();
  const { response, data } = await requestDeepSeek({
    model: input.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: input.maxTokens,
    thinking: { type: 'disabled' },
    user_id: deepSeekUserId(input.userId),
    tools: [{
      type: 'function',
      function: { name: input.toolName, description: input.description, parameters: input.schema },
    }],
    tool_choice: { type: 'function', function: { name: input.toolName } },
  }, input.signal);
  const rawArguments = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!rawArguments) throw new Error('DeepSeek structured response missing tool call');
  return {
    output: input.validator.parse(JSON.parse(rawArguments)),
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
