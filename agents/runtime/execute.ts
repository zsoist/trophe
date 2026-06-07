import { createHash, randomUUID } from 'node:crypto';
import { pick } from '@/agents/router';
import { traced } from '@/agents/observability/langfuse';
import { assertWithinRequestBudget } from './budget';
import { estimateUsageCost } from './cost';
import { completeGeneration, createGeneration, failGeneration } from './persistence';
import type { ExecuteAiTaskInput, ExecuteAiTaskResult } from './types';

export async function executeAiTask<T>(input: ExecuteAiTaskInput<T>): Promise<ExecuteAiTaskResult<T>> {
  const policy = pick(input.task);
  assertWithinRequestBudget(policy, input.prompt);

  const generationId = randomUUID();
  const promptHash = createHash('sha256')
    .update(`${policy.promptVersion}\0${input.systemPrompt ?? ''}\0${input.prompt}`)
    .digest('hex');

  await createGeneration({ generationId, task: input.task, policy, promptHash, context: input.context });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);

  try {
    let providerResult: Awaited<ReturnType<typeof input.invoke>> | undefined;
    await traced({
      task: input.task,
      model: policy.model,
      provider: policy.provider,
      prompt: '[redacted]',
      systemPrompt: '[redacted]',
      metadata: { generationId, ...input.context?.metadata },
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
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
