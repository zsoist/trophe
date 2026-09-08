import type { CoachConversationResponse, CoachFoodQuantityUpdateIntent, CoachSurface } from '@/agents/coach-assistant/contracts';

const uuid = (value: unknown) => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const grams = (value: unknown) => typeof value === 'number'
  && Number.isFinite(value) && value > 0 && value <= 10_000;

/** Accepts only the single server-bound Food correction for this self scope. */
export function acceptedFoodQuantityIntent(
  response: CoachConversationResponse,
  identity: string,
  conversationId: string,
  turnId: string,
  surface: CoachSurface,
): CoachFoodQuantityUpdateIntent | null {
  const snapshot = response.snapshot;
  const intents = response.actionIntents ?? [];
  if (!response.ok || response.conversationId !== conversationId || response.turnId !== turnId
    || !snapshot || snapshot.access !== 'self' || snapshot.subjectId !== identity
    || snapshot.surface !== surface || intents.length !== 1) return null;
  const intent = intents[0] as unknown as Record<string, unknown>;
  const target = intent.target as Record<string, unknown> | undefined;
  if (Object.keys(intent).sort().join(',') !== ['id', 'action', 'source', 'subjectId', 'scopeKey', 'surface', 'target', 'reviewRequired'].sort().join(',')
    || intent.action !== 'food.quantity.update' || intent.source !== 'provider_tool'
    || intent.subjectId !== identity || intent.scopeKey !== snapshot.scopeKey || intent.surface !== surface
    || intent.reviewRequired !== true || !/^[a-f0-9]{64}$/.test(String(intent.id)) || !target
    || Object.keys(target).sort().join(',') !== ['selection', 'entryHintId', 'previousGrams', 'grams'].sort().join(',')
    || target.selection !== 'authorized_food_entry'
    || !(target.entryHintId === null || uuid(target.entryHintId))
    || !grams(target.previousGrams) || !grams(target.grams) || target.previousGrams === target.grams) return null;
  return intent as unknown as CoachFoodQuantityUpdateIntent;
}
