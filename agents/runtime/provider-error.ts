import type { AiUsage } from './types';

const MAX_PROVIDER_DIAGNOSTIC_LENGTH = 120;

interface ProviderErrorMetadata {
  providerError: {
    code?: string;
    type?: string;
    requestId?: string;
  };
}

function boundedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, MAX_PROVIDER_DIAGNOSTIC_LENGTH)
    : undefined;
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
  const code = boundedString(candidate.code);
  const type = boundedString(candidate.type);
  const requestId = boundedString(candidate.requestId);
  const usage = providerFailureUsage(candidate.usage);
  const latencyMs = nonNegativeInteger(candidate.latencyMs);
  const providerGenerationId = boundedString(candidate.providerGenerationId);
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
