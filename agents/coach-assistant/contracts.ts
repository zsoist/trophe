import type { WorkoutDraft } from '@/lib/workout/workspace-state';
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
export type CoachSurface = 'home' | 'food' | 'recipe' | 'workout' | 'plan' | 'live' | 'library' | 'exercise' | 'atlas' | 'history' | 'progress' | 'profile' | 'habits' | 'coach' | 'messages' | 'intake' | 'booking' | 'supplements' | 'form_check';
export type CoachActorRole = 'client' | 'coach' | 'admin' | 'super_admin';
export interface CoachContextHint {
  surface: CoachSurface;
  includeScreen: boolean;
  /** Untrusted visible-day hint. The server converts it to an authorized query window. */
  screenDate?: string;
  clientId?: string;
  entity?: { kind: 'meal' | 'recipe' | 'session' | 'plan' | 'exercise'; id: string; version?:string };
  /** Untrusted continuity hint. The server revalidates receipt and refetched entry. */
  foodReceipt?: { entryId:string;actionId:string };
  /** Untrusted local binding hint. The client must compare it with the live workspace again. */
  workspace?: { kind: 'draft'; version: string };
  anatomy?: import('./selection-contracts').CoachAnatomyHint;
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
  history?: Array<{ role: 'user' | 'assistant'; text: string; kind?:'conversation'|'memory_summary'; derivedToken?:string }>;
  attachments?: CoachAttachmentRef[];
}
export interface CoachCapability {
  key: 'food_records' | 'workout_records' | 'active_plan' | 'screen_entity' | 'model' | 'profile' | 'memory' | 'images' | 'voice' | 'actions' | 'progress' | 'messages' | 'intake' | 'booking' | 'supplements' | 'form_check';
  status: CoachCapabilityStatus;
  reason: string;
}
export interface CoachContextSnapshot {
  id: string;
  capturedAt: string;
  /** Server-authorized scope; supplied hints cannot populate these fields. */
  subjectId: string;
  organizationId: string;
  actorRole: CoachActorRole;
  access: 'self' | 'assigned_professional';
  /** Server-derived cache boundary. Changes with actor, subject, tenant or role. */
  scopeKey: string;
  surface: CoachSurface | null;
  screenIncluded: boolean;
  selection?: import('./selection-contracts').CoachSelectionSnapshot;
  language: string;
  /** Current evidence uses these standard units, not an inferred preference. */
  units: { weight: 'kg'; energy: 'kcal'; protein: 'g' };
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
export interface CoachDraftUpdateIntent {
  id: string;
  action: 'draft.update';
  source: 'provider_tool';
  subjectId: string;
  scopeKey: string;
  surface: 'workout' | 'plan';
  resource: { kind: 'draft'; id: string; version: string };
  target: { durationMinutes: number; equipment: ['dumbbells'] };
  reviewRequired: true;
}
export interface CoachWorkoutSetUpdateIntent {
  id: string;
  action: 'workout.set.reps.update';
  source: 'provider_tool';
  subjectId: string;
  scopeKey: string;
  surface: CoachSurface;
  target: { selection: 'latest_open_session_set'; reps: number };
  reviewRequired: true;
}
export interface CoachFoodQuantityUpdateIntent {
  id: string;
  action: 'food.quantity.update';
  source: 'provider_tool';
  subjectId: string;
  scopeKey: string;
  surface: CoachSurface;
  target: { selection: 'authorized_food_entry'; entryHintId: string | null; previousGrams: number; grams: number };
  reviewRequired: true;
}
export type CoachActionIntent = CoachDraftUpdateIntent | CoachWorkoutSetUpdateIntent | CoachFoodQuantityUpdateIntent;
export interface CoachConversationResponse {
  capabilityResult?:import('./capability-registry').CapabilityResult;
  foodPreference?:import('./food-preference-contracts').FoodPreferenceSnapshot;
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
  /** Provider-selected, server-scoped request. This is not a proposal or authority to mutate. */
  actionIntents?: CoachActionIntent[];
  receipts: CoachReceipt[];
  attachments: CoachAttachmentRef[];
  explanations?: Array<{kind:'curated_general';id:string;text:string;source:'coach-general.v1'}>;
  uploads?: { images: true; storage: 'isolated_ephemeral' | 'private_storage'; analysis: 'not_connected' | 'validated_photo_analysis'; limits: typeof COACH_IMAGE_LIMITS };
  telemetry: CoachTelemetry;
}

export interface CoachProfileCard {
  language: string;
  timezone: string;
  units: { weight: 'kg'; energy: 'kcal'; protein: 'g' };
  preferences: { durationMinutes: 20 | 30 | 45 | 60 };
  version: string;
  source: 'authorized_profile' | 'isolated_fixture';
}
export interface CoachMemoryCard {
  id: string;
  text: string;
  source: 'user_input' | 'coach' | 'agent_inference' | 'wearable';
  createdAt: string;
  scope: 'user' | 'session' | 'agent';
  confirmation: 'unconfirmed' | 'confirmed';
  version: string;
}
/** Optional until an authorized backing service is connected. */
export interface CoachConversationResponse {
  profile?: CoachProfileCard;
  memories?: CoachMemoryCard[];
  memoryContext?: {version:string;derivedHistoryToken?:string;historyPolicy:'user_historical_derived_verified'};
}
export type CoachPreferenceOperation = {
  version: typeof COACH_CONVERSATION_VERSION;
  operation: 'propose';
  conversationId: string;
  turnId: string;
  clientId?: string;
  action: 'preference.update';
  resourceVersion: string;
  after: { durationMinutes: 20 | 30 | 45 | 60 };
} | {
  version: typeof COACH_CONVERSATION_VERSION;
  operation: 'apply';
  conversationId: string;
  turnId: string;
  clientId?: string;
  proposalId: string;
  hash: string;
  actionId: string;
  resourceVersion: string;
} | {
  version: typeof COACH_CONVERSATION_VERSION;
  operation: 'receipt';
  conversationId: string;
  turnId: string;
  clientId?: string;
  actionId: string;
};
export interface CoachActionResult {
  version: typeof COACH_CONVERSATION_VERSION;
  ok: boolean;
  storage: 'isolated_ephemeral' | 'database';
  proposal?: CoachProposal;
  receipt?: CoachReceipt;
  error?: 'cancelled' | 'forbidden' | 'invalid_input' | 'version_conflict' | 'expired' | 'not_found' | 'idempotency_conflict' | 'uncertain';
}

export type CoachMemoryOperation = {
  version: typeof COACH_CONVERSATION_VERSION;
  operation: 'propose';
  conversationId: string;
  turnId: string;
  clientId?: string;
  memoryId: string;
  resourceVersion: string;
} & ({action:'memory.confirm'|'memory.delete'} | {action:'memory.correct';after:{text:string}});
export type CoachDraftOperation = {
  version: typeof COACH_CONVERSATION_VERSION; operation: 'propose'; action: 'draft.update';
  conversationId: string; turnId: string; clientId?: string; resourceVersion: string; after: WorkoutDraft;
};
export type CoachOperation = CoachPreferenceOperation | CoachMemoryOperation | CoachDraftOperation;
export interface CoachProposal { draftReview?: { before: WorkoutDraft; after: WorkoutDraft } }
export interface CoachActionResult {
  /** Isolated result for explicit WorkspaceProvider review; never auto-refresh persistent state. */
  draftRefresh?: { draft: WorkoutDraft; previousVersion: string; version: string; reviewRequired: true };
}
export interface CoachActionResult {
  /** Updated isolated copy only; null means deleted. Never a persistent-memory claim. */
  memory?: CoachMemoryCard | null;
  invalidatedMemoryVersions?: Array<{id:string;version:string}>;
}

export const COACH_IMAGE_LIMITS = { count:3, fileBytes:5*1024*1024, totalBytes:15*1024*1024, pixels:16000000 } as const;
export type CoachImageMime = 'image/jpeg' | 'image/png' | 'image/webp';
export type CoachAttachmentOperation = {version:typeof COACH_CONVERSATION_VERSION;conversationId:string} & (
  {operation:'attachment.prepare';requestId?:string;mime:CoachImageMime;bytes:number} |
  {operation:'attachment.status';attachmentId:string} |
  {operation:'attachment.remove';attachmentId:string;reviewed:true}
);
export interface CoachAttachmentResult {
  version:typeof COACH_CONVERSATION_VERSION;
  ok:boolean;
  storage:'isolated_ephemeral'|'private_storage';
  analysis:'not_connected';
  attachment?:CoachAttachmentRef;
  state?:'prepared'|'uploading'|'available'|'removed';
  uploadToken?:string;
  expiresAt?:string;
  metadata?:{mime:CoachImageMime;bytes:number;width:number;height:number};
  error?:'invalid_input'|'forbidden'|'limit_exceeded'|'expired'|'not_found'|'cancelled'|'busy'|'invalid_image';
}
