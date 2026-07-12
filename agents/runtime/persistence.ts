import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';
import { eq, sql } from 'drizzle-orm';
import { resolveOrganizationId } from './org-budget';
import type { AiTaskContext, AiUsage } from './types';
import type { RoutingPolicy, TaskName } from '@/agents/router/policies';
import { AiProviderError, providerErrorMetadata } from './providers/errors';

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
  providerRequestId?: string;
  clientRequestId?: string;
}): Promise<void> {
  const diagnosticMetadata = Object.fromEntries(Object.entries({
    providerRequestId: input.providerRequestId,
    clientRequestId: input.clientRequestId,
  }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0));
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
    metadata: sql`coalesce(${agentRuns.metadata}, '{}'::jsonb) || ${JSON.stringify(diagnosticMetadata)}::jsonb`,
    completedAt: new Date(),
  }).where(eq(agentRuns.generationId, input.generationId));
}

export interface FailedGenerationEvidence {
  usage?: AiUsage;
  estimatedCostUsd?: number;
  latencyMs?: number;
  rawStatus?: number;
  providerGenerationId?: string;
  providerRequestId?: string;
  clientRequestId?: string;
}

export async function failGeneration(
  generationId: string,
  error: unknown,
  evidence: FailedGenerationEvidence = {},
): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const providerError = error instanceof AiProviderError ? error : undefined;
  const usage = evidence.usage ?? providerError?.usage;
  const rawStatus = evidence.rawStatus ?? providerError?.status;
  const diagnosticMetadata = {
    ...providerErrorMetadata(error),
    ...Object.fromEntries(Object.entries({
      providerRequestId: evidence.providerRequestId,
      clientRequestId: evidence.clientRequestId,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0)),
  };
  await db.update(agentRuns).set({
    status: 'failed',
    rawStatus,
    providerGenerationId: evidence.providerGenerationId ?? providerError?.providerGenerationId,
    tokensIn: usage?.inputTokens,
    tokensOut: usage?.outputTokens,
    cacheReadTokens: usage?.cacheReadTokens,
    cacheWriteTokens: usage?.cacheWriteTokens,
    reasoningTokens: usage?.reasoningTokens,
    cachedTokens: usage?.cachedTokens,
    costUsd: evidence.estimatedCostUsd,
    estimatedCostUsd: evidence.estimatedCostUsd,
    latencyMs: evidence.latencyMs ?? providerError?.latencyMs,
    errorMessage: message.slice(0, 500),
    metadata: sql`coalesce(${agentRuns.metadata}, '{}'::jsonb) || ${JSON.stringify(diagnosticMetadata)}::jsonb`,
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
