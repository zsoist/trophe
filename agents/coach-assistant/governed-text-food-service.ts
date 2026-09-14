import type { db } from '@/db/client';
import type { GovernedCoachTransport } from './governed-transport';
import { isGovernedFoodParseTransport } from './governed-transport';
import { createTextFoodService } from './text-food-service';
import { parseTextFood } from './text-food-parser';

/** Server composition only. Each new request receives its own transport bound to
 * the shared actor/day authority and request id; native phases settle separately.
 * The adapter is requested only after authorization, capability preflight and a
 * durable one-attempt claim. It cannot be supplied through an operation body.
 */
export function createGovernedTextFoodService(database: typeof db, transportFor: (scope: {
  actorId: string; requestId: string; signal: AbortSignal;
}) => Promise<GovernedCoachTransport> | GovernedCoachTransport) {
  return createTextFoodService(database, async (input, scope) => {
    const transport = await transportFor(scope);
    if (!isGovernedFoodParseTransport(transport)) throw new Error('budget_blocked');
    return parseTextFood(input, { ...scope, transport });
  });
}
