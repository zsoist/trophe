import type { Provider } from '@/agents/router/policies';
import type { AiUsage } from '../types';

export interface AiProviderErrorInput {
  provider: Provider;
  message: string;
  status?: number;
  errorType?: string;
  errorCode?: string;
  providerRequestId?: string;
  clientRequestId?: string;
  providerGenerationId?: string;
  usage?: AiUsage;
  latencyMs?: number;
}

/**
 * Safe, provider-agnostic diagnostics for persistence and incident triage.
 * Validated HTTP-200 failures may also carry generation, usage, and latency
 * evidence so paid attempts are accounted before a fallback runs.
 * Never attach credentials, prompts, or raw response bodies to this error.
 */
export class AiProviderError extends Error {
  readonly provider: Provider;
  readonly status?: number;
  readonly errorType?: string;
  readonly errorCode?: string;
  readonly providerRequestId?: string;
  readonly clientRequestId?: string;
  readonly providerGenerationId?: string;
  readonly usage?: AiUsage;
  readonly latencyMs?: number;

  constructor(input: AiProviderErrorInput) {
    super(input.message);
    this.name = 'AiProviderError';
    this.provider = input.provider;
    this.status = input.status;
    this.errorType = input.errorType;
    this.errorCode = input.errorCode;
    this.providerRequestId = input.providerRequestId;
    this.clientRequestId = input.clientRequestId;
    this.providerGenerationId = input.providerGenerationId;
    this.usage = input.usage;
    this.latencyMs = input.latencyMs;
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
