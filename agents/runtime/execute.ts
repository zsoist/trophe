import { createHash, randomUUID } from 'node:crypto';
import { pick } from '@/agents/router';
import { taskFallbacks } from '@/agents/router/policies';
import { traced } from '@/agents/observability/langfuse';
import { assertWithinRequestBudget } from './budget';
import { estimateUsageCost } from './cost';
import { assertWithinOrganizationBudget, resolveOrganizationId } from './org-budget';
import { completeGeneration, createGeneration, failGeneration } from './persistence';
import type { RoutingPolicy } from '@/agents/router/policies';
import type { ExecuteAiTaskInput, ExecuteAiTaskResult, ProviderResult } from './types';

// ── Single-attempt invocation ──────────────────────────────────────────────

/**
 * @returns result on success
 * @throws tagged Error with `_isTimeout = true` when the internal timer fires
 */
async function attemptInvoke<T>(
  input: ExecuteAiTaskInput<T>,
  policy: RoutingPolicy,
  context: ExecuteAiTaskInput<T>['context'],
  isFallback: boolean,
  fallbackFrom?: string,
): Promise<ExecuteAiTaskResult<T>> {
  assertWithinRequestBudget(policy, input.prompt);

  const generationId = randomUUID();
  const promptHash = createHash('sha256')
    .update(`${policy.promptVersion}\0${input.systemPrompt ?? ''}\0${input.prompt}`)
    .digest('hex');

  await createGeneration({ generationId, task: input.task, policy, promptHash, context, fallbackFrom });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);

  try {
    let providerResult: ProviderResult<T> | undefined;
    await traced({
      task: input.task,
      model: policy.model,
      provider: policy.provider,
      prompt: '[redacted]',
      systemPrompt: '[redacted]',
      metadata: { generationId, isFallback, ...input.context?.metadata },
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
    return { generationId, estimatedCostUsd, ...providerResult };
  } catch (error) {
    await failGeneration(generationId, error).catch((persistenceError) => {
      console.error('[ai-runtime] Failed to persist generation failure:', persistenceError);
    });
    // Tag timeout errors so executeAiTask skips fallback — retrying after a
    // deadline has passed is pointless and would double total latency.
    if (controller.signal.aborted && error instanceof Error) {
      Object.defineProperty(error, '_isTimeout', { value: true, enumerable: false });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Public entry point with fallback chain ─────────────────────────────────

export async function executeAiTask<T>(input: ExecuteAiTaskInput<T>): Promise<ExecuteAiTaskResult<T>> {
  const policy = pick(input.task);
  const organizationId = await resolveOrganizationId(input.context);
  await assertWithinOrganizationBudget(organizationId, input.context?.userId);
  const context = organizationId ? { ...input.context, organizationId } : input.context;

  try {
    return await attemptInvoke(input, policy, context, false);
  } catch (primaryError) {
    const fallback = taskFallbacks[input.task];
    // Skip fallback when: no fallback configured, OR the primary timed out
    // (retrying after deadline is pointless — it'd double latency)
    const isTimeout = primaryError && typeof primaryError === 'object' && '_isTimeout' in primaryError;
    if (!fallback || isTimeout) throw primaryError;

    const reason = primaryError instanceof Error ? primaryError.message : String(primaryError);
    console.warn(
      `[ai-runtime] ${input.task}: ${policy.provider}/${policy.model} failed → ` +
      `fallback ${fallback.provider}/${fallback.model} | ${reason}`,
    );

    // Re-check org budget (the failed attempt may have consumed budget)
    await assertWithinOrganizationBudget(organizationId, input.context?.userId);
    return await attemptInvoke(input, fallback, context, true, policy.model);
  }
}
