import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const langfuse = vi.hoisted(() => ({
  end: vi.fn(),
  flushAsync: vi.fn(),
}));

vi.mock('langfuse', () => ({
  Langfuse: class {
    trace() {
      return {
        generation: () => ({ end: langfuse.end }),
      };
    }

    flushAsync() {
      return langfuse.flushAsync();
    }
  },
}));

import { traced } from '@/agents/observability/langfuse';

const traceInput = {
  task: 'photo_analyze',
  model: 'claude-haiku-4-5-20251001',
  provider: 'anthropic',
  prompt: '[redacted]',
};

const providerResult = {
  text: '[structured output redacted]',
  usage: { input_tokens: 120, output_tokens: 24 },
  latencyMs: 140,
  rawStatus: 200,
};

describe('Langfuse tracing boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('LANGFUSE_SECRET_KEY', 'test-secret');
    vi.stubEnv('LANGFUSE_PUBLIC_KEY', 'test-public');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('returns a completed provider result without waiting for telemetry flush', async () => {
    langfuse.flushAsync.mockImplementationOnce(() => new Promise<never>(() => undefined));

    await expect(traced(traceInput, async () => providerResult)).resolves.toEqual(providerResult);

    expect(langfuse.end).toHaveBeenCalledOnce();
    expect(langfuse.flushAsync).toHaveBeenCalledOnce();
  });

  it('does not replace a provider result when telemetry flush rejects', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    langfuse.flushAsync.mockRejectedValueOnce(new Error('telemetry unavailable'));

    await expect(traced(traceInput, async () => providerResult)).resolves.toEqual(providerResult);
    await Promise.resolve();

    expect(console.error).toHaveBeenCalledWith(
      '[langfuse] Failed to flush telemetry',
    );
  });

  it('preserves the provider error without waiting for telemetry flush', async () => {
    const providerError = new Error('provider unavailable');
    langfuse.flushAsync.mockImplementationOnce(() => new Promise<never>(() => undefined));

    await expect(traced(traceInput, async () => {
      throw providerError;
    })).rejects.toBe(providerError);

    expect(langfuse.end).toHaveBeenCalledOnce();
    expect(langfuse.flushAsync).toHaveBeenCalledOnce();
  });
});
