import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';
import { eq, sql } from 'drizzle-orm';
import { estimateModelCostUsd } from '@/agents/router/pricing';
import { resolveOrganizationId } from './org-budget';
import { providerErrorTelemetry } from './provider-error';
import type { AiTaskContext, AiUsage } from './types';
import type { RoutingPolicy, TaskName } from '@/agents/router/policies';

export async function createGeneration(input: {
  generationId: string;
  task: TaskName;
  policy: RoutingPolicy;
  promptHash: string;
  context?: AiTaskContext;
  fallbackFrom?: string;
}): Promise<void> {
  const organizationId = await resolveOrganizationId(input.context);

  await db.insert(agentRuns).values({
    generationId: input.generationId,
    requestId: input.context?.requestId,
    organizationId,
    userId: input.context?.userId,
    taskName: input.task,
    provider: input.policy.provider,
    model: input.policy.model,
    promptVersion: input.policy.promptVersion,
    promptHash: input.promptHash,
    status: 'pending',
    metadata: input.context?.metadata,
    fallbackFrom: input.fallbackFrom,
  });
}

export async function completeGeneration(input: {
  generationId: string;
  usage: AiUsage;
  estimatedCostUsd: number;
  latencyMs: number;
  rawStatus: number;
  providerGenerationId?: string;
}): Promise<void> {
  await db.update(agentRuns).set({
    status: 'completed',
    providerGenerationId: input.providerGenerationId,
    tokensIn: input.usage.inputTokens,
    tokensOut: input.usage.outputTokens,
    cacheReadTokens: input.usage.cacheReadTokens ?? 0,
    cacheWriteTokens: input.usage.cacheWriteTokens ?? 0,
    reasoningTokens: input.usage.reasoningTokens ?? 0,
    cachedTokens: input.usage.cachedTokens ?? 0,
    costUsd: input.usage.actualCostUsd ?? input.estimatedCostUsd,
    estimatedCostUsd: input.estimatedCostUsd,
    actualCostUsd: input.usage.actualCostUsd,
    latencyMs: input.latencyMs,
    rawStatus: input.rawStatus,
    completedAt: new Date(),
  }).where(eq(agentRuns.generationId, input.generationId));
}

export async function failGeneration(generationId: string, error: unknown, model: string): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const telemetry = providerErrorTelemetry(error);
  const estimatedCostUsd = telemetry.usage
    ? estimateModelCostUsd(
        model,
        telemetry.usage.inputTokens,
        telemetry.usage.outputTokens,
        telemetry.usage.cacheReadTokens ?? 0,
        telemetry.usage.cacheWriteTokens ?? 0,
      )
    : undefined;
  await db.update(agentRuns).set({
    status: 'failed',
    errorMessage: message.slice(0, 500),
    rawStatus: telemetry.rawStatus,
    ...(telemetry.usage ? {
      tokensIn: telemetry.usage.inputTokens,
      tokensOut: telemetry.usage.outputTokens,
      cacheReadTokens: telemetry.usage.cacheReadTokens ?? 0,
      cacheWriteTokens: telemetry.usage.cacheWriteTokens ?? 0,
      reasoningTokens: telemetry.usage.reasoningTokens ?? 0,
      costUsd: estimatedCostUsd,
      estimatedCostUsd,
    } : {}),
    ...(telemetry.latencyMs != null ? { latencyMs: telemetry.latencyMs } : {}),
    ...(telemetry.providerGenerationId ? { providerGenerationId: telemetry.providerGenerationId } : {}),
    ...(telemetry.metadata ? {
      metadata: sql`coalesce(${agentRuns.metadata}, '{}'::jsonb) || ${JSON.stringify(telemetry.metadata)}::jsonb`,
    } : {}),
    completedAt: new Date(),
  }).where(eq(agentRuns.generationId, generationId));
}

export async function annotateGenerationMetadata(
  generationId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.update(agentRuns).set({
    metadata: sql`coalesce(${agentRuns.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
  }).where(eq(agentRuns.generationId, generationId));
}
