import type { ProviderResult } from '../types';
import { AiProviderError } from './errors';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function invokeAnthropicJson<T>(input: {
  body: Record<string, unknown>;
  signal: AbortSignal;
  clientRequestId?: string;
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
  const responseText = await response.text();
  let data: T & {
    id?: string;
    request_id?: string;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    };
    error?: { message?: string; type?: string };
  };
  try {
    data = (responseText ? JSON.parse(responseText) : {}) as typeof data;
  } catch (error) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: `Anthropic returned a non-JSON response (${response.status})`,
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
      providerRequestId: response.headers.get('request-id')
        ?? response.headers.get('x-request-id')
        ?? undefined,
      clientRequestId: input.clientRequestId,
      cause: error,
    });
  }
  const providerRequestId = response.headers.get('request-id')
    ?? response.headers.get('x-request-id')
    ?? data.request_id
    ?? undefined;
  if (!response.ok) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: data.error?.message ?? `Anthropic request failed with ${response.status}`,
      status: response.status,
      errorType: data.error?.type,
      providerRequestId,
      clientRequestId: input.clientRequestId,
    });
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
    providerRequestId,
    clientRequestId: input.clientRequestId,
  };
}
