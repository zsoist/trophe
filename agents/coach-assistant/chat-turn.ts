import { randomUUID } from 'node:crypto';
import type { CoachConversationRequest } from './contracts';
import type { RunOptions } from './index';
import type { createCoachChatService } from './chat-service';
import type { IsolatedCoachEngineBinding } from './isolated-engine';
import type { GovernedCoachEngineBinding } from './governed-engine';
import { runVerifiedChatFinal, runVerifiedChatFinalWithGovernedEngine, runVerifiedChatFinalWithIsolatedEngine } from './chat-final';
import type { CoachChatScope } from './chat-contract';

/** Claim the user turn durably before generation. A replay only recovers history;
 * it cannot dispatch another model call, even in another server process. */
export async function runDurableChatTurn(request: CoachConversationRequest, options: RunOptions & { filterMemoryHistory?: (input: CoachConversationRequest) => CoachConversationRequest }, service: ReturnType<typeof createCoachChatService>, engine?: IsolatedCoachEngineBinding, governedEngine?: GovernedCoachEngineBinding) {
  if (options.repository.dataSource !== 'authorized_records' || request.context?.clientId && request.context.clientId !== options.actorId) throw new Error('forbidden');
  const authorized = await options.repository.authorize(options.actorId, options.actorId, options.signal);
  if (authorized.actorId !== options.actorId || authorized.subjectId !== options.actorId) throw new Error('forbidden');
  const scope: CoachChatScope = { actorId: options.actorId, subjectId: options.actorId, organizationId: authorized.organizationId, actorRole: 'client' };
  const user = await service.execute(scope, { version: 'coach-assistant.chat.v1', operation: 'append_user', threadId: request.conversationId, turnId: request.turnId, requestId: request.turnId, text: request.message }, options.signal);
  if (!user.ok || !('message' in user.value) || user.value.replayed) return { saved: false as const };
  const generated = engine
    ? await runVerifiedChatFinalWithIsolatedEngine(request, options, scope, engine)
    : governedEngine
      ? await runVerifiedChatFinalWithGovernedEngine(request, options, scope, governedEngine)
      : await runVerifiedChatFinal(request, options, scope);
  if (!generated.final) {
    // An abort can race a provider completion and durable append in another
    // request. Keep the claim inflight; only a conclusive local terminal result
    // may become failed.
    if (options.signal.aborted) return { saved: true as const, response: generated.response };
    const failed = await service.markFailed(scope, request.conversationId, request.turnId, options.signal);
    return failed.ok ? { saved: true as const, response: generated.response } : { saved: false as const };
  }
  const stored = await service.appendFinal(scope, { threadId: request.conversationId, requestId: randomUUID() }, generated.final, options.signal);
  if (!stored.ok) return { saved: false as const };
  return { saved: true as const, response: generated.response };
}
