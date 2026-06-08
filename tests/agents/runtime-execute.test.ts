import { beforeEach, describe, expect, it, vi } from 'vitest';

const persistence = vi.hoisted(() => ({
  createGeneration: vi.fn(),
  completeGeneration: vi.fn(),
  failGeneration: vi.fn(),
}));
const orgBudget = vi.hoisted(() => ({
  resolveOrganizationId: vi.fn(),
  assertWithinOrganizationBudget: vi.fn(),
}));

vi.mock('@/agents/runtime/persistence', () => persistence);
vi.mock('@/agents/runtime/org-budget', () => orgBudget);
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
    orgBudget.resolveOrganizationId.mockResolvedValue(undefined);
    orgBudget.assertWithinOrganizationBudget.mockResolvedValue(undefined);
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

  it('rejects organization budget violations before persistence or provider invocation', async () => {
    const invoke = vi.fn();
    orgBudget.resolveOrganizationId.mockResolvedValueOnce('00000000-0000-0000-0000-000000000001');
    orgBudget.assertWithinOrganizationBudget.mockRejectedValueOnce(new Error('Organization daily AI budget exceeded'));

    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      context: { userId: '00000000-0000-0000-0000-000000000002' },
      invoke,
    })).rejects.toThrow('Organization daily AI budget exceeded');

    expect(invoke).not.toHaveBeenCalled();
    expect(persistence.createGeneration).not.toHaveBeenCalled();
  });

  it('persists the resolved organization for attributed costs', async () => {
    orgBudget.resolveOrganizationId.mockResolvedValueOnce('00000000-0000-0000-0000-000000000001');

    await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      context: { userId: '00000000-0000-0000-0000-000000000002' },
      invoke: vi.fn(async () => ({
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs: 50,
        rawStatus: 200,
      })),
    });

    expect(persistence.createGeneration).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ organizationId: '00000000-0000-0000-0000-000000000001' }),
    }));
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

  it('falls back to secondary provider when primary fails', async () => {
    // meal_suggest has a fallback (Anthropic). The invoke callback is policy-aware.
    let callCount = 0;
    const invoke = vi.fn(async ({ policy }: { policy: { provider: string } }) => {
      callCount++;
      if (callCount === 1) {
        // Primary (deepseek) fails
        expect(policy.provider).toBe('deepseek');
        throw new Error('DeepSeek rate limited');
      }
      // Fallback (anthropic) succeeds
      expect(policy.provider).toBe('anthropic');
      return {
        output: { suggestions: ['fallback meal'] },
        usage: { inputTokens: 50, outputTokens: 10 },
        latencyMs: 100,
        rawStatus: 200,
      };
    });

    const result = await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(result.output).toEqual({ suggestions: ['fallback meal'] });
    // Both primary failure and fallback success should be persisted
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ fallbackFrom: 'deepseek-v4-flash' }),
    );
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
