import type { CoachConversationRequest, CoachConversationResponse } from './contracts';
import { runConversation } from './conversation';
import type { RunOptions } from './index';
import type { createCoachChatService } from './chat-service';
import type { GovernedCoachEngineBinding } from './governed-engine';
import { runDurableChatTurn } from './chat-turn';

/** Reviewed voice joins the existing text engine and durable chat transaction.
 * The caller must create the scoped chat before STT binds its review token. */
export async function runReviewedVoiceConversation(
  request: CoachConversationRequest,
  options: RunOptions,
  dependencies: { chatService?: ReturnType<typeof createCoachChatService>; governedEngine?: GovernedCoachEngineBinding },
): Promise<CoachConversationResponse> {
  if (dependencies.chatService) {
    const persisted = await runDurableChatTurn(request, options, dependencies.chatService, undefined, dependencies.governedEngine);
    if (!persisted.saved) throw new Error('persistence_failed');
    return persisted.response;
  }
  return dependencies.governedEngine
    ? dependencies.governedEngine.run(request, options)
    : runConversation(request, options);
}
