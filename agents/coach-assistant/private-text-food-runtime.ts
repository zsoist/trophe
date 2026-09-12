import { createGovernedTextFoodService } from './governed-text-food-service';
import { createGovernedCoachTransport } from './governed-transport';
import { TEXT_FOOD_PROMPT_VERSION } from './text-food-parser';
export async function createPrivateTextFoodService(env: Record<string, string | undefined>, actorId: string) {
  const [{ db }, { createPilotBudgetStore }, { createSharedPilotBudgetRuntime }, { invokeStructuredProvider }] = await Promise.all([
    import('@/db/client'), import('@/lib/workout/pilot-budget-service'), import('@/lib/workout/shared-pilot-budget'), import('@/agents/runtime/providers/structured'),
  ]);
  return createGovernedTextFoodService(db, scope => {
    if (scope.actorId !== actorId) throw new Error('forbidden');
    const runtime = createSharedPilotBudgetRuntime(env, actorId, createPilotBudgetStore(db, actorId));
    if (!runtime.ok) throw new Error('budget_blocked');
    return createGovernedCoachTransport({ pilotId: runtime.pilotId, actorId, turnId: scope.requestId, identityParts: [runtime.pilotId, actorId, 'text-food', scope.requestId], mode: 'live', store: runtime.store, signal: scope.signal, transport: invokeStructuredProvider, allowedPromptVersions: [TEXT_FOOD_PROMPT_VERSION], reservationProfile: 'food_parse' }).transport;
  });
}
