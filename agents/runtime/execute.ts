import { createHash, randomUUID } from 'node:crypto';
import { pick } from '@/agents/router';
import { taskFallbacks } from '@/agents/router/policies';
import { traced } from '@/agents/observability/langfuse';
import { assertWithinRequestBudget } from './budget';
import { estimateUsageCost } from './cost';
import { classifyAiError, isFallbackEligible } from './error-classification';
import { assertWithinOrganizationBudget, resolveOrganizationId } from './org-budget';
import { completeGeneration, createGeneration, failGeneration } from './persistence';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ExecuteAiTaskInput, ExecuteAiTaskResult, ProviderResult } from './types';

// ── Single-attempt invocation ──────────────────────────────────────────────

const MAX_TIMER_DELAY_MS = 2_147_483_647;

class AiChainDeadlineExceededError extends Error {
  readonly _isTimeout = true;

  constructor() {
    super('AI provider chain deadline exceeded');
    this.name = 'AiChainDeadlineExceededError';
  }
}

interface TimedBoundary {
  signal: AbortSignal;
  deadlineAt: number;
  abortIfExpired: () => void;
  dispose: () => void;
}

function assertValidTimeoutMs(timeoutMs: number): void {
  if (
    !Number.isSafeInteger(timeoutMs)
    || timeoutMs <= 0
    || timeoutMs > MAX_TIMER_DELAY_MS
  ) {
    throw new RangeError(
      'AI attempt timeout must be a positive finite integer no greater than 2,147,483,647',
    );
  }
}

function timeoutError(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new AiChainDeadlineExceededError();
}

function runBeforeAbort<T>(boundary: TimedBoundary, start: () => Promise<T> | T): Promise<T> {
  boundary.abortIfExpired();
  const { signal } = boundary;
  if (signal.aborted) return Promise.reject(timeoutError(signal));

  let operation: Promise<T>;
  try {
    operation = Promise.resolve(start());
  } catch (error) {
    return Promise.reject(error);
  }

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener('abort', onAbort);
    const settleSuccess = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const settleFailure = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onAbort = () => settleFailure(timeoutError(signal));
    const settleOperationSuccess = (value: T) => {
      boundary.abortIfExpired();
      if (signal.aborted) {
        settleFailure(timeoutError(signal));
        return;
      }
      settleSuccess(value);
    };
    const settleOperationFailure = (error: unknown) => {
      boundary.abortIfExpired();
      settleFailure(signal.aborted ? timeoutError(signal) : error);
    };

    signal.addEventListener('abort', onAbort, { once: true });
    operation.then(
      settleOperationSuccess,
      settleOperationFailure,
    );
    if (signal.aborted) onAbort();
  });
}

function createTimedBoundary(timeoutMs: number, parent?: TimedBoundary): TimedBoundary {
  assertValidTimeoutMs(timeoutMs);
  const controller = new AbortController();
  const deadlineAt = Math.min(
    performance.now() + timeoutMs,
    parent?.deadlineAt ?? Number.POSITIVE_INFINITY,
  );
  const abortFromParent = () => controller.abort(timeoutError(parent!.signal));
  if (parent?.signal.aborted) {
    abortFromParent();
  } else {
    parent?.signal.addEventListener('abort', abortFromParent, { once: true });
  }
  const timer = setTimeout(
    () => controller.abort(new AiChainDeadlineExceededError()),
    Math.max(0, deadlineAt - performance.now()),
  );

  return {
    signal: controller.signal,
    deadlineAt,
    abortIfExpired: () => {
      parent?.abortIfExpired();
      if (!controller.signal.aborted && performance.now() >= deadlineAt) {
        controller.abort(new AiChainDeadlineExceededError());
      }
    },
    dispose: () => {
      clearTimeout(timer);
      parent?.signal.removeEventListener('abort', abortFromParent);
    },
  };
}

/**
 * @returns result on success
 * @throws tagged Error with `_isTimeout = true` when the internal timer fires
 */
