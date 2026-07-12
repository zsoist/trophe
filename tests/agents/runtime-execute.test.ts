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
const observability = vi.hoisted(() => ({
  traced: vi.fn(async (_input, fn: () => Promise<unknown>) => fn()),
}));

vi.mock('@/agents/runtime/persistence', () => persistence);
vi.mock('@/agents/runtime/org-budget', () => orgBudget);
vi.mock('@/agents/observability/langfuse', () => observability);

import { executeAiTask } from '@/agents/runtime/execute';
import { AiProviderError } from '@/agents/runtime/providers/errors';

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
    let invokedClientRequestId: string | undefined;
    const result = await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke: vi.fn(async ({ clientRequestId }) => {
        invokedClientRequestId = clientRequestId;
        return {
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs: 50,
        rawStatus: 200,
        providerGenerationId: 'provider-1',
        providerRequestId: 'req-provider-1',
        clientRequestId,
      };
      }),
    });

    expect(invokedClientRequestId).toBe(result.generationId);
    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(persistence.completeGeneration).toHaveBeenCalledWith(expect.objectContaining({
      generationId: result.generationId,
      providerGenerationId: 'provider-1',
      providerRequestId: 'req-provider-1',
      clientRequestId: result.generationId,
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

  it('passes the user id into solo-user budget enforcement', async () => {
    const userId = '00000000-0000-0000-0000-000000000002';

    await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      context: { userId },
      invoke: vi.fn(async () => ({
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs: 50,
        rawStatus: 200,
      })),
    });

    expect(orgBudget.assertWithinOrganizationBudget).toHaveBeenCalledWith(undefined, userId);
  });

  it('keeps Langfuse identity and fallback fields authoritative', async () => {
    const userId = '00000000-0000-0000-0000-000000000002';
    await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      context: {
        userId,
        metadata: {
          generationId: 'spoofed',
          isFallback: true,
          promptVersion: 'spoofed',
          userId: 'raw-user',
        },
      },
      invoke: vi.fn(async () => ({
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 100, outputTokens: 20 },
        latencyMs: 50,
        rawStatus: 200,
      })),
    });

    const traceInput = observability.traced.mock.calls[0][0];
    expect(traceInput.metadata).toMatchObject({ isFallback: false });
    expect(traceInput.metadata.generationId).not.toBe('spoofed');
    expect(traceInput.metadata.promptVersion).toBe('meal-suggest-v2-luna');
    expect(traceInput.metadata.userId).toMatch(/^trophe_[0-9a-f]{32}$/);
    expect(traceInput.metadata.userId).not.toBe(userId);
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

    expect(persistence.failGeneration).toHaveBeenCalledWith(
      expect.any(String),
      providerError,
      expect.objectContaining({ usage: undefined, estimatedCostUsd: undefined }),
    );
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
    // Consumer text fails over from Luna to Haiku without reopening DeepSeek.
    let callCount = 0;
    const invoke = vi.fn(async ({ policy }: { policy: { provider: string } }) => {
      callCount++;
      if (callCount === 1) {
        expect(policy.provider).toBe('openai');
        throw new AiProviderError({
          provider: 'openai',
          message: 'OpenAI malformed paid response',
          status: 200,
          errorType: 'provider_protocol_error',
          errorCode: 'missing_tool_call',
          providerRequestId: 'req-paid-failure',
          providerGenerationId: 'resp-paid-failure',
          usage: { inputTokens: 1_000, outputTokens: 100, cacheWriteTokens: 200 },
          latencyMs: 250,
        });
      }
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
    expect(result).toMatchObject({
      selectedPolicy: { provider: 'anthropic', model: 'claude-haiku-4-5-20251001' },
      isFallback: true,
    });
    // Both primary failure and fallback success should be persisted
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(AiProviderError),
      expect.objectContaining({
        usage: { inputTokens: 1_000, outputTokens: 100, cacheWriteTokens: 200 },
        estimatedCostUsd: expect.any(Number),
        providerGenerationId: 'resp-paid-failure',
        providerRequestId: 'req-paid-failure',
      }),
    );
    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ fallbackFrom: 'gpt-5.6-luna' }),
    );
    expect(orgBudget.assertWithinOrganizationBudget).toHaveBeenCalledTimes(2);
  });

  it('persists known provider spend when a completed call exceeds its request ceiling', async () => {
    await expect(executeAiTask({
      task: 'photo_analyze',
      prompt: 'analyze photo',
      invoke: vi.fn(async () => ({
        output: { foods: [] },
        usage: { inputTokens: 100_000, outputTokens: 100_000 },
        latencyMs: 500,
        rawStatus: 200,
        providerGenerationId: 'msg-over-budget',
        providerRequestId: 'req-over-budget',
      })),
    })).rejects.toThrow('exceeded cost ceiling');

    expect(persistence.failGeneration).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Error),
      expect.objectContaining({
        usage: { inputTokens: 100_000, outputTokens: 100_000 },
        estimatedCostUsd: expect.any(Number),
        rawStatus: 200,
        providerGenerationId: 'msg-over-budget',
        providerRequestId: 'req-over-budget',
      }),
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

  it('falls back to Haiku when the bounded food_parse primary times out', async () => {
    vi.useFakeTimers();
    let callCount = 0;
    const invoke = vi.fn(({ policy, signal }: { policy: { provider: string }; signal: AbortSignal }) => {
      callCount++;
      if (callCount === 1) {
        expect(policy.provider).toBe('openai');
        return new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('primary timed out')), { once: true });
        });
      }
      expect(policy.provider).toBe('anthropic');
      return Promise.resolve({
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      });
    });

    const execution = executeAiTask({ task: 'food_parse', prompt: 'one apple', invoke });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(execution).resolves.toMatchObject({ output: { items: [] } });
    expect(invoke).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
