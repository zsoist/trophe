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


/** Single browser-safe contract for the shared Food/Workout conversation. */
export const COACH_CONVERSATION_VERSION = 'coach-assistant.v2' as const;
export type CoachCapabilityStatus = 'available' | 'unknown' | 'unauthorized' | 'not_connected';
export type CoachSurface = 'home' | 'food' | 'recipe' | 'workout' | 'plan' | 'live' | 'library' | 'exercise' | 'atlas' | 'history' | 'progress' | 'profile' | 'habits' | 'coach';
export interface CoachContextHint {
  surface: CoachSurface;
  includeScreen: boolean;
  clientId?: string;
  entity?: { kind: 'meal' | 'recipe' | 'session' | 'plan' | 'exercise'; id: string };
}
export interface CoachAttachmentRef {
  id: string;
  kind: 'image' | 'audio';
  /** Opaque reference only. Never a client-selected remote URL or storage path. */
  status: 'pending' | 'available' | 'unknown' | 'unauthorized' | 'not_connected';
}
export interface CoachConversationRequest {
  version: typeof COACH_CONVERSATION_VERSION;
  conversationId: string;
  turnId: string;
  message: string;
  context?: CoachContextHint;
  /** Bounded, untrusted conversational hints, never authorization or evidence. */
  history?: Array<{ role: 'user' | 'assistant'; text: string }>;
  attachments?: CoachAttachmentRef[];
}
export interface CoachCapability {
  key: 'food_records' | 'workout_records' | 'active_plan' | 'screen_entity' | 'model' | 'profile' | 'memory' | 'images' | 'voice' | 'actions';
  status: CoachCapabilityStatus;
  reason: string;
}
export interface CoachContextSnapshot {
  id: string;
  capturedAt: string;
  /** Server-authorized scope; supplied hints cannot populate these fields. */
  subjectId: string;
  organizationId: string;
  surface: CoachSurface | null;
  screenIncluded: boolean;
  window: CoachWindow;
  capabilities: CoachCapability[];
}
export interface CoachProposal {
  id: string;
  hash: string;
  action: 'preference.update' | 'draft.update' | 'memory.confirm' | 'memory.correct' | 'memory.delete';
  resource: { kind: 'preference' | 'draft' | 'memory'; id: string; version: string };
  before: Record<string, string | number | boolean | null>;
  after: Record<string, string | number | boolean | null>;
  precondition: string;
  expiresAt: string;
  reviewRequired: boolean;
}
export interface CoachReceipt {
  id: string;
  actionId: string;
  proposalId: string;
  status: 'applied' | 'rejected' | 'uncertain';
  resourceVersion: string | null;
  recordedAt: string;
}
export interface CoachConversationResponse {
  version: typeof COACH_CONVERSATION_VERSION;
  conversationId: string;
  turnId: string;
  ok: boolean;
  mode: 'offline' | 'model';
  dataSource: CoachResponse['dataSource'];
  snapshot: CoachContextSnapshot | null;
  output?: CoachOutput;
  error?: CoachResponse['error'];
  evidence: CoachEvidence[];
  proposals: CoachProposal[];
  receipts: CoachReceipt[];
  attachments: CoachAttachmentRef[];
  telemetry: CoachTelemetry;
}
