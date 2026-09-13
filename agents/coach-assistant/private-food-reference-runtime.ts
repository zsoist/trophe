import { foodReferenceSearchIntent, requestedFoodMarkets, withoutRequestedFoodMarkets } from './food-reference-search-intent';
import { createGovernedCoachTransport } from './governed-transport';
import { TEXT_FOOD_PROMPT_VERSION, parseTextFood } from './text-food-parser';
import { createNativeFoodReferenceFallback, type NativeFoodReferenceOutcome } from './food-reference-native-fallback';
import { isFoodPortionFollowUp } from './food-reference';
import type { FoodReferenceEvidence } from './food-reference-evidence';
import { createNutritionSearchRuntime } from '@/lib/food/nutrition-search';
import { safeSourceUrl } from '@/lib/food/nutrition-search-transport';

export type FoodReferenceFallbackResult = { native: NativeFoodReferenceOutcome; referenceEvidence: FoodReferenceEvidence | null; unverifiedMarkets?: string[]; reviewItems?: import('@/agents/schemas/food-parse').ParsedFoodItem[] };
export type FoodReferenceFallback = (input: { queries: string[]; text: string; language: string; signal: AbortSignal }) => Promise<FoodReferenceFallbackResult>;

/** One read-only native parse per existing user turn. No draft/receipt writer. */
export async function createPrivateFoodReferenceFallback(env: Record<string, string | undefined>, actorId: string, turnId: string): Promise<FoodReferenceFallback> {
  const [{ db }, { createPilotBudgetStore }, { createSharedPilotBudgetRuntime }, { invokeStructuredProvider }] = await Promise.all([
    import('@/db/client'), import('@/lib/workout/pilot-budget-service'), import('@/lib/workout/shared-pilot-budget'), import('@/agents/runtime/providers/structured'),
  ]);
  const shared = createSharedPilotBudgetRuntime(env, actorId, createPilotBudgetStore(db, actorId));
  let used = false;
  return async input => {
    input.signal.throwIfAborted();
    if (used || !shared.ok) throw new Error('budget_blocked');
    used = true;
    if (isFoodPortionFollowUp(input.text)) return { native: { ok: true, outcome: 'clarification_required', question: null, partial: [] }, referenceEvidence: null };
    const search = createNutritionSearchRuntime(env, { store: shared.store, pilotId: shared.pilotId, actorId, turnId });
    const evidence: FoodReferenceEvidence = [];
    const queries = [...new Set(input.queries)];
    if (queries.length < 1 || queries.length > 2) throw new Error('invalid_input');
    for (const product of queries) {
      if (!search.ok) break; // Optional search credentials: native Food remains available.
      const intent = foodReferenceSearchIntent(product, input.text, input.language);
      if (!intent) continue;
      const result = await search.search(intent, input.signal);
      // Optional web evidence is not a prerequisite for Food's existing estimator.
      // Its spent/unknown charge remains in the shared ledger before native admission.
      if (result.status !== 'ok') { input.signal.throwIfAborted(); continue; }
      const sources = result.evidence.results.flatMap(source => {
        const url = safeSourceUrl(source.url);
        return url ? [{ title: source.title, url, snippet: source.snippet, publishDate: source.publishDate }] : [];
      });
      if (sources.length) evidence.push({ product: result.evidence.product, brand: result.evidence.brand, locale: result.evidence.locale, market: result.evidence.market, sources });
    }
    // Locale is a query preference, not verified provenance. The estimate stays
    // usable but cannot be named or stored as a verified local-market product.
    const unverifiedMarkets = requestedFoodMarkets(input.text);
    const { transport } = createGovernedCoachTransport({
      pilotId: shared.pilotId, actorId, turnId, identityParts: [shared.pilotId, actorId, 'food-reference-native', turnId],
      mode: 'live', store: shared.store, signal: input.signal, transport: invokeStructuredProvider,
      allowedPromptVersions: [TEXT_FOOD_PROMPT_VERSION], reservationProfile: 'food_parse',
    });
    const scope = { actorId, requestId: turnId, signal: input.signal, transport, ...(evidence.length ? { referenceEvidence: evidence } : {}) };
    let reviewItems: import('@/agents/schemas/food-parse').ParsedFoodItem[] = [];
    const lookupNativeFoodReference = createNativeFoodReferenceFallback(async (request, admittedScope) => {
      const output = await parseTextFood(request, { ...admittedScope, ...(evidence.length ? { referenceEvidence:evidence } : {}) });
            if (unverifiedMarkets.length) output.items = output.items.map(item => ({...item,
        food_name: `${withoutRequestedFoodMarkets(item.food_name)} (generic estimate)`,
        name_localized: `${withoutRequestedFoodMarkets(item.name_localized ?? item.food_name)} (generic estimate)`,
      }));
      reviewItems=output.items;return output;
    });
    const native = await lookupNativeFoodReference({ text: unverifiedMarkets.length ? `${withoutRequestedFoodMarkets(input.text)}. Use a generic reference only; do not attribute the product or nutrition to a country. Country-specific label is unverified.` : input.text, language: input.language }, scope);
    return { native, referenceEvidence: evidence.length ? evidence : null, reviewItems, ...(unverifiedMarkets.length ? {unverifiedMarkets} : {}) };
  };
}
