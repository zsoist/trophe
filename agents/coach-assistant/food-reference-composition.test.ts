import { beforeEach, expect, it, vi } from 'vitest';
import type { PilotAttemptRecord, PilotBudgetStore } from './pilot-budget';
const h = vi.hoisted(() => ({ store: null as unknown, provider: vi.fn(), cap: 3_000_000_000 }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/workout/pilot-budget-service', () => ({ createPilotBudgetStore: () => h.store }));
vi.mock('@/agents/runtime/providers/structured', () => ({ invokeStructuredProvider: (...args: unknown[]) => h.provider(...args) }));
vi.mock('@/agents/food-parse/lookup', async original => ({ ...await original<typeof import('@/agents/food-parse/lookup')>(), lookupFoodBatch: async (items: unknown[]) => items.map(() => null), ragPreSearch: async () => [], formatRagContext: () => '' }));
vi.mock('@/agents/food-parse/decompose', () => ({ decomposeAndLookup: async () => null, lookupCachedRecipeAsItem: async () => null }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: async (cfg: { invoke: (args: unknown) => Promise<unknown> }) => {
 const result = await cfg.invoke({ policy: { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'low' }, signal: new AbortController().signal }) as Record<string, unknown>;
 return { ...result, generationId:'injected', selectedPolicy:{ model:'gpt-5.6-luna',provider:'openai' } };
} }));
vi.mock('@/agents/runtime/provider-access', () => ({ assertPaidProviderAccess: () => {}, isPaidAiAllowed: () => false }));
vi.mock('@/agents/clients/google', () => ({ default: {} }));
import { decidePilotBudgetCommand, pilotTurnProfile, pilotRecordActiveCharge, TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD } from './pilot-budget';
import { createPrivateFoodReferenceFallback } from './private-food-reference-runtime';
import { createCoachCapabilityRegistry } from './capability-registry';
import { createGovernedCoachEngineBinding } from './governed-engine';
import { fixtureRepository } from './fixtures';
import { foodReferenceReviewOutput } from './food-reference-review';
import { snapshotFoodReference, type FoodReferenceSnapshot } from './food-reference-continuity';
import { CAPABILITY_PROMPT_VERSION } from './capability-conversation';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),turn=id(4),day='2026-09-13';
const env={VERCEL_ENV:'preview',COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_LIVE_PILOT_ENABLED:'1',TROPHE_ALLOW_PAID_AI:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:actor,OPENAI_API_KEY:'injected-only',PARALLEL_API_KEY:'injected-only'};
const candidate={raw_text:'150g cooked chicken breast',food_name:'Chicken breast, cooked',name_localized:'Chicken breast, cooked',quantity:150,unit:'g',qualifier:null,food_state:'cooked',portion_explicit:true,confidence:0.9,recognized:true,estimated_grams:150,estimation_confidence:0.85,estimated_calories:248,estimated_protein_g:46.5,estimated_carbs_g:0,estimated_fat_g:5.4,per_100g_kcal:165,per_100g_protein:31,per_100g_carbs:0,per_100g_fat:3.6,nutrition_reasoning:'Injected reference estimate.'};
let records:Map<string,PilotAttemptRecord>;
beforeEach(()=>{
 records=new Map();h.cap=3_000_000_000;h.provider.mockReset();
 h.store={execute:async(command)=>{
  const rows=[...records.values()];const count=(profile:string)=>rows.filter(row=>row.binding.turnId===command.binding.turnId&&pilotTurnProfile(row.binding)===profile).length;
  const result=decidePilotBudgetCommand({pilotId:command.binding.pilotId,budgetDay:day,capNanoUsd:h.cap,chargedNanoUsd:rows.reduce((total,row)=>total+pilotRecordActiveCharge(row,day),0),turnAttemptCount:count('ordinary_text'),textFoodTurnCount:count('native_food'),searchTurnCount:count('search'),accountingBlocked:false,existing:records.get(command.binding.attemptId)},command);
  if(result.ok&&result.write!=='none')records.set(command.binding.attemptId,result.record);
  return {storage:'database',...result};
 }} satisfies PilotBudgetStore;
 h.provider.mockImplementation(async(request)=>({output:request.policy?.promptVersion===CAPABILITY_PROMPT_VERSION?request.validator.parse({choice:{tool:'food.reference',args:{queries:['Chicken breast, cooked']}}}):{items:[candidate],needs_clarification:false,clarification_question:null},responseModel:'gpt-5.6-luna',requestId:'req_injected',rawStatus:200,latencyMs:1,usage:{inputTokens:100,outputTokens:20}}));
 vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({search_id:'injected-search',results:[{url:'https://example.com/chicken',title:'Nutrition',publish_date:null,excerpts:['Cooked chicken breast reference.']}]}),{status:200,headers:{'content-type':'application/json'}})));
});
async function run(catalogueHit=false,message='Check online: calories and protein in 150 g cooked chicken breast?',foodReferenceFollowUp?:FoodReferenceSnapshot,prepareFoodReferenceReview?:import('./index').RunOptions['prepareFoodReferenceReview']){
 const repository=fixtureRepository({nutrition:[],workouts:[],plans:[]});repository.dataSource='authorized_records';
 repository.authorize=async()=>({actorId:actor,subjectId:actor,organizationId:id(2),timezone:'UTC',language:'en'});
 const fallback=await createPrivateFoodReferenceFallback(env,actor,turn);
 const engine=createGovernedCoachEngineBinding({env,actorId:actor,persistentStore:h.store as PilotBudgetStore,transport:h.provider});
 return engine.run({version:'coach-assistant.v2',conversationId:id(3),turnId:foodReferenceFollowUp?id(5):turn,message},{actorId:actor,mode:'model',repository,foodReferenceFollowUp,prepareFoodReferenceReview,signal:new AbortController().signal,now:new Date('2026-09-13T12:00:00Z'),capabilityRegistry:createCoachCapabilityRegistry({foodReference:async()=>catalogueHit?{referenceId:'chicken',name:'Chicken breast, cooked',brand:null,source:'usda',quality:'lab_verified',preparation:'cooked',kcalPer100g:165,proteinPer100g:31,conversions:[]}:null,foodReferenceFallback:fallback})});
}
it('composes selector, Parallel and real native parser under one turn and cumulative cap',async()=>{
 const result=await run();expect(result.ok,JSON.stringify(result.error)).toBe(true);
 expect(result.output?.answer).toContain('247.5 kcal');expect(result.output?.answer).toContain('46.5 g protein');expect(result.output?.answer).toContain('Estimate');expect(result.output?.answer).toContain('Not logged');expect(result.receipts).toEqual([]);expect(result.telemetry.costUsd).toBeNull();expect(result.output?.answer).toContain('https://example.com/chicken');
 expect(new Set([...records.values()].map(row=>row.binding.turnId))).toEqual(new Set([turn]));
 expect([...records.values()].map(row=>pilotTurnProfile(row.binding)).sort()).toEqual(['native_food','ordinary_text','search']);
 expect([...records.values()].every(row=>row.state==='settled')).toBe(true);
 expect([...records.values()].reduce((sum,row)=>sum+row.chargedNanoUsd,0)).toBeGreaterThan(1_000_000);
 expect(h.provider).toHaveBeenCalledTimes(2);expect(fetch).toHaveBeenCalledTimes(1);
 expect(h.provider.mock.calls[1][0].prompt).toContain('UNTRUSTED_NUTRITION_REFERENCES_JSON');
});
it('keeps catalogue hits free of search and native parser dispatch',async()=>{
 const result=await run(true);expect(result.ok).toBe(true);expect(result.output?.answer).toContain('247.5 kcal');expect(h.provider).toHaveBeenCalledTimes(1);expect(fetch).not.toHaveBeenCalled();
});
it('fails closed against the cumulative cap without native fallback after a blocked search',async()=>{
 h.cap=1_000_000;const result=await run();expect(result.ok).toBe(false);expect(h.provider).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it('portion-only input cannot trigger search or a native parse',async()=>{
 const fallback=await createPrivateFoodReferenceFallback(env,actor,turn);
 const result=await fallback({queries:['chicken'],text:'200 g',language:'en',signal:new AbortController().signal});
 expect(result.native).toMatchObject({outcome:'clarification_required'});expect(fetch).not.toHaveBeenCalled();expect(h.provider).not.toHaveBeenCalled();
});

it('accounts for selector and search charges before native admission on the same turn',async()=>{
 h.cap=TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD;
 const result=await run();
 expect(result.output?.answer).toContain('could not calculate');
 expect(result.output?.answer).not.toContain('247.5');
 expect(h.provider).toHaveBeenCalledTimes(1);expect(fetch).toHaveBeenCalledTimes(1);
 expect([...records.values()].filter(row=>row.state==='settled')).toHaveLength(2);
 expect(new Set([...records.values()].map(row=>row.binding.turnId))).toEqual(new Set([turn]));
});

it('generic chicken needs no web availability to use native Food',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));
 const result=await run(false,'Calories in 150 g cooked chicken breast?');
 expect(result.ok).toBe(true);expect(result.output?.answer).toContain('247.5 kcal');
 expect(fetch).not.toHaveBeenCalled();expect(h.provider).toHaveBeenCalledTimes(2);
});
it('optional web failure still permits native estimation under the same remaining cap',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));
 const result=await run();expect(result.ok).toBe(true);expect(result.output?.answer).toContain('247.5 kcal');
 expect(fetch).toHaveBeenCalledTimes(1);expect(h.provider).toHaveBeenCalledTimes(2);
 expect([...records.values()].find(row=>pilotTurnProfile(row.binding)==='search')?.chargedNanoUsd).toBeGreaterThan(0);
});

