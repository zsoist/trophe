import { z } from 'zod';
import { isParsedFoodItem, type ParsedFoodItem } from '@/agents/schemas/food-parse';
import { adviceOptionLabel, MEAL_ADVICE_MAX_CHOICES, mealAdviceChoiceSchema, mealFitsDiet, type EstimatedMeal, type EstimateMealAdvice, type MealAdviceConstraints, type MealAdviceFood } from './nutrition-advice';
import { createGovernedCoachTransport, type GovernedAttemptTrace } from './governed-transport';
import { TEXT_FOOD_PROMPT_VERSION, parseTextFood } from './text-food-parser';

/** `parseTextFood` folds every failure into 'food_parse_incomplete', so the
 * governance decision is read from the governed attempt trace instead: an
 * attempt refused *before* any provider dispatch ('blocked'), replayed from the
 * ledger ('recovered', i.e. a duplicate turn that must not double-spend), or one
 * whose spend can no longer be accounted for must stop the turn — never be
 * retried as if the option were merely ambiguous. A dispatched-but-failed
 * provider attempt ('unknown') is a per-option failure and may be skipped. */
function isGovernanceStop(trace:GovernedAttemptTrace|undefined):boolean {
  return Boolean(trace&&(trace.state==='blocked'||trace.state==='recovered'||trace.error==='accounting_uncertain'||trace.error==='model_pricing_unverified'));
}

/** The exact text each Food parse receives: "200 g Chicken breast, cooked; ...".
 * Grams are user/model-chosen, never derived here. */
export function adviceFoodText(food:MealAdviceFood):string {
  return `${food.grams} g ${food.name}`;
}

/** Case-fold, strip diacritics/punctuation and collapse whitespace so a name and
 * its localized/accents variants compare on their meaningful words. */
