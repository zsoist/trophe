import type { CoachConversationResponse, CoachSurface, CoachWorkoutSetUpdateIntent } from '@/agents/coach-assistant/contracts';

/** Accepts only the single server-bound intent for the current self conversation. */
export function acceptedWorkoutSetIntent(
  response: CoachConversationResponse,
  identity: string,
  conversationId: string,
  turnId: string,
  surface: CoachSurface,
): CoachWorkoutSetUpdateIntent | null {
  const snapshot = response.snapshot;
  const intents = response.actionIntents ?? [];
  if (!response.ok || response.conversationId !== conversationId || response.turnId !== turnId
    || !snapshot || snapshot.access !== 'self' || snapshot.subjectId !== identity
    || snapshot.surface !== surface
    || intents.length !== 1) return null;
  const intent = intents[0];
  if (intent.action !== 'workout.set.reps.update' || intent.source !== 'provider_tool'
    || intent.subjectId !== identity || intent.scopeKey !== snapshot.scopeKey || intent.surface !== surface
    || intent.reviewRequired !== true || intent.target.selection !== 'latest_open_session_set'
    || !Number.isInteger(intent.target.reps) || intent.target.reps <= 0) return null;
  return intent;
}
