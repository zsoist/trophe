import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { AiUsage, ProviderResult } from '../types';
import {
  assertPaidProviderAccess,
  PAID_PROVIDER_OFFLINE_CREDENTIAL,
} from '../provider-access';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_ATTEMPTS = 3;
const MAX_RETRY_DELAY_MS = 8_000;
const MAX_RETRY_AFTER_MS = 60_000;

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
  readonly usage?: AiUsage;
  readonly latencyMs?: number;
  readonly providerGenerationId?: string;

  constructor(input: {
    message: string;
    status: number;
    code?: string;
    type?: string;
    requestId?: string;
    usage?: AiUsage;
    latencyMs?: number;
    providerGenerationId?: string;
  }) {
    super(input.message);
    this.name = 'OpenAiApiError';
    this.status = input.status;
    this.code = input.code;
    this.type = input.type;
    this.requestId = input.requestId;
    this.usage = input.usage;
    this.latencyMs = input.latencyMs;
    this.providerGenerationId = input.providerGenerationId;
  }
}

function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(new Error('OpenAI retry aborted'));
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
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
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0 && retryAfterMs <= MAX_RETRY_AFTER_MS) {
      return Math.ceil(retryAfterMs);
    }

    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (Number.isFinite(seconds) && seconds > 0 && seconds * 1_000 <= MAX_RETRY_AFTER_MS) {
        return Math.ceil(seconds * 1_000);
      }

      const retryAt = Date.parse(retryAfter);
      const delayMs = retryAt - Date.now();
      if (Number.isFinite(retryAt) && delayMs > 0 && delayMs <= MAX_RETRY_AFTER_MS) return delayMs;
    }
  }

  const exponentialDelay = Math.min(500 * 2 ** attempt, MAX_RETRY_DELAY_MS);
  return Math.max(0, Math.floor(exponentialDelay * (1 - 0.25 * Math.random())));
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
  /** Defaults to SDK-compatible three total attempts. Set to 1 for measured probes. */
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  beforeTransportAttempt?: (endpoint: string) => unknown;
}): Promise<ProviderResult<T>> {
  const accessMode = assertPaidProviderAccess({
    provider: 'openai',
    transportWasInjected: input.fetchImpl != null,
  });
  const apiKey = accessMode === 'offline'
    ? PAID_PROVIDER_OFFLINE_CREDENTIAL
    : process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const fetchImpl = input.fetchImpl ?? fetch;

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
  const requestedAttempts = Number.isFinite(input.maxAttempts)
    ? Math.floor(input.maxAttempts as number)
    : MAX_ATTEMPTS;
  const maxAttempts = Math.min(MAX_ATTEMPTS, Math.max(1, requestedAttempts));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    input.beforeTransportAttempt?.(OPENAI_CHAT_COMPLETIONS_URL);
    try {
      response = await fetchImpl(OPENAI_CHAT_COMPLETIONS_URL, {
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body,
        signal: input.signal,
      });
    } catch (error) {
      if (input.signal.aborted || attempt === maxAttempts - 1) throw error;
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
    if (!shouldRetry(response) || attempt === maxAttempts - 1) throw apiError(response, data.error);
    await waitForRetry(retryDelayMs(response, attempt), input.signal);
  }
  if (!response) throw new Error('OpenAI request failed before receiving a response');
  if (!response.ok) throw apiError(response, data.error);

  const usage: AiUsage = {
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    cacheReadTokens: data.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: data.usage?.prompt_tokens_details?.cache_write_tokens ?? 0,
    reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens ?? 0,
  };
  const malformedResponse = (message: string) => new OpenAiApiError({
    message,
    status: response.status,
    code: 'invalid_structured_output',
    type: 'response_validation_error',
    requestId: response.headers.get('x-request-id') ?? undefined,
    usage,
    latencyMs: Date.now() - startedAt,
    providerGenerationId: data.id,
  });

  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (call) => call.function?.name === input.toolName,
  );
  const rawArguments = toolCall?.function?.arguments;
  if (!rawArguments) throw malformedResponse('OpenAI structured response missing tool call');
  if (choice?.finish_reason !== 'tool_calls') {
    throw malformedResponse(`OpenAI structured response ended with ${choice?.finish_reason ?? 'unknown reason'}`);
  }

  let parsedArguments: unknown;
  try {
    parsedArguments = JSON.parse(rawArguments);
  } catch {
    throw malformedResponse('OpenAI structured response arguments were not valid JSON');
  }

  let output: T;
  try {
    output = input.validator.parse(parsedArguments);
  } catch {
    throw malformedResponse('OpenAI structured response failed schema validation');
  }

  return {
    output,
    providerGenerationId: data.id,
    usage,
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
  };
}
