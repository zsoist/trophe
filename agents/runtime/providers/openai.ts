import type { z } from 'zod';
import type { ProviderResult } from '../types';
import { AiProviderError } from './errors';

const OPENAI_CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';
const MAX_RETRY_DELAY_MS = 5_000;

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
  /** Stable policy/prompt identity. Never include user or prompt content. */
  cacheKey?: string;
  /** App-generated correlation ID sent as X-Client-Request-Id. */
  clientRequestId?: string;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const startedAt = Date.now();
  const body = JSON.stringify({
    model: input.model,
    messages: [
      {
        role: 'system',
        content: [{
          type: 'text',
          text: input.system,
          ...(input.cacheKey
            ? { prompt_cache_breakpoint: { mode: 'explicit' } }
            : {}),
        }],
      },
      { role: 'user', content: input.prompt },
    ],
    ...(input.cacheKey ? {
      prompt_cache_key: input.cacheKey,
      prompt_cache_options: { mode: 'explicit', ttl: '30m' },
    } : {}),
    max_completion_tokens: input.maxTokens,
    reasoning_effort: 'none',
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
    error?: { message?: string; type?: string; code?: string };
  };
  let response: Response | undefined;
  let data: OpenAiResponse = {};
  for (let attempt = 0; attempt < 5; attempt++) {
    response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(input.clientRequestId ? { 'X-Client-Request-Id': input.clientRequestId } : {}),
      },
      body,
      signal: input.signal,
    });
    const responseText = await response.text();
    try {
      data = responseText ? JSON.parse(responseText) as OpenAiResponse : {};
    } catch {
      data = { error: { message: `OpenAI returned a non-JSON response (${response.status})` } };
    }
    if (response.ok) break;
    const retryable = response.status === 429 || [500, 502, 503, 504].includes(response.status);
    if (!retryable || attempt === 4) {
      throw new AiProviderError({
        provider: 'openai',
        message: data.error?.message ?? `OpenAI request failed with ${response.status}`,
        status: response.status,
        errorType: data.error?.type,
        errorCode: data.error?.code,
        providerRequestId: response.headers.get('x-request-id') ?? undefined,
        clientRequestId: input.clientRequestId,
      });
    }
    const retryAfterSeconds = Number(response.headers.get('retry-after'));
    const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.ceil(retryAfterSeconds * 1_000)
      : 500 * 2 ** attempt;
    await waitForRetry(waitMs, input.signal);
  }
  if (!response) {
    throw new AiProviderError({
      provider: 'openai',
      message: 'OpenAI request failed before receiving a response',
      clientRequestId: input.clientRequestId,
    });
  }
  if (!response.ok) {
    throw new AiProviderError({
      provider: 'openai',
      message: data.error?.message ?? `OpenAI request failed with ${response.status}`,
      status: response.status,
      errorType: data.error?.type,
      errorCode: data.error?.code,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      clientRequestId: input.clientRequestId,
    });
  }

  const providerRequestId = response.headers.get('x-request-id') ?? undefined;
  const protocolError = (message: string, errorCode: string, cause?: unknown) => new AiProviderError({
    provider: 'openai',
    message,
    status: response.status,
    errorType: 'provider_protocol_error',
    errorCode,
    providerRequestId,
    clientRequestId: input.clientRequestId,
    cause,
  });

  const choice = data.choices?.[0];
  const toolCall = choice?.message?.tool_calls?.find(
    (call) => call.function?.name === input.toolName,
  );
  const rawArguments = toolCall?.function?.arguments;
  if (!rawArguments) throw protocolError('OpenAI structured response missing tool call', 'missing_tool_call');
  if (choice?.finish_reason !== 'tool_calls') {
    throw protocolError(
      `OpenAI structured response ended with ${choice?.finish_reason ?? 'unknown reason'}`,
      'unexpected_finish_reason',
    );
  }

  let output: T;
  try {
    output = input.validator.parse(JSON.parse(rawArguments));
  } catch (error) {
    throw protocolError('OpenAI structured response failed validation', 'invalid_structured_output', error);
  }

  return {
    output,
    providerGenerationId: data.id,
    providerRequestId,
    clientRequestId: input.clientRequestId,
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
