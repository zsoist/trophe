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

function assertValidTimeoutMs(timeoutMs: number): void {
  if (!Number.isFinite(timeoutMs) || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('AI attempt timeout must be a positive finite integer');
  }
}

function remainingAttemptTimeoutMs(policy: RoutingPolicy, deadlineAt: number): number | undefined {
  assertValidTimeoutMs(policy.timeoutMs);
  const remainingChainMs = deadlineAt - Date.now();
  if (
    !Number.isFinite(remainingChainMs)
    || !Number.isInteger(remainingChainMs)
    || remainingChainMs <= 0
  ) {
    return undefined;
  }
  return Math.min(policy.timeoutMs, remainingChainMs);
}

/**
 * @returns result on success
 * @throws tagged Error with `_isTimeout = true` when the internal timer fires
 */
async function attemptInvoke<T>(
  input: ExecuteAiTaskInput<T>,
  policy: RoutingPolicy,
  timeoutMs: number,
  context: ExecuteAiTaskInput<T>['context'],
  isFallback: boolean,
  fallbackFrom?: string,
): Promise<ExecuteAiTaskResult<T>> {
  assertValidTimeoutMs(timeoutMs);
  assertWithinRequestBudget(policy, input.prompt);

  const generationId = randomUUID();
  const promptHash = createHash('sha256')
    .update(`${policy.promptVersion}\0${input.systemPrompt ?? ''}\0${input.prompt}`)
    .digest('hex');
  const traceUserId = context?.userId
    ? `trophe_${createHash('sha256').update(context.userId).digest('hex').slice(0, 32)}`
    : undefined;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let generationCreated = false;

  try {
    await createGeneration({ generationId, task: input.task, policy, promptHash, context, fallbackFrom });
    generationCreated = true;
    if (controller.signal.aborted) {
      throw new Error('AI attempt deadline elapsed before provider invocation');
    }

    let providerResult: ProviderResult<T> | undefined;
    await traced({
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
      providerResult = await input.invoke({ policy, signal: controller.signal });
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
    });
    if (!providerResult) throw new Error('AI provider returned no result');

    const estimatedCostUsd = estimateUsageCost(policy.model, providerResult.usage);
    if (estimatedCostUsd > policy.maxCostUsd) {
      throw new Error(`AI request exceeded cost ceiling (${estimatedCostUsd.toFixed(4)} USD)`);
    }
    await completeGeneration({ generationId, ...providerResult, estimatedCostUsd });
    return { generationId, estimatedCostUsd, selectedPolicy: policy, isFallback, ...providerResult };
  } catch (error) {
    if (generationCreated) {
      await failGeneration(generationId, error, policy.model).catch((persistenceError) => {
        console.error('[ai-runtime] Failed to persist generation failure:', persistenceError);
      });
    }
    if (generationCreated && error instanceof Error) {
      Object.defineProperty(error, '_generationId', {
        value: generationId,
        enumerable: false,
        configurable: true,
      });
      if (controller.signal.aborted) {
        Object.defineProperty(error, '_isTimeout', { value: true, enumerable: false, configurable: true });
      }
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public entry point with fallback chain ─────────────────────────────────

export async function executeAiTask<T>(input: ExecuteAiTaskInput<T>): Promise<ExecuteAiTaskResult<T>> {
  const policy = pick(input.task);
  assertValidTimeoutMs(policy.timeoutMs);
  const deadlineAt = Date.now() + policy.timeoutMs;
  const organizationId = await resolveOrganizationId(input.context);
  await assertWithinOrganizationBudget(organizationId, input.context?.userId);
  const context = organizationId ? { ...input.context, organizationId } : input.context;
  const primaryTimeoutMs = remainingAttemptTimeoutMs(policy, deadlineAt);
  if (primaryTimeoutMs === undefined) {
    throw new RangeError('AI attempt timeout must be a positive finite integer');
  }

  try {
    return await attemptInvoke(
      input,
      policy,
      primaryTimeoutMs,
      context,
      false,
    );
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
    ) {
      throw primaryError;
    }

    if (remainingAttemptTimeoutMs(fallback, deadlineAt) === undefined) throw primaryError;

    // Re-check org budget (the failed attempt may have consumed budget)
    await assertWithinOrganizationBudget(organizationId, input.context?.userId);
    const fallbackTimeoutMs = remainingAttemptTimeoutMs(fallback, deadlineAt);
    if (fallbackTimeoutMs === undefined) throw primaryError;

    console.warn(
      `[ai-runtime] ${input.task}: ${policy.provider}/${policy.model} failed (${category}) → ` +
      `fallback ${fallback.provider}/${fallback.model}`,
    );

    return await attemptInvoke(input, fallback, fallbackTimeoutMs, context, true, policy.model);
  }
}
