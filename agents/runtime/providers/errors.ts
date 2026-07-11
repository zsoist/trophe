import type { Provider } from '@/agents/router/policies';

export interface AiProviderErrorInput {
  provider: Provider;
  message: string;
  status?: number;
  errorType?: string;
  errorCode?: string;
  providerRequestId?: string;
  clientRequestId?: string;
  cause?: unknown;
}

/**
 * Safe, provider-agnostic diagnostics for persistence and incident triage.
 * Never attach credentials, prompts, or raw response bodies to this error.
 */
export class AiProviderError extends Error {
  readonly provider: Provider;
  readonly status?: number;
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly providerRequestId?: string;
  readonly clientRequestId?: string;

  constructor(input: AiProviderErrorInput) {
    super(input.message, input.cause === undefined ? undefined : { cause: input.cause });
    this.name = 'AiProviderError';
    this.provider = input.provider;
    this.status = input.status;
    this.errorType = input.errorType;
    this.errorCode = input.errorCode;
    this.providerRequestId = input.providerRequestId;
    this.clientRequestId = input.clientRequestId;
  }
}

export function providerErrorMetadata(error: unknown): Record<string, unknown> {
  if (!(error instanceof AiProviderError)) return {};
  return Object.fromEntries(Object.entries({
    providerErrorType: error.errorType,
    providerErrorCode: error.errorCode,
    providerRequestId: error.providerRequestId,
    clientRequestId: error.clientRequestId,
  }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0));
}
