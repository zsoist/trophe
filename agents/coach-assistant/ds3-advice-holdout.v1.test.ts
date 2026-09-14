import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PilotAttemptRecord, PilotBudgetStore } from './pilot-budget';

const h = vi.hoisted(() => ({ store: null as unknown, provider: vi.fn(), cap: 3_000_000_000 }));
vi.mock('@/db/client', () => ({ db: {} }));
vi.mock('@/lib/workout/pilot-budget-service', () => ({ createPilotBudgetStore: () => h.store }));
vi.mock('@/agents/runtime/providers/structured', () => ({ invokeStructuredProvider: (...args: unknown[]) => h.provider(...args) }));
vi.mock('@/agents/food-parse/lookup', async original => ({ ...await original<typeof import('@/agents/food-parse/lookup')>(), lookupFoodBatch: async (items: unknown[]) => items.map(() => null), ragPreSearch: async () => [], formatRagContext: () => '' }));
vi.mock('@/agents/food-parse/decompose', () => ({ decomposeAndLookup: async () => null, lookupCachedRecipeAsItem: async () => null }));
vi.mock('@/agents/runtime', () => ({ executeAiTask: async (cfg: { invoke: (args: unknown) => Promise<unknown> }) => {
  const result = await cfg.invoke({ policy: { provider: 'openai', model: 'gpt-5.6-luna', reasoningEffort: 'low' }, signal: new AbortController().signal }) as Record<string, unknown>;
  return { ...result, generationId: 'injected', selectedPolicy: { model: 'gpt-5.6-luna', provider: 'openai' } };
} }));
vi.mock('@/agents/runtime/provider-access', () => ({ assertPaidProviderAccess: () => {}, isPaidAiAllowed: () => false }));
vi.mock('@/agents/clients/google', () => ({ default: {} }));

