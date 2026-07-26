import type { ProviderResult } from '../types';
import { createHash } from 'node:crypto';
import type { z } from 'zod';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '../provider-access';

const BASE_URL = 'https://api.deepseek.com';

export function deepSeekUserId(value?: string): string | undefined {
  if (!value) return undefined;
  return `trophe_${createHash('sha256').update(value).digest('hex').slice(0, 32)}`;
}

async function requestDeepSeek(
  body: Record<string, unknown>,
  signal: AbortSignal,
  beta = false,
  fetchImpl?: typeof fetch,
) {
  const accessMode = assertPaidProviderAccess({
    provider: 'deepseek',
    transportWasInjected: fetchImpl != null,
  });
  const apiKey = accessMode === 'offline'
    ? PAID_PROVIDER_OFFLINE_CREDENTIAL
    : process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY not configured');
  const transport = fetchImpl ?? fetch;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await transport(`${BASE_URL}${beta ? '/beta' : ''}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
    const data = await response.json() as {
      id?: string;
      choices?: Array<{
        finish_reason?: string;
        message?: { content?: string; tool_calls?: Array<{ function?: { arguments?: string } }> };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
      };
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
  fetchImpl?: typeof fetch;
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
  }, input.signal, false, input.fetchImpl);
  const output = data.choices?.[0]?.message?.content;
  if (!output) throw new Error(`DeepSeek request failed with ${response.status}`);
  const finishReason = data.choices?.[0]?.finish_reason;
  if (finishReason && !['stop', 'tool_calls'].includes(finishReason)) {
    throw new Error(`DeepSeek incomplete response (${finishReason})`);
  }
  const cacheHitTokens = data.usage?.prompt_cache_hit_tokens ?? 0;
  const totalPromptTokens = data.usage?.prompt_tokens ?? 0;
  if (cacheHitTokens > 0) {
    const hitRate = totalPromptTokens > 0 ? Math.round((cacheHitTokens / totalPromptTokens) * 100) : 0;
    console.info(`[deepseek] Cache hit: ${cacheHitTokens}/${totalPromptTokens} tokens (${hitRate}%) — text call`);
  }
  return {
    output,
    providerGenerationId: data.id,
    usage: {
      inputTokens: totalPromptTokens,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: cacheHitTokens,
    },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}

/**
 * Parse tool-call arguments defensively. DeepSeek occasionally emits a valid
 * JSON object followed by trailing garbage (duplicated fragment, stray text),
 * which makes JSON.parse throw "Unexpected non-whitespace character after JSON".
 * Recover by extracting the first balanced top-level object.
 */
function parseToolArguments(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    if (start === -1) throw new Error('DeepSeek tool arguments contain no JSON object');
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { if (inString) escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return JSON.parse(raw.slice(start, i + 1));
      }
    }
    throw new Error('DeepSeek tool arguments JSON never balances');
  }
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
  strict?: boolean;
  fetchImpl?: typeof fetch;
}): Promise<ProviderResult<T>> {
  const startedAt = Date.now();
  const { response, data } = await requestDeepSeek({
    model: input.model,
    messages: [
      { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    max_tokens: input.maxTokens,
    temperature: 0,          // deterministic for factual extraction
    thinking: { type: 'disabled' },
    user_id: deepSeekUserId(input.userId),
    tools: [{
      type: 'function',
      function: {
        name: input.toolName,
        description: input.description,
        parameters: input.schema,
        ...(input.strict ? { strict: true } : {}),
      },
    }],
    tool_choice: { type: 'function', function: { name: input.toolName } },
  }, input.signal, input.strict, input.fetchImpl);
  const rawArguments = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!rawArguments) throw new Error('DeepSeek structured response missing tool call');
  if (data.choices?.[0]?.finish_reason !== 'tool_calls') {
    throw new Error(`DeepSeek structured response ended with ${data.choices?.[0]?.finish_reason ?? 'unknown reason'}`);
  }
  const structCacheHitTokens = data.usage?.prompt_cache_hit_tokens ?? 0;
  const structTotalPromptTokens = data.usage?.prompt_tokens ?? 0;
  if (structCacheHitTokens > 0) {
    const hitRate = structTotalPromptTokens > 0 ? Math.round((structCacheHitTokens / structTotalPromptTokens) * 100) : 0;
    console.info(`[deepseek] Cache hit: ${structCacheHitTokens}/${structTotalPromptTokens} tokens (${hitRate}%) — structured call (${input.toolName})`);
  }
  return {
    output: input.validator.parse(parseToolArguments(rawArguments)),
    providerGenerationId: data.id,
    usage: {
      inputTokens: structTotalPromptTokens,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: structCacheHitTokens,
    },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}
