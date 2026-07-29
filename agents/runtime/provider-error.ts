import type { AiUsage } from './types';

const MAX_PROVIDER_DIAGNOSTIC_LENGTH = 120;
const KNOWN_PROVIDER_DIAGNOSTICS = new Set([
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
  'response_validation_error',
  'http_error',
  'insufficient_permissions',
  'invalid_api_key',
  'rate_limit_exceeded',
  'server_error',
]);
const REQUEST_ID_PATTERN = /^req_[A-Za-z0-9_-]{1,116}$/;
const PROVIDER_GENERATION_ID_PATTERN = /^(?:msg|resp)_[A-Za-z0-9_-]{1,116}$/;

interface ProviderErrorMetadata {
  providerError: {
    code?: string;
    type?: string;
    requestId?: string;
  };
}

function knownDiagnostic(value: unknown): string | undefined {
  return typeof value === 'string' && value.length <= MAX_PROVIDER_DIAGNOSTIC_LENGTH
    && KNOWN_PROVIDER_DIAGNOSTICS.has(value)
    ? value
    : undefined;
}

function safeRequestId(value: unknown): string | undefined {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value) ? value : undefined;
}

function safeProviderGenerationId(value: unknown): string | undefined {
  return typeof value === 'string' && PROVIDER_GENERATION_ID_PATTERN.test(value) ? value : undefined;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
}

function providerFailureUsage(value: unknown): AiUsage | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const inputTokens = nonNegativeInteger(candidate.inputTokens);
  const outputTokens = nonNegativeInteger(candidate.outputTokens);
  if (inputTokens == null && outputTokens == null) return undefined;

  const cacheReadTokens = nonNegativeInteger(candidate.cacheReadTokens);
  const cacheWriteTokens = nonNegativeInteger(candidate.cacheWriteTokens);
  const reasoningTokens = nonNegativeInteger(candidate.reasoningTokens);
  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    ...(cacheReadTokens != null ? { cacheReadTokens } : {}),
    ...(cacheWriteTokens != null ? { cacheWriteTokens } : {}),
    ...(reasoningTokens != null ? { reasoningTokens } : {}),
  };
}

/**
 * Extracts only low-cardinality, non-secret provider diagnostics for agent_runs.
 * Unknown error objects never get serialized wholesale.
 */
export function providerErrorTelemetry(error: unknown): {
  rawStatus: number;
  metadata?: ProviderErrorMetadata;
  usage?: AiUsage;
  latencyMs?: number;
  providerGenerationId?: string;
} {
  if (!error || typeof error !== 'object') return { rawStatus: 0 };

  const candidate = error as Record<string, unknown>;
  const status = candidate.status;
  const rawStatus = typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : 0;
  const code = knownDiagnostic(candidate.code);
  const type = knownDiagnostic(candidate.type);
  const requestId = safeRequestId(candidate.requestId);
  const usage = providerFailureUsage(candidate.usage);
  const latencyMs = nonNegativeInteger(candidate.latencyMs);
  const providerGenerationId = safeProviderGenerationId(candidate.providerGenerationId);
  const providerError = {
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
    ...(requestId ? { requestId } : {}),
  };

  return {
    rawStatus,
    ...(providerError.code || providerError.type || providerError.requestId
      ? { metadata: { providerError } }
      : {}),
    ...(usage ? { usage } : {}),
    ...(latencyMs != null ? { latencyMs } : {}),
    ...(providerGenerationId ? { providerGenerationId } : {}),
  };
}