it('reuses a server-owned native reference for 150g to 200g with zero new dispatch',async()=>{
 const first=await run(false,'Calories in 150 g cooked chicken breast?');
 const reference=snapshotFoodReference(first.capabilityResult?.result);expect(reference).not.toBeNull();
 const calls=h.provider.mock.calls.length,searches=vi.mocked(fetch).mock.calls.length,rows=records.size;
 const second=await run(false,'and 200 g',reference!);
 expect(second.ok).toBe(true);expect(second.output?.answer).toContain('330 kcal');expect(second.output?.answer).toContain('62 g protein');
 expect(second.output?.answer).toContain('Estimate');expect(second.telemetry.modelCalls).toBe(0);
 expect(h.provider).toHaveBeenCalledTimes(calls);expect(fetch).toHaveBeenCalledTimes(searches);expect(records.size).toBe(rows);
});

it('acceptance opens the same native reference as a review without another estimate or write',async()=>{
 const first=await run(false,'Calories in 150 g cooked chicken breast?');const reference=snapshotFoodReference(first.capabilityResult?.result)!;
 const prepare=vi.fn(async(_input:unknown,snapshot:FoodReferenceSnapshot)=>{
  const output=foodReferenceReviewOutput(snapshot);if(!output)throw new Error('missing review');
  return {ok:true as const,draft:{kind:'parsed' as const,id:id(9),hash:'a'.repeat(64),action:'food.text.create' as const,rawText:'yes',items:output.items,clarification:null,warnings:[],expiresAt:'2026-09-13T13:00:00Z'}};
 });
 const calls=h.provider.mock.calls.length;const second=await run(false,'yes',reference,prepare);
 expect(second.ok).toBe(true);expect(second.textFood).toMatchObject({ok:true,draft:{items:[{grams:150,calories:247.5,protein_g:46.5}]}});
 expect(second.receipts).toEqual([]);expect(prepare).toHaveBeenCalledTimes(1);expect(h.provider).toHaveBeenCalledTimes(calls);expect(second.telemetry.modelCalls).toBe(0);
});
