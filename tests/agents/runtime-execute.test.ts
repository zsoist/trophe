import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createGeneration: vi.fn(),
  completeGeneration: vi.fn(),
  failGeneration: vi.fn(),
}));

vi.mock('@/agents/runtime/persistence', () => persistence);
vi.mock('@/agents/observability/langfuse', () => ({
  traced: vi.fn(async (_input, fn: () => Promise<unknown>) => fn()),
}));

import { executeAiTask } from '@/agents/runtime/execute';

describe('executeAiTask integration contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.createGeneration.mockResolvedValue(undefined);
    persistence.completeGeneration.mockResolvedValue(undefined);
    persistence.failGeneration.mockResolvedValue(undefined);
  });

  it('persists pending and completed generation state', async () => {
    const result = await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke: vi.fn(async () => ({
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs: 50,
        rawStatus: 200,
        providerGenerationId: 'provider-1',
      })),
    });

    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(persistence.completeGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: result.generationId,
      providerGenerationId: 'provider-1',
      rawStatus: 200,
    }));
    expect(persistence.failGeneration).not.toHaveBeenCalled();
  });

  it('rejects over-budget input before persistence or provider invocation', async () => {
    const invoke = vi.fn();
    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'x'.repeat(8_001),
      invoke,
    })).rejects.toThrow(/exceeds/);

    expect(invoke).not.toHaveBeenCalled();
    expect(persistence.createGeneration).not.toHaveBeenCalled();
  });

  it('marks provider failures failed and propagates the original error', async () => {
    const providerError = new Error('provider unavailable');
    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke: vi.fn(async () => { throw providerError; }),
    })).rejects.toBe(providerError);

    expect(persistence.failGeneration).toHaveBeenCalledWith(expect.any(String), providerError);
  });

  it('preserves provider errors when failure persistence is unavailable', async () => {
    const providerError = new Error('provider unavailable');
    persistence.failGeneration.mockRejectedValueOnce(new Error('database unavailable'));

    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke: vi.fn(async () => { throw providerError; }),
    })).rejects.toBe(providerError);
  });

  it('aborts provider work when the task timeout expires', async () => {
    vi.useFakeTimers();
    const invoke = vi.fn(({ signal }: { signal: AbortSignal }) => new Promise<never>((_, reject) => {
      signal.addEventListener('abort', () => reject(new Error('provider aborted')), { once: true });
    }));

    const execution = executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    });
    const rejection = expect(execution).rejects.toThrow('provider aborted');
    await vi.advanceTimersByTimeAsync(30_000);

    await rejection;
    expect(invoke.mock.calls[0]?.[0].signal.aborted).toBe(true);
    vi.useRealTimers();
  });
});