import { decidePilotBudgetCommand, pilotRecordActiveCharge, pilotTurnProfile, TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD, TEXT_FOOD_MAX_PHASES, USD_IN_NANODOLLARS } from './pilot-budget';
import { FOOD_PARSE_MAX_ITEMS } from '@/agents/food-parse/pipeline-budget';
import { createGovernedCoachTransport } from './governed-transport';
import { CAPABILITY_PROMPT_VERSION } from './capability-conversation';
import { taskPolicies } from '@/agents/router/policies';
import { ASK_TROPHE_SHARED_PILOT_ID } from '@/lib/workout/shared-pilot-budget';
import { renderMealAdvice, type MealAdviceChoice } from './nutrition-advice';
import { createPrivateNutritionAdviceEstimator, adviceFoodText } from './private-nutrition-advice';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const actor = id(1), turn = id(4), day = '2026-09-13';
const env = { VERCEL_ENV: 'preview', COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1', TROPHE_ALLOW_PAID_AI: '1', COACH_ASSISTANT_PREVIEW_USER_IDS: actor, OPENAI_API_KEY: 'injected-only' };

/** Deterministic per-100g reference table with integer-friendly values so the
 * bound-metric and per-100g code paths agree exactly. */
const FOODS: Record<string, { kcal: number; p: number; c: number; f: number; state: 'raw' | 'cooked' | 'unknown' }> = {
  'Chicken breast, cooked': { kcal: 160, p: 30, c: 0, f: 4, state: 'cooked' },
  'White rice, cooked': { kcal: 130, p: 2.7, c: 28, f: 0.3, state: 'cooked' },
  'Broccoli, steamed': { kcal: 34, p: 2.8, c: 7, f: 0.4, state: 'cooked' },
  'Olive oil': { kcal: 900, p: 0, c: 0, f: 100, state: 'unknown' },
  'Greek yogurt': { kcal: 60, p: 10, c: 3.6, f: 0.4, state: 'unknown' },
  'Salmon, cooked': { kcal: 208, p: 20, c: 0, f: 13, state: 'cooked' },
  Oats: { kcal: 380, p: 13, c: 67, f: 7, state: 'raw' },
  'Mystery dish': { kcal: 120, p: 6, c: 10, f: 5, state: 'cooked' },
  'Flaky dish': { kcal: 110, p: 5, c: 9, f: 5, state: 'cooked' },
};

function candidateFor(grams: number, name: string) {
  const ref = FOODS[name];
  return {
    raw_text: `${grams} g ${name}`, food_name: name, name_localized: name, quantity: grams, unit: 'g',
    qualifier: null, food_state: ref.state, portion_explicit: true, confidence: 0.9, recognized: true,
    estimated_grams: grams,
    estimated_calories: Math.round((ref.kcal * grams) / 100),
    estimated_protein_g: Math.round(ref.p * grams / 100 * 10) / 10,
    estimated_carbs_g: Math.round(ref.c * grams / 100 * 10) / 10,
    estimated_fat_g: Math.round(ref.f * grams / 100 * 10) / 10,
    per_100g_kcal: ref.kcal, per_100g_protein: ref.p, per_100g_carbs: ref.c, per_100g_fat: ref.f,
    nutrition_reasoning: 'Injected reference estimate.', estimation_confidence: 0.85,
  };
}

/** Mirrors the real prompt: `Parse this food input (language: en):\n\n"<text>"`. */
function itemsFromPrompt(prompt: string) {
  const start = prompt.indexOf('"'), end = prompt.lastIndexOf('"');
  const quoted = start >= 0 && end > start ? prompt.slice(start + 1, end) : prompt;
  return quoted.split(';').map(segment => segment.trim()).filter(Boolean).flatMap(segment => {
    const match = segment.match(/^([\d.]+)\s*g\s+(.+)$/i);
    if (!match) return [];
    const grams = Number(match[1]), name = match[2].trim();
    return FOODS[name] ? [candidateFor(grams, name)] : [];
  });
}

const wired = (output: unknown) => ({ output, responseModel: 'gpt-5.6-luna', requestId: 'req_injected', rawStatus: 200, latencyMs: 1, usage: { inputTokens: 100, outputTokens: 20 } });

let records: Map<string, PilotAttemptRecord>;
beforeEach(() => {
  records = new Map(); h.cap = 3_000_000_000; h.provider.mockReset();
  h.store = { execute: async (command: { binding: { turnId: string; attemptId: string } }) => {
    const rows = [...records.values()];
    const count = (profile: string) => rows.filter(row => row.binding.turnId === command.binding.turnId && pilotTurnProfile(row.binding) === profile).length;
    const result = decidePilotBudgetCommand({ pilotId: (command.binding as unknown as { pilotId: string }).pilotId, budgetDay: day, capNanoUsd: h.cap, chargedNanoUsd: rows.reduce((total, row) => total + pilotRecordActiveCharge(row, day), 0), turnAttemptCount: count('ordinary_text'), textFoodTurnCount: count('native_food'), searchTurnCount: count('search'), accountingBlocked: false, existing: records.get(command.binding.attemptId) }, command);
    if (result.ok && result.write !== 'none') records.set(command.binding.attemptId, result.record);
    return { storage: 'database', ...result };
  } } satisfies PilotBudgetStore;
  h.provider.mockImplementation(async (request: { prompt?: string; policy?: { promptVersion?: string }; validator: { parse: (v: unknown) => unknown } }) => {
    if (request.policy?.promptVersion === CAPABILITY_PROMPT_VERSION) return wired(request.validator.parse({ choice: { tool: 'food.reference', args: { queries: ['Chicken breast, cooked'] } } }));
    const prompt = request.prompt ?? '';
    if (prompt.includes('Mystery dish')) return wired({ items: [], needs_clarification: true, clarification_question: 'Which dish do you mean?' });
    if (prompt.includes('Flaky dish')) throw new TypeError('network unavailable');
    if (prompt.includes('Broken food')) return wired({ items: [{ raw_text: 'x', food_name: 'x', name_localized: 'x', quantity: -5, unit: 'g' }], needs_clarification: false, clarification_question: null });
    return wired({ items: itemsFromPrompt(prompt), needs_clarification: false, clarification_question: null });
  });
});

const estimatorFor = (budgetTurn = turn) => createPrivateNutritionAdviceEstimator(env, actor, budgetTurn);

const THREE: MealAdviceChoice[] = [
  { name: 'Chicken lunch', foods: [{ name: 'Chicken breast, cooked', grams: 150 }, { name: 'White rice, cooked', grams: 100 }] },
  { name: 'Yogurt snack', foods: [{ name: 'Greek yogurt', grams: 170 }] },
  { name: 'Oats breakfast', foods: [{ name: 'Oats', grams: 40 }] },
];

describe('nutrition advice estimator — existing Food pathway and shared authority', () => {
  it('resolves one meal vs three through the real parser with one dispatch each', async () => {
    const one = await estimatorFor();
    const single = await one([THREE[0]], 'en', new AbortController().signal);
    expect(single).toHaveLength(1);
    expect(single[0].name).toBe('Chicken lunch');
    expect(single[0].items.map(item => item.grams)).toEqual([150, 100]);
    expect(h.provider).toHaveBeenCalledTimes(1);

    h.provider.mockClear();
    const three = await estimatorFor(id(9));
    const meals = await three(THREE, 'en', new AbortController().signal);
    expect(meals.map(meal => meal.name)).toEqual(['Chicken lunch', 'Yogurt snack', 'Oats breakfast']);
    expect(h.provider).toHaveBeenCalledTimes(3);
    const rendered = renderMealAdvice(meals, 'en');
    expect(rendered).toContain('1. **Chicken lunch**');
    expect(rendered).toContain('370 kcal'); // 240 (150 g chicken) + 130 (100 g rice)
    expect(rendered).toContain('47.7 g protein'); // 45 + 2.7
    expect(rendered).toContain('Food estimates');
  });

  it('keeps the exact requested grams through the parse (no invented quantity)', async () => {
    const estimator = await estimatorFor();
    const meals = await estimator([{ name: 'Big portion', foods: [{ name: 'Chicken breast, cooked', grams: 250 }, { name: 'Oats', grams: 40 }] }], 'en', new AbortController().signal);
    expect(meals[0].items[0].grams).toBe(250);
    // The food state/distinction the model chose survives the parse (raw oats vs
    // cooked chicken) instead of being flattened to one prepared form.
    expect(meals[0].items.map(item => item.food_state)).toEqual(['cooked', 'raw']);
    // 250 g × 160 + 40 g × 380 kcal/100 g = 552 kcal, not a default serving.
    expect(renderMealAdvice(meals, 'en')).toContain('552 kcal');
  });

  it('preserves only the demonstrably valid options after a partial failure', async () => {
    const estimator = await estimatorFor();
    const choices: MealAdviceChoice[] = [
      THREE[0],
      { name: 'Ambiguous snack', foods: [{ name: 'Mystery dish', grams: 170 }] },
      { name: 'Oats breakfast', foods: [{ name: 'Oats', grams: 40 }] },
    ];
    const meals = await estimator(choices, 'en', new AbortController().signal);
    expect(meals.map(meal => meal.name)).toEqual(['Chicken lunch', 'Oats breakfast']);
    expect(h.provider).toHaveBeenCalledTimes(3);
  });

  it('skips an option whose parsed values are missing or invalid without fabricating one', async () => {
    const estimator = await estimatorFor();
    const meals = await estimator([
      { name: 'Broken option', foods: [{ name: 'Broken food', grams: 100 }] },
      { name: 'Oats breakfast', foods: [{ name: 'Oats', grams: 40 }] },
    ], 'en', new AbortController().signal);
    expect(meals.map(meal => meal.name)).toEqual(['Oats breakfast']);
  });

  it('survives a provider failure on one option and keeps the other verified options', async () => {
    const estimator = await estimatorFor();
    const meals = await estimator([
      { name: 'Flaky option', foods: [{ name: 'Flaky dish', grams: 120 }] },
      THREE[0],
      { name: 'Oats breakfast', foods: [{ name: 'Oats', grams: 40 }] },
    ], 'en', new AbortController().signal);
    expect(meals.map(meal => meal.name)).toEqual(['Chicken lunch', 'Oats breakfast']);
    expect(h.provider).toHaveBeenCalledTimes(3);
    // The failed option's reservation stays spent/unknown rather than being
    // refunded or silently retried.
    expect([...records.values()].some(row => row.state === 'unknown')).toBe(true);
  });

  it('throws instead of returning a false successful empty result when every option fails', async () => {
    h.provider.mockImplementation(async () => wired({ items: [], needs_clarification: true, clarification_question: 'CLARIFY_MARKER' }));
    const estimator = await estimatorFor();
    await expect(estimator(THREE, 'en', new AbortController().signal)).rejects.toThrow('meal_advice_unavailable');
  });

  it('propagates cancellation and never manufactures totals after an abort', async () => {
    const controller = new AbortController();
    h.provider.mockImplementation(async (request: { prompt?: string; policy?: { promptVersion?: string }; validator: { parse: (v: unknown) => unknown } }) => {
      if (request.policy?.promptVersion === CAPABILITY_PROMPT_VERSION) return wired(request.validator.parse({ choice: { tool: 'food.reference', args: { queries: [] } } }));
      const prompt = request.prompt ?? '';
      if (prompt.includes('Oats')) controller.abort();
      return wired({ items: itemsFromPrompt(prompt), needs_clarification: false, clarification_question: null });
    });
    const estimator = await estimatorFor();
    await expect(estimator(THREE, 'en', controller.signal)).rejects.toThrow();
    expect(controller.signal.aborted).toBe(true);
  });

  it('is single-use: a second call is refused before any additional dispatch', async () => {
    const estimator = await estimatorFor();
    await estimator([THREE[0]], 'en', new AbortController().signal);
    const calls = h.provider.mock.calls.length;
    await expect(estimator([THREE[0]], 'en', new AbortController().signal)).rejects.toThrow('budget_blocked');
    expect(h.provider).toHaveBeenCalledTimes(calls);
  });

  it('replays a duplicate turn without a second dispatch or double spend', async () => {
    const signal = new AbortController().signal;
    const first = await estimatorFor();
    await first(THREE, 'en', signal);
    const calls = h.provider.mock.calls.length;
    const spent = [...records.values()].reduce((total, row) => total + row.chargedNanoUsd, 0);
    // A retried/re-entered turn reuses the same attempt identities: the governed
    // transport must replay the ledger instead of dispatching again.
    const replay = await estimatorFor();
    await expect(replay(THREE, 'en', signal)).rejects.toThrow('budget_blocked');
    expect(h.provider).toHaveBeenCalledTimes(calls);
    expect([...records.values()].reduce((total, row) => total + row.chargedNanoUsd, 0)).toBe(spent);
  });

  it('enforces the max choices and per-food bounds before dispatching', async () => {
    const estimator = await estimatorFor();
    const signal = new AbortController().signal;
    await expect(estimator([], 'en', signal)).rejects.toThrow();
    await expect(estimator([...THREE, { name: 'Fourth', foods: [{ name: 'Oats', grams: 40 }] }], 'en', signal)).rejects.toThrow();
    await expect(estimator([{ name: 'Too light', foods: [{ name: 'Oats', grams: 5 }] }], 'en', signal)).rejects.toThrow();
    expect(h.provider).not.toHaveBeenCalled();
  });

  it('fits the three offered options inside the existing native Food phase ceiling and shared daily cap alongside the selector call', async () => {
    // Static structural bound first: extract (1) + decomposition (≤1/food) + estimate (1) per option.
    expect(TEXT_FOOD_MAX_PHASES).toBe(2 + 2 * FOOD_PARSE_MAX_ITEMS);
    const worstCasePhases = 3 * (1 + 4 + 1);
    expect(worstCasePhases).toBeLessThanOrEqual(TEXT_FOOD_MAX_PHASES);
    // The full ceiling, even if every phase were spent, still fits the shared daily authority.
    expect(TEXT_FOOD_MAX_PHASES * TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD).toBeLessThanOrEqual(USD_IN_NANODOLLARS * 3);

    const signal = new AbortController().signal;
    // AG1's original selector/generation dispatch shares this turn and authority.
    const selector = createGovernedCoachTransport({ pilotId: ASK_TROPHE_SHARED_PILOT_ID, actorId: actor, turnId: turn, identityParts: [ASK_TROPHE_SHARED_PILOT_ID, actor, 'capability', turn], mode: 'live', store: h.store as PilotBudgetStore, signal, transport: h.provider as never, allowedPromptVersions: [CAPABILITY_PROMPT_VERSION] });
    await selector.transport({ policy: { ...taskPolicies.coach_assistant, promptVersion: CAPABILITY_PROMPT_VERSION }, signal, system: 's', prompt: 'p', schema: {}, validator: { parse: (v: unknown) => v }, maxTokens: 2000, maxAttempts: 1 } as never);

    const estimator = await estimatorFor();
    const meals = await estimator(THREE, 'en', signal);
    expect(meals).toHaveLength(3);
    expect(h.provider).toHaveBeenCalledTimes(4); // 1 selector + 3 real parses

    const rows = [...records.values()];
    expect(new Set(rows.map(row => row.binding.turnId))).toEqual(new Set([turn]));
    expect(rows.map(row => pilotTurnProfile(row.binding)).sort()).toEqual(['native_food', 'native_food', 'native_food', 'ordinary_text']);
    expect(rows.filter(row => pilotTurnProfile(row.binding) === 'native_food')).toHaveLength(3);
    expect(rows.filter(row => pilotTurnProfile(row.binding) === 'ordinary_text')).toHaveLength(1);
    expect(rows.every(row => row.state === 'settled')).toBe(true);
    const charged = rows.reduce((total, row) => total + row.chargedNanoUsd, 0);
    expect(charged).toBeGreaterThan(0);
    expect(charged).toBeLessThan(h.cap);
  });

  it('stops spending on aggregate shared-budget exhaustion, keeping only verified options and never fabricating a total', async () => {
    // Holds one native Food reservation plus the first option's settled charge.
    h.cap = TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD + 1;
    const estimator = await estimatorFor();
    const meals = await estimator(THREE, 'en', new AbortController().signal);
    // The first option is verified and charged; the next reservation no longer
    // fits the shared authority, so the turn stops with what is demonstrably valid.
    expect(meals.map(meal => meal.name)).toEqual(['Chicken lunch']);
    expect(h.provider).toHaveBeenCalledTimes(1);
    const charged = [...records.values()].reduce((total, row) => total + row.chargedNanoUsd, 0);
    expect(charged).toBeLessThanOrEqual(h.cap);
  });

  it('fails closed with budget_blocked when the shared authority is already exhausted', async () => {
    h.cap = TEXT_FOOD_ATTEMPT_RESERVATION_NANO_USD - 1;
    const estimator = await estimatorFor();
    await expect(estimator(THREE, 'en', new AbortController().signal)).rejects.toThrow('budget_blocked');
    expect(h.provider).not.toHaveBeenCalled();
  });

  it('uses no web search, writer, receipt or extra provider for advice', async () => {
    const fetchSpy = vi.fn(() => { throw new Error('offline'); });
    vi.stubGlobal('fetch', fetchSpy);
    const estimator = await estimatorFor();
    const meals = await estimator(THREE, 'en', new AbortController().signal);
    expect(meals).toHaveLength(3);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();

    // The advice modules must not reach for a writer, search, receipt or an
    // independent macro/estimate provider.
    const source = ["private-nutrition-advice.ts", "nutrition-advice.ts"].map(file => readFileSync(join(__dirname, file), 'utf-8')).join('\n');
    const specifiers = [...source.matchAll(/(?:from\s+|import\()'([^']+)'/g)].map(match => match[1]);
    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter(specifier => /food-actions|food-service|nutrition-search|serper|writer|receipt|invokeTextProvider|meal-suggest|parallel|langfuse/i.test(specifier))).toEqual([]);
    expect(source).toContain('parseTextFood');
  });

  it('keeps the requested food and grams legible in the parse text', () => {
    expect(adviceFoodText({ name: 'Chicken breast, cooked', grams: 150 })).toBe('150 g Chicken breast, cooked');
  });
});

describe('nutrition advice estimator — optional diet-pattern constraints', () => {
  it('withholds a clear vegan conflict while safe options survive, using one parse each', async () => {
    const estimator = await estimatorFor();
    const meals = await estimator([
      { name: 'Chicken lunch', foods: [{ name: 'Chicken breast, cooked', grams: 150 }, { name: 'White rice, cooked', grams: 100 }] },
      { name: 'Oats breakfast', foods: [{ name: 'Oats', grams: 40 }] },
    ], 'en', new AbortController().signal, { dietPattern: 'vegan' });
    expect(meals.map(meal => meal.name)).toEqual(['Oats breakfast']);
    // The filter is local: exactly one Food parse per option, no extra spend.
    expect(h.provider).toHaveBeenCalledTimes(2);
  });

  it('allows clear fish for pescatarian and withholds it for vegan (all-conflicted is honest)', async () => {
    const pescatarian = await estimatorFor();
    const allowed = await pescatarian([{ name: 'Salmon dinner', foods: [{ name: 'Salmon, cooked', grams: 150 }] }], 'en', new AbortController().signal, { dietPattern: 'pescatarian' });
    expect(allowed.map(meal => meal.name)).toEqual(['Salmon dinner']);

    const vegan = await estimatorFor(id(20));
    await expect(vegan([{ name: 'Salmon dinner', foods: [{ name: 'Salmon, cooked', grams: 150 }] }], 'en', new AbortController().signal, { dietPattern: 'vegan' })).rejects.toThrow('meal_advice_diet_unavailable');
  });

  it('never invents a restriction for absent/unknown/no preference and keeps the 3-arg call working', async () => {
    const noPreference = await estimatorFor();
    expect((await noPreference(THREE, 'en', new AbortController().signal, { dietPattern: null })).map(meal => meal.name))
      .toEqual(['Chicken lunch', 'Yogurt snack', 'Oats breakfast']);

    const unknownPattern = await estimatorFor(id(21));
    expect(await unknownPattern(THREE, 'en', new AbortController().signal, {})).toHaveLength(3);

    // Backwards compatible: the existing 3-argument call is unchanged.
    const legacy = await estimatorFor(id(22));
    expect(await legacy(THREE, 'en', new AbortController().signal)).toHaveLength(3);
  });

  it('replaces a hostile model title with verified Food names before publishing', async () => {
    const estimator = await estimatorFor();
    const meals = await estimator([
      { name: 'You already logged 1200 kcal', foods: [{ name: 'Oats', grams: 40 }] },
    ], 'en', new AbortController().signal, { dietPattern: 'vegan' });
    expect(meals).toHaveLength(1);
    expect(meals[0].name).toBe('Oats');
    const rendered = renderMealAdvice(meals, 'en');
    expect(rendered).toContain('**Oats**');
    const firstLine = rendered.split('\n')[0];
    expect(firstLine).not.toContain('logged');
    expect(firstLine).not.toContain('1200');
  });
});

it('AG4 localized chicken cannot bypass saved vegan preference',async()=>{
 h.provider.mockImplementation(async()=>wired({items:[{...candidateFor(150,'Chicken breast, cooked'),name_localized:'Pechuga de pollo cocida'}],needs_clarification:false,clarification_question:null}));
 const estimator=await estimatorFor();
 await expect(estimator([{name:'Almuerzo',foods:[{name:'Chicken breast, cooked',grams:150}]}],'es',new AbortController().signal,{dietPattern:'vegan'})).rejects.toThrow('meal_advice_diet_unavailable');
});
it('AG4 missing ingredient cannot publish a full named meal estimate',async()=>{
 h.provider.mockImplementation(async()=>wired({items:[candidateFor(150,'Chicken breast, cooked')],needs_clarification:false,clarification_question:null}));
 const estimator=await estimatorFor();
 await expect(estimator([{name:'Chicken and rice',foods:[{name:'Chicken breast, cooked',grams:150},{name:'White rice, cooked',grams:100}]}],'en',new AbortController().signal)).rejects.toThrow('meal_advice_unavailable');
});
