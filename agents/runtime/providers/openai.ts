import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { ProviderResult } from '../types';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_RETRY_DELAY_MS = 5_000;
const MAX_ATTEMPTS = 3;

type OpenAiErrorBody = {
  message?: string;
  code?: string;
  type?: string;
};

export class OpenAiApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: string;
  readonly requestId?: string;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    type?: string;
    requestId?: string;
  }) {
    super(input.message);
    this.name = 'OpenAiApiError';
    this.status = input.status;
    this.code = input.code;
    this.type = input.type;
    this.requestId = input.requestId;
  }
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('OpenAI retry aborted'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, Math.min(delayMs, MAX_RETRY_DELAY_MS));
    const onAbort = () => {
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      reject(new Error('OpenAI retry aborted'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function promptCacheKey(input: {
  model: string;
  system: string;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  strict?: boolean;
}): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([
      input.model,
      input.system,
      input.toolName,
      input.description,
      input.schema,
      Boolean(input.strict),
    ]))
    .digest('hex')
    .slice(0, 32);
  return `trophe-structured-${digest}`;
}

function shouldRetry(response: Response): boolean {
  // Authentication and entitlement failures are not transient. Retrying them
  // only obscures the root cause and can duplicate paid work upstream.
  if (response.status === 401 || response.status === 403) return false;

  const explicit = response.headers.get('x-should-retry');
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;

  return response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
}

function retryDelayMs(response: Response | undefined, attempt: number): number {
  if (response) {
    const retryAfterMs = Number(response.headers.get('retry-after-ms'));
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) return Math.ceil(retryAfterMs);

    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0) return Math.ceil(seconds * 1_000);

      const retryAt = Date.parse(retryAfter);
      if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
    }
  }

  return 500 * 2 ** attempt;
}

function apiError(response: Response, error: OpenAiErrorBody | undefined): OpenAiApiError {
  return new OpenAiApiError({
    message: error?.message ?? `OpenAI request failed with ${response.status}`,
    status: response.status,
    code: error?.code,
    type: error?.type,
    requestId: response.headers.get('x-request-id') ?? undefined,
  });
}

export async function invokeOpenAiStructured<T>(input: {
  model: string;
  system: string;
  prompt: string;
  maxTokens: number;
  signal: AbortSignal;
  toolName: string;
  description: string;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
  strict?: boolean;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const startedAt = Date.now();
  const supportsExplicitPromptCache = /^gpt-5\.6(?:-|$)/.test(input.model);
  const body = JSON.stringify({
    model: input.model,
    messages: [
      supportsExplicitPromptCache
        ? {
            role: 'system',
            content: [{
              type: 'text',
              text: input.system,
              prompt_cache_breakpoint: { mode: 'explicit' },
            }],
          }
        : { role: 'system', content: input.system },
      { role: 'user', content: input.prompt },
    ],
    max_completion_tokens: input.maxTokens,
    reasoning_effort: 'none',
    ...(supportsExplicitPromptCache ? {
      prompt_cache_key: promptCacheKey(input),
      prompt_cache_options: { mode: 'explicit' },
    } : {}),
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
  });
  type OpenAiResponse = {
    id?: string;
    choices?: Array<{
      finish_reason?: string;
      message?: { tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> };
    }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
      completion_tokens_details?: { reasoning_tokens?: number };
    };
    error?: OpenAiErrorBody;
  };
  let response: Response | undefined;
  let data: OpenAiResponse = {};
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted || attempt === MAX_ATTEMPTS - 1) throw error;
      await waitForRetry(retryDelayMs(undefined, attempt), input.signal);
      continue;
    }

    const responseText = await response.text();
    try {
      data = responseText ? JSON.parse(responseText) as OpenAiResponse : {};
    } catch {
      data = { error: { message: `OpenAI returned a non-JSON response (${response.status})` } };
    }
    if (response.ok) break;
    if (!shouldRetry(response) || attempt === MAX_ATTEMPTS - 1) throw apiError(response, data.error);
    await waitForRetry(retryDelayMs(response, attempt), input.signal);
  }
  if (!response) throw new Error('OpenAI request failed before receiving a response');
  if (!response.ok) throw apiError(response, data.error);

  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (call) => call.function?.name === input.toolName,
  );
  const rawArguments = toolCall?.function?.arguments;
  if (!rawArguments) throw new Error('OpenAI structured response missing tool call');
  if (choice?.finish_reason !== 'tool_calls') {
    throw new Error(`OpenAI structured response ended with ${choice?.finish_reason ?? 'unknown reason'}`);
  }

  return {
    output: input.validator.parse(JSON.parse(rawArguments)),
    providerGenerationId: data.id,
    usage: {
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens: data.usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
    },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}
