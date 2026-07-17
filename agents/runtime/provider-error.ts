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

/**
 * Extracts only low-cardinality, non-secret provider diagnostics for agent_runs.
 * Unknown error objects never get serialized wholesale.
 */
export function providerErrorTelemetry(error: unknown): {
  rawStatus: number;
  metadata?: ProviderErrorMetadata;
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
  const providerError = {
    ...(code ? { code } : {}),
    ...(type ? { type } : {}),
    ...(requestId ? { requestId } : {}),
  };

  if (!providerError.code && !providerError.type && !providerError.requestId) {
    return { rawStatus };
  }

  return { rawStatus, metadata: { providerError } };
}
