import type { AiUsage, ProviderResult } from '../types';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MAX_DIAGNOSTIC_LENGTH = 120;

type AnthropicResponseBody = {
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
    super(boundDiagnostic(input.message) ?? 'Anthropic request failed');
    this.name = 'AnthropicApiError';
    this.status = input.status;
    this.code = boundDiagnostic(input.code);
    this.type = boundDiagnostic(input.type);
    this.requestId = boundDiagnostic(input.requestId);
    this.usage = input.usage;
    this.latencyMs = input.latencyMs;
    this.providerGenerationId = boundDiagnostic(input.providerGenerationId);
  }
}

function boundDiagnostic(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  return value.slice(0, MAX_DIAGNOSTIC_LENGTH);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

export function anthropicUsage(data: AnthropicResponseBody): AiUsage | undefined {
  if (!isRecord(data.usage)) return undefined;
  return {
    inputTokens: tokenCount(data.usage.input_tokens),
    outputTokens: tokenCount(data.usage.output_tokens),
    cacheWriteTokens: tokenCount(data.usage.cache_creation_input_tokens),
    cacheReadTokens: tokenCount(data.usage.cache_read_input_tokens),
  };
}

function requestIdFrom(response: Response): string | undefined {
  return boundDiagnostic(response.headers.get('request-id') ?? response.headers.get('x-request-id'));
}

function providerGenerationIdFrom(data: AnthropicResponseBody): string | undefined {
  return boundDiagnostic(data.id);
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
    code: input.malformed ? 'invalid_response' : boundDiagnostic(error?.code),
    type: input.malformed ? 'response_validation_error' : boundDiagnostic(error?.type) ?? 'http_error',
    requestId: requestIdFrom(input.response),
    usage: input.data ? anthropicUsage(input.data) : undefined,
    latencyMs: input.latencyMs,
    providerGenerationId: input.data ? providerGenerationIdFrom(input.data) : undefined,
  });
}

/**
 * Parses Anthropic's message response without retaining provider body text.
 * Both text and structured call sites share this boundary so their failures
 * have the same typed, allowlisted diagnostics.
 */
export async function readAnthropicResponse(input: {
  response: Response;
  startedAt: number;
}): Promise<AnthropicResponseBody> {
  const { response } = input;
  const latencyMs = Date.now() - input.startedAt;
  const responseText = await response.text();
  let data: AnthropicResponseBody | undefined;

  if (responseText) {
    try {
      const parsed: unknown = JSON.parse(responseText);
      if (isRecord(parsed)) data = parsed;
    } catch {
      // Provider bodies are deliberately never copied into errors or telemetry.
    }
  }

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
  const data = await readAnthropicResponse({ response, startedAt });
  if (!Array.isArray(data.content)) {
    throw malformedAnthropicResponse({ response, startedAt, data });
  }

  return {
    output: data as T,
    usage: anthropicUsage(data) ?? { inputTokens: 0, outputTokens: 0 },
    latencyMs: Date.now() - startedAt,
    rawStatus: response.status,
    providerGenerationId: providerGenerationIdFrom(data),
  };
}
