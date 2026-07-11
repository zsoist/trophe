import type { ProviderResult } from '../types';
import { AiProviderError } from './errors';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

export async function invokeAnthropicJson<T>(input: {
  body: Record<string, unknown>;
  signal: AbortSignal;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(input.body),
      signal: input.signal,
    });
  } catch {
    const aborted = input.signal.aborted;
    throw new AiProviderError({
      provider: 'anthropic',
      message: aborted ? 'Anthropic request aborted' : 'Anthropic network request failed',
      errorType: aborted ? 'request_aborted' : 'network_error',
      errorCode: aborted ? 'aborted' : undefined,
    });
  }
  const latencyMs = Date.now() - startedAt;
  const headerRequestId = response.headers.get('request-id')
    ?? response.headers.get('x-request-id')
    ?? undefined;
  let responseText: string;
  try {
    responseText = await response.text();
  } catch {
    throw new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic response body could not be read',
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'response_read_failed',
      providerRequestId: headerRequestId,
    });
  }
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
    const parsed: unknown = responseText ? JSON.parse(responseText) : undefined;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Anthropic response root is not an object');
    }
    data = parsed as typeof data;
  } catch {
    throw new AiProviderError({
      provider: 'anthropic',
      message: `Anthropic returned a non-JSON response (${response.status})`,
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
      providerRequestId: headerRequestId,
    });
  }
  const providerRequestId = headerRequestId ?? data.request_id ?? undefined;
  if (!response.ok) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: data.error?.message ?? `Anthropic request failed with ${response.status}`,
      status: response.status,
      errorType: data.error?.type,
      providerRequestId,
    });
  }

  const inputTokens = data.usage?.input_tokens;
  const outputTokens = data.usage?.output_tokens;
  if (!Number.isFinite(inputTokens) || Number(inputTokens) <= 0
    || !Number.isFinite(outputTokens) || Number(outputTokens) < 0) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic response missing authoritative token usage',
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'missing_usage_evidence',
      providerRequestId,
    });
  }
  const optionalUsageCounters = [
    data.usage?.cache_creation_input_tokens,
    data.usage?.cache_read_input_tokens,
  ];
  if (optionalUsageCounters.some((value) => value !== undefined
    && (!Number.isFinite(value) || Number(value) < 0))) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic response contained invalid optional token usage',
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_usage_evidence',
      providerRequestId,
    });
  }
  const authoritativeUsage: ProviderResult<T>['usage'] = {
    inputTokens: inputTokens as number,
    outputTokens: outputTokens as number,
    cacheWriteTokens: data.usage?.cache_creation_input_tokens ?? 0,
    cacheReadTokens: data.usage?.cache_read_input_tokens ?? 0,
  };
  if (typeof data.id !== 'string' || data.id.length === 0) {
    throw new AiProviderError({
      provider: 'anthropic',
      message: 'Anthropic response missing generation ID',
      status: response.status,
      errorType: 'provider_protocol_error',
      errorCode: 'missing_generation_id',
      providerRequestId,
      usage: authoritativeUsage,
      latencyMs,
    });
  }

  return {
    output: data,
    usage: authoritativeUsage,
    latencyMs,
    rawStatus: response.status,
    providerGenerationId: data.id,
    providerRequestId,
  };
}
