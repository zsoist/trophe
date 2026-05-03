import { db } from '@/db/client';
import { agentRuns } from '@/db/schema/agent_runs';

export interface AgentRunLogEntry {
  traceId?: string | null;
  taskName: string;
  provider: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  costUsd?: number;
  latencyMs?: number;
  rawStatus?: number;
  errorMessage?: string;
  userId?: string;
}

export function logAgentRun(entry: AgentRunLogEntry): void {
  db.insert(agentRuns).values({
    traceId: entry.traceId ?? undefined,
    taskName: entry.taskName,
    provider: entry.provider,
    model: entry.model,
    tokensIn: entry.tokensIn ?? 0,
    tokensOut: entry.tokensOut ?? 0,
    cacheReadTokens: entry.cacheReadTokens ?? 0,
    cacheWriteTokens: entry.cacheWriteTokens ?? 0,
    costUsd: entry.costUsd,
    latencyMs: entry.latencyMs,
    rawStatus: entry.rawStatus,
    errorMessage: entry.errorMessage,
    userId: entry.userId,
  }).catch((err) => {
    console.error(`[agent-runs] Failed to write ${entry.taskName}:`, err);
  });
}
