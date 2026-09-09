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

  it('keeps network and billing classifications allowlisted while dropping arbitrary fields', () => {
    expect(providerErrorTelemetry({ status: 429, code: 'insufficient_quota', requestId: 'req_quota_1' })).toMatchObject({
      rawStatus: 429, metadata: { providerError: { code: 'insufficient_quota', requestId: 'req_quota_1' } },
    });
    const redacted = providerErrorTelemetry({ status: 403, code: 'private_code', type: 'private_type', requestId: 'secret', message: 'sk-private' });
    expect(redacted).toEqual({ rawStatus: 403 });
    expect(JSON.stringify(redacted)).not.toContain('private');
    expect(providerErrorTelemetry({ status: 404, code: 'model_not_found', param: 'model' })).toEqual({
      rawStatus: 404, metadata: { providerError: { code: 'model_not_found', param: 'model' } },
    });
    expect(providerErrorTelemetry({ status: 400, type: 'invalid_request_error', param: 'private.path' })).toEqual({rawStatus:400,metadata:{providerError:{type:'invalid_request_error'}}});
  });

  it('extracts a native network cause without reading messages, getters, or the cause object', () => {
    const error = Object.assign(new TypeError('sk-private'), { cause: { code: 'UND_ERR_CONNECT_TIMEOUT', detail: 'private cause' } });
    Object.defineProperty(error, 'requestId', { get: () => { throw new Error('must not read'); } });
    const telemetry = providerErrorTelemetry(error);
    expect(telemetry).toEqual({
      rawStatus: 0,
      metadata: { providerError: { code: 'UND_ERR_CONNECT_TIMEOUT' } },
    });
    expect(JSON.stringify(telemetry)).not.toMatch(/sk-private|private cause/);
  });
});
