import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import { classifyAiError, isFallbackEligible } from '@/agents/runtime/error-classification';
import { taskPolicies } from '@/agents/router/policies';
import { estimateUsageCost } from '@/agents/runtime/cost';

function typedProviderError(
  label: string,
  fields: Record<string, unknown>,
): Error & Record<string, unknown> {
  return Object.assign(new Error(label), fields);
}

function errorWithThrowingStatus(): Error {
  const error = new Error('untrusted error shape');
  Object.defineProperty(error, 'status', {
    get() {
      throw new Error('status getter must not execute');
    },
  });
  return error;
}

const fallbackSuccess = {
  output: { suggestions: ['fallback meal'] },
  usage: { inputTokens: 50, outputTokens: 10 },
  latencyMs: 100,
  rawStatus: 200,
};

type ObservedOutcome<T> =
  | { status: 'resolved'; value: T }
  | { status: 'rejected'; error: unknown };

function observeOutcome<T>(promise: Promise<T>): { current?: ObservedOutcome<T> } {
  const observed: { current?: ObservedOutcome<T> } = {};
  void promise.then(
    (value) => {
      observed.current = { status: 'resolved', value };
    },
    (error: unknown) => {
      observed.current = { status: 'rejected', error };
    },
  );
  return observed;
}

const nonRecoverableConflictCases = [
  {
    label: '503 plus auth code',
    fields: { status: 503, code: 'invalid_api_key' },
    expected: 'auth',
  },
  {
    label: '503 plus schema type',
    fields: { status: 503, type: 'response_validation_error' },
    expected: 'schema',
  },
  {
    label: '503 plus budget code',
    fields: { status: 503, code: 'budget_exceeded' },
    expected: 'budget',
  },
  {
    label: '503 plus policy type',
    fields: { status: 503, type: 'content_policy_violation' },
    expected: 'policy',
  },
  {
    label: '503 plus invalid-input code',
    fields: { status: 503, code: 'invalid_request_error' },
    expected: 'invalid_input',
  },
  {
    label: '403 plus rate-limit code',
    fields: { status: 403, code: 'rate_limit_error' },
    expected: 'auth',
  },
  {
    label: '429 plus schema code',
    fields: { status: 429, code: 'invalid_response' },
    expected: 'schema',
  },
  {
    label: 'rate-limit code plus auth type',
    fields: { code: 'rate_limit_error', type: 'authentication_error' },
    expected: 'auth',
  },
] as const;

