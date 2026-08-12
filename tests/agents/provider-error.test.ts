import { describe, expect, it } from 'vitest';
import { providerErrorTelemetry } from '../../agents/runtime/provider-error';

describe('providerErrorTelemetry', () => {
  it('extracts bounded provider diagnostics for agent_runs', () => {
    expect(providerErrorTelemetry({
      status: 403,
      code: 'insufficient_permissions',
      type: 'invalid_request_error',
      requestId: 'req_luna_123',
      usage: {
        inputTokens: 120,
        outputTokens: 8,
        cacheReadTokens: 80,
        cacheWriteTokens: 12,
      },
      latencyMs: 321,
      providerGenerationId: 'resp_123',
    })).toEqual({
      rawStatus: 403,
      metadata: {
        providerError: {
          code: 'insufficient_permissions',
          type: 'invalid_request_error',
          requestId: 'req_luna_123',
        },
      },
      usage: {
        inputTokens: 120,
        outputTokens: 8,
        cacheReadTokens: 80,
        cacheWriteTokens: 12,
      },
      latencyMs: 321,
      providerGenerationId: 'resp_123',
    });
  });

  it('rejects invalid status values and omits unrecognized diagnostics', () => {
    const result = providerErrorTelemetry({
      status: 999,
      code: 'x'.repeat(300),
      requestId: 42,
    });

    expect(result.rawStatus).toBe(0);
    expect(result.metadata).toBeUndefined();
  });

  it('returns empty telemetry for ordinary errors', () => {
    expect(providerErrorTelemetry(new Error('offline'))).toEqual({ rawStatus: 0 });
  });
});
