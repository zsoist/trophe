import type { CoachRepository } from './repository';
import type { createCoachChatService } from './chat-service';
import { COACH_CHAT_VERSION, type CoachChatResult } from './chat-contract';
import type { ChatOperationValue } from './chat-service';

/** Global client history uses a server-derived self scope. The service checks the
 * actor's actual client role and current memberships again inside its transaction. */
export async function executeCoachChatAction(actorId: string, raw: unknown, repository: CoachRepository, service: ReturnType<typeof createCoachChatService>, signal: AbortSignal): Promise<CoachChatResult<ChatOperationValue>> {
  const fail = (error: 'forbidden' | 'not_connected' | 'cancelled' | 'uncertain'): CoachChatResult<ChatOperationValue> => ({ version: COACH_CHAT_VERSION, storage: 'database', ok: false, error });
  if (repository.dataSource !== 'authorized_records') return fail('not_connected');
  try {
    signal.throwIfAborted();
    const context = await repository.authorize(actorId, actorId, signal);
    if (context.actorId !== actorId || context.subjectId !== actorId) return fail('forbidden');
    return await service.execute({ actorId, subjectId: actorId, organizationId: context.organizationId, actorRole: 'client' }, raw, signal);
  } catch (error) {
    return fail(signal.aborted ? 'cancelled' : error instanceof Error && ['unauthenticated', 'forbidden'].includes(error.message) ? 'forbidden' : 'uncertain');
  }
}
