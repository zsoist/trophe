import type { TaskName, RoutingPolicy } from '@/agents/router/policies';

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  reasoningTokens?: number;
  cachedTokens?: number;
  actualCostUsd?: number;
}

export interface ProviderResult<T> {
  output: T;
  usage: AiUsage;
  latencyMs: number;
  rawStatus: number;
  providerGenerationId?: string;
}

export interface AiTaskContext {
  userId?: string;
  organizationId?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

export interface ExecuteAiTaskInput<T> {
  task: TaskName;
  prompt: string;
  systemPrompt?: string;
  context?: AiTaskContext;
  invoke: (args: { policy: RoutingPolicy; signal: AbortSignal }) => Promise<ProviderResult<T>>;
}

export interface ExecuteAiTaskResult<T> extends ProviderResult<T> {
  generationId: string;
  estimatedCostUsd: number;
  selectedPolicy: RoutingPolicy;
  isFallback: boolean;
}