function normalizeFoodName(name:string):string {
  return (typeof name==='string'?name:'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();
}

/** True when a returned Food item demonstrably *is* the requested food: its
 * identity (canonical or localized name) contains every significant word of the
 * requested name, and its portion matches the requested grams to within a single
 * gram (integer rounding, not a re-scaling). A larger gap — e.g. 150 g requested
 * and 120 g returned — is a substitution, not rounding, and is rejected.
 * Names/quantities stay Food's authority. */
function itemCoversRequestedFood(requested:MealAdviceFood,item:ParsedFoodItem):boolean {
  const requestedTokens=normalizeFoodName(requested.name).split(' ').filter(token=>token.length>=3);
  if(requestedTokens.length===0)return false;
  const identity=[item.name_localized,item.food_name].some(name=>{
    const tokens=new Set(normalizeFoodName(name).split(' ').filter(Boolean));
    return requestedTokens.every(token=>tokens.has(token));
  });
  if(!identity)return false;
  return Math.abs(item.grams-requested.grams)<=1;
}

/** True only when the returned items are in one-to-one correspondence with the
 * requested foods: each requested food is covered by a DISTINCT returned item,
 * and no returned item is left unaccounted for. A parser that drops or replaces
 * a requested ingredient (only `Chicken` for "Chicken and rice"), collapses two
 * portions into one item (`Oats 80 g` for "two Oats 40 g"), or pads the option
 * with an extra food the user never requested must not be published as the
 * complete titled option. The match is found by bounded backtracking (≤4 foods
 * per choice, so ≤24 orders) rather than the weaker every/some test. */
function itemsCoverChoice(foods:ReadonlyArray<MealAdviceFood>,items:ReadonlyArray<ParsedFoodItem>):boolean {
  if(items.length!==foods.length)return false;
  const used=new Array<boolean>(items.length).fill(false);
  const match=(index:number):boolean=>{
    if(index===foods.length)return true;
    for(let item=0;item<items.length;item++){
      if(used[item]||!itemCoversRequestedFood(foods[index],items[item]))continue;
      used[item]=true;
      if(match(index+1))return true;
      used[item]=false;
    }
    return false;
  };
  return match(0);
}

/** Up to three bounded Food parses, one original actor/pilot/turn and the
 * existing shared budget. No independent macro generator, search, draft, apply
 * or receipt service: every offered option is resolved with the existing
 * `parseTextFood` pathway over one governed transport, so a single reservation
 * profile, turn counter and daily cap govern all of them.
 *
 * With a `constraints.dietPattern`, an option whose verified Food names contain a
 * CLEAR conflict is withheld (see `mealFitsDiet`); safe options still survive and
 * an all-conflicted turn fails honestly as `meal_advice_diet_unavailable`. The
 * filter is local — it never re-parses, re-queries or spends on another attempt.
 *
 * A partial failure returns only the options that were demonstrably verified;
 * it never invents a replacement food, silently relabels a mismatch, or pads an
 * option with example numbers. If nothing could be verified it throws instead of
 * resolving an empty array that a caller could render as success. Cancellation
 * and governance stops propagate rather than being swallowed. */
export async function createPrivateNutritionAdviceEstimator(env:Record<string,string|undefined>,actorId:string,turnId:string):Promise<EstimateMealAdvice>{
 const [{db},{createPilotBudgetStore},{createSharedPilotBudgetRuntime},{invokeStructuredProvider}]=await Promise.all([
  import('@/db/client'),import('@/lib/workout/pilot-budget-service'),import('@/lib/workout/shared-pilot-budget'),import('@/agents/runtime/providers/structured'),
 ]);
 const shared=createSharedPilotBudgetRuntime(env,actorId,createPilotBudgetStore(db,actorId));let used=false;
 return async(raw,language,signal,constraints?:MealAdviceConstraints)=>{
  const choices=z.array(mealAdviceChoiceSchema).min(1).max(MEAL_ADVICE_MAX_CHOICES).parse(raw);
  if(used||!shared.ok)throw new Error('budget_blocked');
  // Single-use guard is set before the first dispatch so a re-entrant call can
  // never double-spend the shared turn authority.
  used=true;
  signal.throwIfAborted();
  const timeoutMs=constraints?.timeoutMs;
  const workSignal=timeoutMs===undefined?signal:AbortSignal.any([signal,AbortSignal.timeout(Math.max(1,Math.min(42000,Math.floor(timeoutMs))))]);
  // One governed transport = one reserved attempt series for the whole turn,
  // so the three parses share the original actor/turn/counters and cannot
  // reset or overrun the existing native Food authority.
  const governed=createGovernedCoachTransport({pilotId:shared.pilotId,actorId,turnId,identityParts:[shared.pilotId,actorId,'food-advice',turnId],mode:'live',store:shared.store,signal:workSignal,transport:invokeStructuredProvider,allowedPromptVersions:[TEXT_FOOD_PROMPT_VERSION],reservationProfile:'food_parse'});
  const transport=governed.transport;
  const lastTrace=()=>governed.attempts[governed.attempts.length-1];
  const meals:EstimatedMeal[]=[];
  let resolved=0;
  for(const choice of choices){
   signal.throwIfAborted();
   if(workSignal.aborted)break;
   let output;
   try {
    let onAbort:(()=>void)|undefined;
    try{
     const parsing=parseTextFood({text:choice.foods.map(adviceFoodText).join('; '),language},{actorId,requestId:turnId,signal:workSignal,transport});
     output=await Promise.race([parsing,new Promise<never>((_,reject)=>{onAbort=()=>reject(workSignal.reason);if(workSignal.aborted)onAbort();else workSignal.addEventListener('abort',onAbort,{once:true});})]);
    }finally{if(onAbort)workSignal.removeEventListener('abort',onAbort);}
   } catch(error){
    // Cancellation is never swallowed — it propagates unchanged.
    if(signal.aborted)throw error;
    if(workSignal.aborted)break;
    // A governance stop is not an ambiguous option: stop spending and keep the
    // options already verified this turn (or fail if there are none).
    if(isGovernanceStop(lastTrace())){if(meals.length===0)throw new Error(lastTrace()?.error==='accounting_uncertain'?'accounting_uncertain':'budget_blocked');break;}
    // An ordinary provider/parse failure means this one option could not be
    // verified. Skip it honestly instead of fabricating or retrying.
    continue;
   }
   const items=output.items.filter((item):item is ParsedFoodItem=>isParsedFoodItem(item));
   if(output.needs_clarification||items.length===0)continue;
   // Coverage/identity/portion: the parse may return fewer or different foods
   // than requested. An option whose requested ingredients are not all present is
   // incomplete — drop it rather than publish the titled full meal with partial
   // numbers (or silently relabel a missing ingredient as complete).
   if(!itemsCoverChoice(choice.foods,items))continue;
   resolved++;
   if(!mealFitsDiet(items,constraints?.dietPattern))continue;
   // The model title is presentation-only: a hostile title is replaced by the
   // verified Food item names before the option is ever published.
   meals.push({name:adviceOptionLabel(choice.name,items),items});
  }
  // Never resolve an empty array: a caller must not be able to present "no
  // verified option" as a successful advice result. A turn where every verified
  // option was withheld for a diet conflict is reported distinctly and honestly.
  if(meals.length===0)throw new Error(resolved>0?'meal_advice_diet_unavailable':'meal_advice_unavailable');
  return meals;
 };
}
