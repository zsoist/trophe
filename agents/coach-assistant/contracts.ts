/** Browser-safe contract. No auth, database, provider or environment imports. */
export const COACH_CONTRACT_VERSION = 'coach-assistant.v1' as const;
export type CoachIntent = 'today' | 'week' | 'plan';
export interface CoachRequest {
  message: string;
  intent: CoachIntent;
  clientId?: string;
  exerciseId?: string;
}
export type CoachMode = 'offline' | 'model';
export type CoachErrorCode = 'disabled' | 'unauthenticated' | 'forbidden' | 'invalid_input'
  | 'invalid_timezone' | 'query_failed' | 'cancelled' | 'deadline' | 'provider_unavailable'
  | 'invalid_output' | 'budget_blocked' | 'context_limit' | 'rate_limited';
export interface CoachWindow { start: string; end: string; days: number; timezone: string }
export interface CoachEvidence {
  id: string;
  source: 'plan' | 'workout' | 'nutrition' | 'exercise';
  sourceIds: string[];
  window: CoachWindow;
  completeness: 'complete' | 'partial';
  /** Deterministically computed display statement; render as plain text. */
  statement: string;
  value: number | string;
  unit: string | null;
}
export interface CoachOutput {
  answer: string;
  evidenceRefs: string[];
  limitations: string[];
  suggestions: string[];
  escalation: { required: boolean; reason: string | null; draft: string | null };
}
export interface CoachTelemetry {
  model: string | null;
  provider: 'openai' | null;
  promptVersion: string;
  modelCalls: number;
  dataReads: number;
  tokensIn: number;
  tokensOut: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  latencyMs: number;
  /** Null means unknown, never free by implication. */
  costUsd: number | null;
  pricingVersion: string;
}
export interface CoachResponse {
  version: typeof COACH_CONTRACT_VERSION;
  ok: boolean;
  mode: CoachMode;
  dataSource: 'synthetic' | 'authorized_records';
  output?: CoachOutput;
  error?: { code: CoachErrorCode; retryable: boolean };
  evidence: CoachEvidence[];
  telemetry: CoachTelemetry;
}