describe('AI error classification', () => {
  it('prefers an explicit provider cost for non-token-priced work', () => {
    expect(estimateUsageCost('gpt-transcribe', {
      inputTokens: 0,
      outputTokens: 0,
      actualCostUsd: 0.00225,
    })).toBe(0.00225);
  });

  it.each([
    { label: 'HTTP auth', error: typedProviderError('auth', { status: 401 }), expected: 'auth' },
    { label: 'schema diagnostic', error: typedProviderError('schema', { status: 200, type: 'response_validation_error' }), expected: 'schema' },
    { label: 'budget diagnostic', error: typedProviderError('budget', { status: 400, code: 'budget_exceeded' }), expected: 'budget' },
    { label: 'policy diagnostic', error: typedProviderError('policy', { status: 400, code: 'content_policy_violation' }), expected: 'policy' },
    { label: 'invalid-input diagnostic', error: typedProviderError('invalid', { status: 400, code: 'invalid_request_error' }), expected: 'invalid_input' },
    { label: 'HTTP rate limit', error: typedProviderError('rate', { status: 429 }), expected: 'rate_limit' },
    { label: 'HTTP request timeout', error: typedProviderError('request timeout', { status: 408 }), expected: 'transient' },
    { label: 'HTTP server error', error: typedProviderError('server', { status: 503 }), expected: 'transient' },
    { label: 'runtime timeout', error: typedProviderError('local timeout', { _isTimeout: true }), expected: 'timeout' },
    { label: 'organization budget error', error: Object.assign(new Error('budget'), { name: 'OrganizationAiBudgetExceededError' }), expected: 'budget' },
    { label: 'message-only error', error: new Error('HTTP 503 rate_limit_error'), expected: 'unknown' },
  ] as const)('classifies $label as $expected', ({ error, expected }) => {
    expect(classifyAiError(error)).toBe(expected);
  });

  it.each([
    ['timeout', true],
    ['rate_limit', true],
    ['transient', true],
    ['auth', false],
    ['schema', false],
    ['budget', false],
    ['policy', false],
    ['invalid_input', false],
    ['unknown', false],
  ] as const)('marks %s fallback eligibility as %s', (category, expected) => {
    expect(isFallbackEligible(category)).toBe(expected);
  });

  it('returns unknown for a revoked Proxy instead of throwing', () => {
    const revocable = Proxy.revocable({ status: 503 }, {});
    revocable.revoke();

    expect(() => classifyAiError(revocable.proxy)).not.toThrow();
    expect(classifyAiError(revocable.proxy)).toBe('unknown');
  });

  it('rejects a live Proxy without executing reflection traps', () => {
    const trapCalls = {
      get: 0,
      has: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    };
    const error = new Proxy({ status: 503 }, {
      get(target, property, receiver) {
        trapCalls.get++;
        return Reflect.get(target, property, receiver);
      },
      has(target, property) {
        trapCalls.has++;
        return Reflect.has(target, property);
      },
      ownKeys(target) {
        trapCalls.ownKeys++;
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, property) {
        trapCalls.getOwnPropertyDescriptor++;
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });

    expect(classifyAiError(error)).toBe('unknown');
    expect(trapCalls).toEqual({
      get: 0,
      has: 0,
      ownKeys: 0,
      getOwnPropertyDescriptor: 0,
    });
  });

  it('rejects accessor-shaped fields without invoking their getters', () => {
    let getterCalls = 0;
    const error = {};
    for (const field of ['_isTimeout', 'status', 'name', 'code', 'type']) {
      Object.defineProperty(error, field, {
        get() {
          getterCalls++;
          return field === 'status' ? 503 : 'rate_limit_error';
        },
      });
    }

    expect(classifyAiError(error)).toBe('unknown');
    expect(getterCalls).toBe(0);
  });

  it.each(nonRecoverableConflictCases)(
    'classifies $label as $expected',
    ({ fields, expected }) => {
      expect(classifyAiError(typedProviderError('conflict', fields))).toBe(expected);
    },
  );
});

describe('executeAiTask integration contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.createGeneration.mockResolvedValue(undefined);
    persistence.completeGeneration.mockResolvedValue(undefined);
    persistence.failGeneration.mockResolvedValue(undefined);
    orgBudget.resolveOrganizationId.mockResolvedValue(undefined);
    orgBudget.assertWithinOrganizationBudget.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
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
      'gpt-5.6-luna',
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

  it.each([
    [429, 'rate_limit_exceeded'],
    [408, undefined],
    [409, undefined],
    [500, undefined],
    [502, undefined],
    [503, undefined],
  ] as const)('falls back to secondary provider for recoverable status %i', async (status, code) => {
    // Consumer text fails over from Luna to Haiku without reopening DeepSeek.
    let callCount = 0;
    const invoke = vi.fn(async ({ policy }: { policy: { provider: string } }) => {
      callCount++;
      if (callCount === 1) {
        expect(policy.provider).toBe('openai');
        throw typedProviderError('provider failure', { status, ...(code ? { code } : {}) });
      }
      expect(policy.provider).toBe('anthropic');
      return fallbackSuccess;
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
    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenLastCalledWith(
      expect.objectContaining({ fallbackFrom: 'gpt-5.6-luna' }),
    );
  });

  it.each([
    ['auth', typedProviderError('auth', { status: 403, code: 'insufficient_permissions' })],
    ['schema', typedProviderError('schema', { status: 200, code: 'invalid_response' })],
    ['budget', typedProviderError('budget', { status: 400, code: 'budget_exceeded' })],
    ['policy', typedProviderError('policy', { status: 400, code: 'content_policy_violation' })],
    ['invalid input', typedProviderError('invalid input', { status: 400, code: 'invalid_request_error' })],
    ['unknown', new Error('HTTP 503 rate_limit_error')],
  ])('does not fallback for %s errors and preserves their identity', async (_category, primaryError) => {
    const invoke = vi.fn(async () => {
      throw primaryError;
    });

    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    })).rejects.toBe(primaryError);

    expect(invoke).toHaveBeenCalledOnce();
  });

  it.each(nonRecoverableConflictCases)(
    'does not fallback for $label and preserves the original error',
    async ({ fields }) => {
      const primaryError = typedProviderError('conflicting provider error', fields);
      const invoke = vi.fn(async () => {
        throw primaryError;
      });

      await expect(executeAiTask({
        task: 'meal_suggest',
        prompt: 'suggest a meal',
        invoke,
      })).rejects.toBe(primaryError);

      expect(invoke).toHaveBeenCalledOnce();
    },
  );

  it.each([
    '429',
    99,
    600,
    429.5,
    Number.NaN,
    errorWithThrowingStatus(),
  ])('does not fallback when provider status is malformed (%s)', async (status) => {
    const primaryError = status instanceof Error
      ? status
      : typedProviderError('malformed status', {
        status,
        code: 'rate_limit_error',
      });
    const invoke = vi.fn(async () => {
      throw primaryError;
    });

    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    })).rejects.toBe(primaryError);

    expect(invoke).toHaveBeenCalledOnce();
  });

  it('skips fallback when provider and model match the primary', async () => {
    const primaryError = typedProviderError('temporary outage', { status: 503 });
    const invoke = vi.fn(async () => {
      throw primaryError;
    });

    await expect(executeAiTask({
      task: 'coach_insight',
      prompt: 'summarize',
      invoke,
    })).rejects.toBe(primaryError);

    expect(invoke).toHaveBeenCalledOnce();
  });

  it('never invokes fallback more than once', async () => {
    const fallbackError = typedProviderError('fallback unavailable', { status: 503 });
    let attempts = 0;
    const invoke = vi.fn(async () => {
      attempts++;
      if (attempts === 1) {
        throw typedProviderError('primary unavailable', { status: 503 });
      }
      throw fallbackError;
    });

    await expect(executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    })).rejects.toBe(fallbackError);

    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it('settles at the chain deadline when organization resolution never settles', async () => {
    vi.useFakeTimers();
    orgBudget.resolveOrganizationId.mockImplementationOnce(() => new Promise<never>(() => undefined));
    const invoke = vi.fn();
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(14_999);
    expect(observed.current).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1);
    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(orgBudget.assertWithinOrganizationBudget).not.toHaveBeenCalled();
    expect(persistence.createGeneration).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles at the chain deadline when the initial budget check never settles', async () => {
    vi.useFakeTimers();
    orgBudget.assertWithinOrganizationBudget.mockImplementationOnce(
      () => new Promise<never>(() => undefined),
    );
    const invoke = vi.fn();
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(persistence.createGeneration).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('settles at the chain deadline when primary generation creation never settles', async () => {
    vi.useFakeTimers();
    let rejectCreate: ((error: Error) => void) | undefined;
    persistence.createGeneration.mockImplementationOnce(() => new Promise<never>((_resolve, reject) => {
      rejectCreate = reject;
    }));
    const invoke = vi.fn();
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);

    rejectCreate?.(new Error('late database rejection'));
    await vi.advanceTimersByTimeAsync(0);
    expect(observed.current?.status).toBe('rejected');
  });

  it('does not start a failure write when completion persistence hangs past the deadline', async () => {
    vi.useFakeTimers();
    persistence.completeGeneration.mockImplementationOnce(() => new Promise<never>(() => undefined));
    const invoke = vi.fn(async () => ({
      output: { items: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 50,
      rawStatus: 200,
    }));
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not let completion persistence resolve in a microtask after abort', async () => {
    vi.useFakeTimers();
    let providerSignal: AbortSignal | undefined;
    persistence.completeGeneration.mockImplementationOnce(() => new Promise<void>((resolve) => {
      providerSignal?.addEventListener('abort', () => {
        queueMicrotask(resolve);
      }, { once: true });
    }));
    const invoke = vi.fn(async ({ signal }: { signal: AbortSignal }) => {
      providerSignal = signal;
      return {
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      };
    });
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).not.toHaveBeenCalled();
  });

  it('does not return success when completion persistence crosses the monotonic deadline', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    persistence.completeGeneration.mockImplementationOnce(async () => {
      monotonicNow = 15_001;
    });
    const invoke = vi.fn(async () => ({
      output: { items: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 50,
      rawStatus: 200,
    }));

    await expect(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    })).rejects.toSatisfy((error: unknown) => classifyAiError(error) === 'timeout');

    expect(persistence.completeGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves the provider error when failure persistence hangs to the deadline', async () => {
    vi.useFakeTimers();
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    persistence.failGeneration.mockImplementationOnce(() => new Promise<never>(() => undefined));
    const invoke = vi.fn(async () => {
      throw primaryError;
    });
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(observed.current.error).toBe(primaryError);
    }
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
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
    expect(invoke).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not start fallback when the primary timeout consumes the end-to-end deadline', async () => {
    vi.useFakeTimers();
    const primaryError = new Error('primary timed out');
    const invoke = vi.fn(({ policy, signal }: { policy: { provider: string }; signal: AbortSignal }) => {
      if (policy.provider === 'openai') {
        expect(policy.provider).toBe('openai');
        return new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(primaryError), { once: true });
        });
      }
      return Promise.resolve({
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      });
    });

    const execution = executeAiTask({ task: 'food_parse', prompt: 'one apple', invoke });
    const outcome = execution.then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    const settled = await outcome;

    expect(settled.status).toBe('rejected');
    if (settled.status === 'rejected') expect(settled.error).toBe(primaryError);
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts the exact fallback signal at the shared 15-second deadline', async () => {
    vi.useFakeTimers();
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    const fallbackError = new Error('fallback aborted');
    const startedAt = Date.now();
    let fallbackSignal: AbortSignal | undefined;
    let fallbackStartedAt: number | undefined;
    let fallbackAbortedAt: number | undefined;

    const invoke = vi.fn(({ policy, signal }: {
      policy: { provider: string };
      signal: AbortSignal;
    }) => {
      if (policy.provider === 'openai') {
        return new Promise<never>((_, reject) => {
          setTimeout(() => reject(primaryError), 14_000);
        });
      }
      fallbackStartedAt = Date.now();
      fallbackSignal = signal;
      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          fallbackAbortedAt = Date.now();
          reject(fallbackError);
        }, { once: true });
      });
    });

    const execution = executeAiTask({ task: 'food_parse', prompt: 'one apple', invoke });
    const outcome = execution.then(
      () => undefined,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(14_000);
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(fallbackStartedAt).toBe(startedAt + 14_000);
    expect(fallbackSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(999);
    expect(fallbackSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(24_001);
    const rejection = await outcome;
    expect(rejection).toBe(fallbackError);
    expect(fallbackAbortedAt).toBe(startedAt + 15_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the chain deadline stable across a forward wall-clock shift', async () => {
    vi.useFakeTimers();
    const wallClockAtStart = Date.now();
    orgBudget.resolveOrganizationId.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      setTimeout(() => {
        vi.setSystemTime(wallClockAtStart + 3_600_000);
        resolve(undefined);
      }, 1_000);
    }));
    const providerError = new Error('provider aborted at monotonic deadline');
    let providerSignal: AbortSignal | undefined;
    const invoke = vi.fn(({ signal }: { signal: AbortSignal }) => {
      providerSignal = signal;
      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(providerError), { once: true });
      });
    });
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(1_000);
    expect(observed.current).toBeUndefined();
    expect(invoke).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(13_999);
    expect(observed.current).toBeUndefined();
    expect(providerSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(observed.current.error).toBe(providerError);
    }
    expect(providerSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('keeps the chain deadline stable across a backward wall-clock shift', async () => {
    vi.useFakeTimers();
    const wallClockAtStart = Date.now();
    orgBudget.resolveOrganizationId.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      setTimeout(() => {
        vi.setSystemTime(wallClockAtStart - 3_600_000);
        resolve(undefined);
      }, 1_000);
    }));
    const providerError = new Error('provider aborted at monotonic deadline');
    let providerSignal: AbortSignal | undefined;
    const invoke = vi.fn(({ signal }: { signal: AbortSignal }) => {
      providerSignal = signal;
      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(providerError), { once: true });
      });
    });
    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));

    await vi.advanceTimersByTimeAsync(14_999);
    expect(observed.current).toBeUndefined();
    expect(providerSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(observed.current.error).toBe(providerError);
    }
    expect(providerSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts no new work after synchronous time crosses the monotonic deadline', async () => {
    vi.useFakeTimers();
    let monotonicNow = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => monotonicNow);
    orgBudget.resolveOrganizationId.mockImplementationOnce(async () => {
      monotonicNow = 15_001;
      return undefined;
    });
    const invoke = vi.fn(async () => ({
      output: { items: [] },
      usage: { inputTokens: 10, outputTokens: 5 },
      latencyMs: 50,
      rawStatus: 200,
    }));

    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));
    await vi.advanceTimersByTimeAsync(0);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(classifyAiError(observed.current.error)).toBe('timeout');
    }
    expect(orgBudget.assertWithinOrganizationBudget).not.toHaveBeenCalled();
    expect(persistence.createGeneration).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('settles at the deadline when a provider ignores abort and fails later', async () => {
    vi.useFakeTimers();
    const primaryError = typedProviderError('late primary failure', { status: 503 });
    const invoke = vi.fn(({ policy }: { policy: { provider: string } }) => {
      if (policy.provider === 'openai') {
        return new Promise<never>((_, reject) => {
          setTimeout(() => reject(primaryError), 16_000);
        });
      }
      return Promise.resolve({
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      });
    });

    const execution = executeAiTask({ task: 'food_parse', prompt: 'one apple', invoke });
    const outcome = execution.then(
      (value) => ({ status: 'resolved' as const, value }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );
    await vi.advanceTimersByTimeAsync(15_000);
    const settled = await outcome;

    expect(settled.status).toBe('rejected');
    if (settled.status === 'rejected') {
      expect(settled.error).not.toBe(primaryError);
      expect(classifyAiError(settled.error)).toBe('timeout');
    }
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(1_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a fast-failure fallback by the remaining end-to-end deadline', async () => {
    vi.useFakeTimers();
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    const fallbackError = new Error('fallback deadline reached');
    const startedAt = Date.now();
    let fallbackSignal: AbortSignal | undefined;
    let fallbackAbortedAt: number | undefined;

    const invoke = vi.fn(({ policy, signal }: {
      policy: { provider: string };
      signal: AbortSignal;
    }) => {
      if (policy.provider === 'openai') {
        return new Promise<never>((_, reject) => {
          setTimeout(() => reject(primaryError), 1_000);
        });
      }
      fallbackSignal = signal;
      return new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => {
          fallbackAbortedAt = Date.now();
          reject(fallbackError);
        }, { once: true });
      });
    });

    const execution = executeAiTask({ task: 'food_parse', prompt: 'one apple', invoke });
    const outcome = execution.then(
      () => undefined,
      (error: unknown) => error,
    );

    await vi.advanceTimersByTimeAsync(1_000);
    expect(invoke).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(13_999);
    expect(fallbackSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(11_001);
    const rejection = await outcome;
    expect(rejection).toBe(fallbackError);
    expect(fallbackAbortedAt).toBe(startedAt + 15_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs fallback only when the fallback provider invocation starts', async () => {
    const events: string[] = [];
    persistence.createGeneration.mockImplementation(async (input: {
      policy: { provider: string };
    }) => {
      events.push(`create:${input.policy.provider}`);
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {
      events.push('warn:fallback-start');
    });
    const invoke = vi.fn(async ({ policy }: { policy: { provider: string } }) => {
      events.push(`invoke:${policy.provider}`);
      if (policy.provider === 'openai') {
        throw typedProviderError('primary unavailable', { status: 503 });
      }
      return fallbackSuccess;
    });

    await executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    });

    expect(events).toEqual([
      'create:openai',
      'invoke:openai',
      'create:anthropic',
      'warn:fallback-start',
      'invoke:anthropic',
    ]);
  });

  it('skips fallback persistence when the budget recheck exhausts the deadline', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    orgBudget.assertWithinOrganizationBudget
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<never>(() => undefined));

    const invoke = vi.fn(({ policy }: { policy: { provider: string } }) => {
      if (policy.provider === 'openai') {
        return new Promise<never>((_, reject) => {
          setTimeout(() => reject(primaryError), 14_000);
        });
      }
      return Promise.resolve({
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      });
    });

    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(observed.current.error).toBe(primaryError);
    }
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledOnce();
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not invoke a provider when generation persistence consumes the deadline', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    persistence.createGeneration
      .mockResolvedValueOnce(undefined)
      .mockImplementationOnce(() => new Promise<never>(() => undefined));

    const invoke = vi.fn(({ policy }: { policy: { provider: string } }) => {
      if (policy.provider === 'openai') {
        return new Promise<never>((_, reject) => {
          setTimeout(() => reject(primaryError), 14_000);
        });
      }
      return Promise.resolve({
        output: { items: [] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      });
    });

    const observed = observeOutcome(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    }));
    await vi.advanceTimersByTimeAsync(15_000);

    expect(observed.current?.status).toBe('rejected');
    if (observed.current?.status === 'rejected') {
      expect(observed.current.error).toBe(primaryError);
    }
    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledTimes(2);
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not replace a pre-deadline fallback setup timeout with the primary error', async () => {
    const primaryError = typedProviderError('primary unavailable', { status: 503 });
    const fallbackSetupError = typedProviderError('fallback setup timeout', { _isTimeout: true });
    persistence.createGeneration
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(fallbackSetupError);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invoke = vi.fn(async () => {
      throw primaryError;
    });

    await expect(executeAiTask({
      task: 'food_parse',
      prompt: 'one apple',
      invoke,
    })).rejects.toBe(fallbackSetupError);

    expect(invoke).toHaveBeenCalledOnce();
    expect(persistence.createGeneration).toHaveBeenCalledTimes(2);
    expect(persistence.failGeneration).toHaveBeenCalledOnce();
    expect(warn).not.toHaveBeenCalled();
  });

  it('accepts the largest timer duration Node schedules without overflow', async () => {
    vi.useFakeTimers();
    const originalTimeoutMs = taskPolicies.food_parse.timeoutMs;
    taskPolicies.food_parse.timeoutMs = 2_147_483_647;

    try {
      await expect(executeAiTask({
        task: 'food_parse',
        prompt: 'one apple',
        invoke: vi.fn(async () => ({
          output: { items: [] },
          usage: { inputTokens: 10, outputTokens: 5 },
          latencyMs: 50,
          rawStatus: 200,
        })),
      })).resolves.toMatchObject({ output: { items: [] } });
    } finally {
      taskPolicies.food_parse.timeoutMs = originalTimeoutMs;
    }

    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    0,
    -1,
    2_147_483_648,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid attempt timeout %s before persistence or invocation', async (timeoutMs) => {
    const originalTimeoutMs = taskPolicies.food_parse.timeoutMs;
    const invoke = vi.fn();
    taskPolicies.food_parse.timeoutMs = timeoutMs;

    try {
      await expect(executeAiTask({
        task: 'food_parse',
        prompt: 'one apple',
        invoke,
      })).rejects.toThrow(/positive finite integer.*2,147,483,647/);
    } finally {
      taskPolicies.food_parse.timeoutMs = originalTimeoutMs;
    }

    expect(invoke).not.toHaveBeenCalled();
    expect(persistence.createGeneration).not.toHaveBeenCalled();
  });

  it.each([
    ['success', false],
    ['failure', true],
  ] as const)('clears the attempt deadline timer after %s', async (_label, shouldFail) => {
    vi.useFakeTimers();
    const providerError = typedProviderError('invalid request', {
      status: 400,
      code: 'invalid_request_error',
    });
    const invoke = vi.fn(async () => {
      if (shouldFail) throw providerError;
      return {
        output: { suggestions: ['meal'] },
        usage: { inputTokens: 10, outputTokens: 5 },
        latencyMs: 50,
        rawStatus: 200,
      };
    });

    const execution = executeAiTask({
      task: 'meal_suggest',
      prompt: 'suggest a meal',
      invoke,
    });
    if (shouldFail) {
      await expect(execution).rejects.toBe(providerError);
    } else {
      await expect(execution).resolves.toMatchObject({ output: { suggestions: ['meal'] } });
    }

    expect(vi.getTimerCount()).toBe(0);
  });
});
