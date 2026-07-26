import type { AiUsage, ProviderResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_RESPONSE_BYTES = 1_048_576;
const MIN_RESPONSE_BYTES = 65_536;
const RESPONSE_BYTES_PER_TOKEN = 16;

const ANTHROPIC_ERROR_CODES = new Set([
  'invalid_request_error',
  'authentication_error',
  'permission_error',
  'not_found_error',
  'request_too_large',
  'rate_limit_error',
  'api_error',
  'overloaded_error',
  'forbidden',
  'rate_limited',
  'invalid_response',
]);
const ANTHROPIC_ERROR_TYPES = new Set([
  ...ANTHROPIC_ERROR_CODES,
  'http_error',
  'response_validation_error',
]);
const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]{1,116}$/;
const MESSAGE_ID_PATTERN = /^msg_[A-Za-z0-9_-]{1,116}$/;

export type AnthropicResponseBody = {
  id?: unknown;
  content?: unknown;
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    cache_creation_input_tokens?: unknown;
    cache_read_input_tokens?: unknown;
  };
  error?: {
    code?: unknown;
    type?: unknown;
  };
};

export class AnthropicApiError extends Error {
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
    super('Anthropic request failed');
    this.name = 'AnthropicApiError';
    this.status = input.status;
    this.code = knownCode(input.code);
    this.type = knownType(input.type);
    this.requestId = requestId(input.requestId);
    this.usage = input.usage;
    this.latencyMs = input.latencyMs;
    this.providerGenerationId = messageId(input.providerGenerationId);
  }
}

function knownCode(value: unknown): string | undefined {
  return typeof value === 'string' && ANTHROPIC_ERROR_CODES.has(value) ? value : undefined;
}

function knownType(value: unknown): string | undefined {
  return typeof value === 'string' && ANTHROPIC_ERROR_TYPES.has(value) ? value : undefined;
}

function requestId(value: unknown): string | undefined {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

function messageId(value: unknown): string | undefined {
  return typeof value === 'string' && MESSAGE_ID_PATTERN.test(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function optionalUsageValue(usage: Record<string, unknown>, field: string): {
  valid: boolean;
  value?: number;
} {
  if (!Object.hasOwn(usage, field)) return { valid: true };
  const value = nonNegativeInteger(usage[field]);
  return value == null ? { valid: false } : { valid: true, value };
}

/** Returns undefined when required or present optional usage is invalid. */
export function anthropicUsage(data: AnthropicResponseBody): AiUsage | undefined {
  if (!isRecord(data.usage)) return undefined;
  const inputTokens = nonNegativeInteger(data.usage.input_tokens);
  const outputTokens = nonNegativeInteger(data.usage.output_tokens);
  if (inputTokens == null || outputTokens == null) return undefined;

  const cacheWriteTokens = optionalUsageValue(data.usage, 'cache_creation_input_tokens');
  const cacheReadTokens = optionalUsageValue(data.usage, 'cache_read_input_tokens');
  if (!cacheWriteTokens.valid || !cacheReadTokens.valid) return undefined;

  return {
    inputTokens,
    outputTokens,
    ...(cacheWriteTokens.value != null ? { cacheWriteTokens: cacheWriteTokens.value } : {}),
    ...(cacheReadTokens.value != null ? { cacheReadTokens: cacheReadTokens.value } : {}),
  };
}

function requestIdFrom(response: Response): string | undefined {
  return requestId(response.headers.get('request-id')) ?? requestId(response.headers.get('x-request-id'));
}

function providerGenerationIdFrom(data: AnthropicResponseBody): string | undefined {
  return messageId(data.id);
}

function apiError(input: {
  response: Response;
  data?: AnthropicResponseBody;
  latencyMs: number;
  malformed?: boolean;
}): AnthropicApiError {
  const error = input.data?.error;
  return new AnthropicApiError({
    message: input.malformed
      ? 'Anthropic returned a malformed response'
      : `Anthropic request failed with status ${input.response.status}`,
    status: input.response.status,
    code: input.malformed ? 'invalid_response' : knownCode(error?.code),
    type: input.malformed ? 'response_validation_error' : knownType(error?.type) ?? 'http_error',
    requestId: requestIdFrom(input.response),
    usage: input.data ? anthropicUsage(input.data) : undefined,
    latencyMs: input.latencyMs,
    providerGenerationId: input.data ? providerGenerationIdFrom(input.data) : undefined,
  });
}

function responseByteLimit(maxTokens: unknown): number {
  const outputTokens = nonNegativeInteger(maxTokens);
  if (outputTokens == null) return MAX_RESPONSE_BYTES;
  return Math.min(MAX_RESPONSE_BYTES, Math.max(MIN_RESPONSE_BYTES, outputTokens * RESPONSE_BYTES_PER_TOKEN + MIN_RESPONSE_BYTES));
}

async function cancel(body: ReadableStream<Uint8Array> | null): Promise<void> {
  try {
    await body?.cancel();
  } catch {
    // The body is being discarded and must never be surfaced as diagnostics.
  }
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<{
  text?: string;
  exceeded: boolean;
}> {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await cancel(response.body);
    return { exceeded: true };
  }

  if (!response.body) return { text: '', exceeded: false };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return { exceeded: true };
      }
      chunks.push(value);
    }
  } catch {
    await reader.cancel();
    return { exceeded: false };
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { text: new TextDecoder().decode(bytes), exceeded: false };
}

/**
 * Parses Anthropic's message response with a bounded buffer and never retains
 * provider response text in errors or telemetry.
 */
export async function readAnthropicResponse(input: {
  response: Response;
  startedAt: number;
  maxTokens?: unknown;
}): Promise<AnthropicResponseBody> {
  const { response } = input;
  const responseBody = await readBoundedBody(response, responseByteLimit(input.maxTokens));
  const latencyMs = Date.now() - input.startedAt;
  let data: AnthropicResponseBody | undefined;

  if (responseBody.text?.trim()) {
    try {
      const parsed: unknown = JSON.parse(responseBody.text);
      if (isRecord(parsed)) data = parsed;
    } catch {
      // Provider bodies are deliberately never copied into errors or telemetry.
    }
  }

  if (responseBody.exceeded) throw apiError({ response, data, latencyMs, malformed: true });
  if (!response.ok) throw apiError({ response, data, latencyMs });
  if (!data) throw apiError({ response, latencyMs, malformed: true });
  return data;
}

export function malformedAnthropicResponse(input: {
  response: Response;
  startedAt: number;
  data?: AnthropicResponseBody;
}): AnthropicApiError {
  return apiError({
    response: input.response,
    data: input.data,
    latencyMs: Date.now() - input.startedAt,
    malformed: true,
  });
}

export async function invokeAnthropicJson<T>(input: {
  body: Record<string, unknown>;
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
}): Promise<ProviderResult<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

  const startedAt = Date.now();
  const response = await (input.fetchImpl ?? fetch)(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(input.body),
    signal: input.signal,
  });
  const data = await readAnthropicResponse({ response, startedAt, maxTokens: input.body.max_tokens });
  const usage = anthropicUsage(data);
  if (!Array.isArray(data.content) || data.content.length === 0 || !usage) {
    throw malformedAnthropicResponse({ response, startedAt, data });
  }

  return {
    output: data as T,
    usage,
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
    providerGenerationId: providerGenerationIdFrom(data),
  };
}