async function attemptInvoke<T>(
  input: ExecuteAiTaskInput<T>,
  policy: RoutingPolicy,
  chainBoundary: TimedBoundary,
  context: ExecuteAiTaskInput<T>['context'],
  isFallback: boolean,
  fallbackFrom?: string,
  onProviderStart?: () => void,
): Promise<ExecuteAiTaskResult<T>> {
  assertValidTimeoutMs(policy.timeoutMs);
  assertWithinRequestBudget(policy, input.prompt);

  const generationId = randomUUID();
  const promptHash = createHash('sha256')
    .update(`${policy.promptVersion}\0${input.systemPrompt ?? ''}\0${input.prompt}`)
    .digest('hex');
  const traceUserId = context?.userId
    ? `trophe_${createHash('sha256').update(context.userId).digest('hex').slice(0, 32)}`
    : undefined;

  const attemptBoundary = createTimedBoundary(policy.timeoutMs, chainBoundary);
  const signal = attemptBoundary.signal;
  let generationCreated = false;
  let providerStarted = false;
  let providerRejected = false;
  let providerError: unknown;

  try {
    await runBeforeAbort(attemptBoundary, () => createGeneration({
      generationId,
      task: input.task,
      policy,
      promptHash,
      context,
      fallbackFrom,
    }));
    generationCreated = true;

    let providerResult: ProviderResult<T> | undefined;
    await runBeforeAbort(attemptBoundary, () => traced({
      task: input.task,
      model: policy.model,
      provider: policy.provider,
      prompt: '[redacted]',
      systemPrompt: '[redacted]',
      metadata: {
        ...context?.metadata,
        ...(traceUserId ? { userId: traceUserId } : {}),
        generationId,
        isFallback,
        promptVersion: policy.promptVersion,
      },
    }, async () => {
      attemptBoundary.abortIfExpired();
      if (signal.aborted) throw timeoutError(signal);
      onProviderStart?.();
      providerStarted = true;
      let invocation: Promise<ProviderResult<T>>;
      try {
        invocation = Promise.resolve(input.invoke({ policy, signal }));
      } catch (error) {
        providerRejected = true;
        providerError = error;
        throw error;
      }
      void invocation.then(undefined, (error: unknown) => {
        providerRejected = true;
        providerError = error;
      });
      providerResult = await invocation;
      return {
        text: '[structured output redacted]',
        usage: {
          input_tokens: providerResult.usage.inputTokens,
          output_tokens: providerResult.usage.outputTokens,
          cache_creation_input_tokens: providerResult.usage.cacheWriteTokens,
          cache_read_input_tokens: providerResult.usage.cacheReadTokens,
        },
        latencyMs: providerResult.latencyMs,
        rawStatus: providerResult.rawStatus,
      };
    }));
    if (!providerResult) throw new Error('AI provider returned no result');

    const estimatedCostUsd = estimateUsageCost(policy.model, providerResult.usage);
    if (estimatedCostUsd > policy.maxCostUsd) {
      throw new Error(`AI request exceeded cost ceiling (${estimatedCostUsd.toFixed(4)} USD)`);
    }
    await runBeforeAbort(attemptBoundary, () => completeGeneration({
      generationId,
      ...providerResult!,
      estimatedCostUsd,
    }));
    return { generationId, estimatedCostUsd, selectedPolicy: policy, isFallback, ...providerResult };
  } catch (error) {
    if (signal.aborted && providerStarted && !providerRejected) {
      // An abort-aware provider can reject from its signal handler just after
      // the boundary wins the race. Let that already-started invocation expose
      // its typed error without delaying the public deadline.
      await Promise.resolve();
      await Promise.resolve();
    }
    const surfacedError = signal.aborted && providerRejected ? providerError : error;
    if (generationCreated && !signal.aborted) {
      try {
        await runBeforeAbort(
          attemptBoundary,
          () => failGeneration(generationId, surfacedError, policy.model),
        );
      } catch (persistenceError) {
        if (!signal.aborted) {
          console.error('[ai-runtime] Failed to persist generation failure:', persistenceError);
        }
      }
    }
    if (generationCreated && surfacedError instanceof Error) {
      Object.defineProperty(surfacedError, '_generationId', {
        value: generationId,
        enumerable: false,
        configurable: true,
      });
      if (signal.aborted) {
        Object.defineProperty(surfacedError, '_isTimeout', {
          value: true,
          enumerable: false,
          configurable: true,
        });
      }
    }
    throw surfacedError;
  } finally {
    attemptBoundary.dispose();
  }
}

// ── Public entry point with fallback chain ─────────────────────────────────

export async function executeAiTask<T>(input: ExecuteAiTaskInput<T>): Promise<ExecuteAiTaskResult<T>> {
  const policy = pick(input.task);
  assertValidTimeoutMs(policy.timeoutMs);
  const chainBoundary = createTimedBoundary(policy.timeoutMs);

  try {
    const organizationId = await runBeforeAbort(
      chainBoundary,
      () => resolveOrganizationId(input.context),
    );
    await runBeforeAbort(
      chainBoundary,
      () => assertWithinOrganizationBudget(organizationId, input.context?.userId),
    );
    const context = organizationId ? { ...input.context, organizationId } : input.context;

    try {
      return await attemptInvoke(input, policy, chainBoundary, context, false);
    } catch (primaryError) {
      const fallback = taskFallbacks[input.task];
      const category = classifyAiError(primaryError);
      // Most tasks skip fallback after timeout to avoid doubling response latency.
      // Tasks with an explicitly bounded end-to-end chain may opt in.
      const isTimeout = category === 'timeout';
      const isIdenticalFallback = fallback?.provider === policy.provider
        && fallback.model === policy.model;
      if (
        !fallback
        || !isFallbackEligible(category)
        || (isTimeout && !policy.fallbackOnTimeout)
        || isIdenticalFallback
        || chainBoundary.signal.aborted
      ) {
        throw primaryError;
      }

      try {
        // Re-check org budget (the failed attempt may have consumed budget)
        await runBeforeAbort(
          chainBoundary,
          () => assertWithinOrganizationBudget(organizationId, input.context?.userId),
        );
      } catch (fallbackSetupError) {
        if (chainBoundary.signal.aborted) throw primaryError;
        throw fallbackSetupError;
      }

      let fallbackProviderStarted = false;
      try {
        return await attemptInvoke(
          input,
          fallback,
          chainBoundary,
          context,
          true,
          policy.model,
          () => {
            fallbackProviderStarted = true;
            console.warn(
              `[ai-runtime] ${input.task}: ${policy.provider}/${policy.model} failed (${category}) → ` +
              `fallback ${fallback.provider}/${fallback.model}`,
            );
          },
        );
      } catch (fallbackError) {
        if (
          !fallbackProviderStarted
          && chainBoundary.signal.aborted
          && classifyAiError(fallbackError) === 'timeout'
        ) {
          throw primaryError;
        }
        throw fallbackError;
      }
    }
  } finally {
    chainBoundary.dispose();
  }
}
