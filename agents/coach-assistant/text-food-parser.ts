import { attachFoodReferenceEvidence, type FoodReferenceEvidence } from './food-reference-evidence';
import type { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import type { FoodParseInput } from '@/agents/schemas/food-parse';
import { TEXT_FOOD_MAX_PHASES } from './pilot-budget';
import { taskPolicies } from '@/agents/router/policies';
import { isGovernedFoodParseTransport, type GovernedCoachTransport } from './governed-transport';

export const TEXT_FOOD_PROMPT_VERSION = 'coach-assistant.text-food-native.v2-reference-context';

/** Every native extraction/decomposition/estimate uses the existing admitted transport.
 * Serial dispatch prevents parallel decomposition from escaping the native algorithm ceiling.
 * A failure latches closed: the native parser cannot turn a failed provider call into
 * an unadmitted repair, fallback estimate, or partially accepted meal.
 */
export function createTextFoodParserTransport(transport: GovernedCoachTransport, signal: AbortSignal, evidence?: FoodReferenceEvidence) {
  if (!isGovernedFoodParseTransport(transport)) throw new Error('budget_blocked');
  let failed = false;
  let calls = 0;
  let queue: Promise<void> = Promise.resolve();
  const providerTransport: typeof invokeStructuredProvider = async request => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>(resolve => { release = resolve; });
    await previous;
    try {
      signal.throwIfAborted();
      const contextualRequest = attachFoodReferenceEvidence(request, evidence);
      // UTF-8 bytes conservatively bound tokens; leave headroom for protocol framing.
      if (new TextEncoder().encode(JSON.stringify({ system: contextualRequest.system, prompt: contextualRequest.prompt, schema: contextualRequest.schema })).length > 63500) throw new Error('context_limit');
      if (failed || calls >= TEXT_FOOD_MAX_PHASES) throw new Error('budget_blocked');
      calls++;
      const result = await transport({
        ...contextualRequest,
        signal: AbortSignal.any([signal, request.signal]),
        policy: { ...taskPolicies.coach_assistant, promptVersion: TEXT_FOOD_PROMPT_VERSION },
        maxTokens: 2000,
        maxAttempts: 1,
      });
      if (result.rawStatus < 200 || result.rawStatus >= 300) throw new Error('provider_unavailable');
      return { ...result, output: request.validator.parse(result.output) };
    } catch (error) {
      failed = true;
      throw error;
    } finally { release(); }
  };
  return { providerTransport, assertComplete() { signal.throwIfAborted(); if (failed) throw new Error('food_parse_incomplete'); } };
}

/** Uses Food's original parser and catalogue; never writes a food record. */
export async function parseTextFood(input: FoodParseInput, scope: {
  actorId: string; requestId: string; signal: AbortSignal; transport: GovernedCoachTransport;
  referenceEvidence?: FoodReferenceEvidence;
}) {
  const admitted = createTextFoodParserTransport(scope.transport, scope.signal, scope.referenceEvidence);
  const { run } = await import('@/agents/food-parse');
  const result = await run(input, {
    userId: scope.actorId,
    requestId: scope.requestId,
    providerTransport: admitted.providerTransport,
    maxProviderAttempts: 1,
    allowSchemaRepair: false,
    metadata: { operation: 'ask-text-food-review' },
  });
  admitted.assertComplete();
  if (!result.ok || !result.output) throw new Error('food_parse_incomplete');
  return result.output;
}
