/**
 * Regression 8 — an explicitly DENIED food component must never be logged.
 *
 * The v9 prompt tells the model "χωρίς" / "without" / "sin" = EXCLUDE that
 * component entirely ("burger sin queso", "σουβλάκι κοτόπουλο χωρίς πίτα",
 * "salad without dressing"). But prompt wording is not a sufficient control —
 * the same reasoning that added deterministic guards for invented brands and
 * borrowed/negated metric amounts. Metric-amount negation was already handled
 * ("cola, not 30 ml"); negation of a whole ITEM was not.
 *
 * Consequence: a model slip that still returns the denied component logged its
 * macros (often with a hallucinated portion — the mocked estimate is 15000 g /
 * 6300 kcal), inflating the meal with food the user explicitly excluded.
 *
 * The fix drops only items whose own anchor is immediately preceded by a
 * negation cue (optionally through an article), so "sin azúcar coca cola"
 * negates the sugar — never the drink. These tests drive the real `run()`
 * pipeline with the DB lookup, provider transport and decomposer stubbed — no
 * network, no DB, no credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock('@/agents/food-parse/lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agents/food-parse/lookup')>();
  return {
    ...actual,
    lookupFoodBatch: async () => [null],
    lookupFood: async () => null,
    ragPreSearch: async () => [],
    formatRagContext: () => '',
  };
});
vi.mock('@/agents/food-parse/decompose', () => ({
  decomposeAndLookup: async () => null,
  lookupCachedRecipeAsItem: async () => null,
}));
vi.mock('@/agents/runtime', () => ({
  executeAiTask: async (cfg: { invoke: (args: unknown) => Promise<unknown> }) => {
    const output = await cfg.invoke({
      policy: { model: 'test-model', provider: 'google' },
      signal: undefined,
    });
    return {
      output,
      generationId: 'test-generation',
      latencyMs: 1,
      rawStatus: 200,
      usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      selectedPolicy: { model: 'test-model', provider: 'google' },
    };
  },
}));
vi.mock('@/agents/runtime/providers/structured', () => ({
  invokeStructuredProvider: async () => ({
    items: h.items,
    needs_clarification: false,
    clarification_question: null,
  }),
}));
vi.mock('@/agents/runtime/provider-access', () => ({
  assertPaidProviderAccess: () => {},
  isPaidAiAllowed: () => false,
}));
vi.mock('@/agents/clients/google', () => ({ default: {} }));

import { run } from '@/agents/food-parse/index.v4';
import type { V4Candidate } from '@/agents/food-parse/index.v4';

/** A DB-miss CoT candidate with a deliberately absurd model portion so a
 *  surviving denied item is unmistakable in the output totals. */
function candidate(overrides: Partial<V4Candidate>): V4Candidate {
  return {
    raw_text: 'food',
    food_name: 'food',
    name_localized: 'food',
    quantity: 1,
    unit: 'serving',
    qualifier: null,
    food_state: 'unknown',
    portion_explicit: true,
    confidence: 0.9,
    recognized: true,
    estimated_grams: 15_000,
    estimated_calories: 6_300,
    estimated_protein_g: 0,
    estimated_carbs_g: 1_590,
    estimated_fat_g: 0,
    estimation_confidence: 0.8,
    per_100g_kcal: 42,
    per_100g_protein: 0,
    per_100g_carbs: 10.6,
    per_100g_fat: 0,
    nutrition_reasoning: 'estimate',
    ...overrides,
  };
}

function names(result: Awaited<ReturnType<typeof run>>): string[] {
  return (result.output?.items ?? []).map((item) => item.food_name);
}

describe('whole-item negation', () => {
  beforeEach(() => { h.items = []; });

  it('drops a component the user explicitly excluded (ES "sin")', async () => {
    h.items = [
      candidate({ raw_text: 'hamburguesa', food_name: 'hamburger', name_localized: 'hamburguesa' }),
      candidate({ raw_text: 'queso', food_name: 'cheese', name_localized: 'queso' }),
    ];

    const result = await run({ text: 'hamburguesa sin queso', language: 'es' });

    expect(result.ok).toBe(true);
    expect(names(result)).toEqual(['hamburger']);
    // The denied item's fabricated macros never reach the meal totals.
    expect(result.output!.items).toHaveLength(1);
  });

  it('drops a denied accompaniment in Greek ("χωρίς πίτα")', async () => {
    h.items = [
      candidate({ raw_text: 'σουβλάκι κοτόπουλο', food_name: 'souvlaki chicken', name_localized: 'σουβλάκι κοτόπουλο' }),
      candidate({ raw_text: 'πίτα', food_name: 'pita bread', name_localized: 'πίτα' }),
    ];

    const result = await run({ text: 'σουβλάκι κοτόπουλο χωρίς πίτα', language: 'el' });

    expect(result.ok).toBe(true);
    expect(names(result)).toEqual(['souvlaki chicken']);
  });

  it('drops a denied dressing in English ("without")', async () => {
    h.items = [
      candidate({ raw_text: 'salad', food_name: 'side salad', name_localized: 'salad' }),
      candidate({ raw_text: 'dressing', food_name: 'ranch dressing', name_localized: 'dressing' }),
    ];

    const result = await run({ text: 'salad without dressing' });

    expect(result.ok).toBe(true);
    expect(names(result)).toEqual(['side salad']);
  });

  it('keeps a component that is present, not negated', async () => {
    h.items = [
      candidate({ raw_text: 'cereal', food_name: 'cereal', name_localized: 'cereal' }),
      candidate({ raw_text: 'leche', food_name: 'milk', name_localized: 'leche' }),
    ];

    const result = await run({ text: 'cereal con leche', language: 'es' });

    expect(result.ok).toBe(true);
    expect(names(result).sort()).toEqual(['cereal', 'milk']);
  });

  it('negates the modifier, not the food: "sin azúcar coca cola" keeps the drink', async () => {
    h.items = [
      candidate({ raw_text: 'coca cola', food_name: 'cola', name_localized: 'coca cola' }),
      candidate({ raw_text: 'azúcar', food_name: 'table sugar', name_localized: 'azúcar' }),
    ];

    const result = await run({ text: 'sin azúcar coca cola', language: 'es' });

    expect(result.ok).toBe(true);
    expect(names(result)).toEqual(['cola']);
  });

  it('does not turn an all-denied meal into a loggable item ("sin queso")', async () => {
    // BEFORE: the never-empty guard kept every item when they all looked
    // negated, so "sin queso" logged a 15000 g / 6300 kcal cheese the user had
    // explicitly removed. The user's denial must never become an accepted meal
    // just to keep the list non-empty: route to clarification with NO items.
    h.items = [
      candidate({ raw_text: 'queso', food_name: 'cheese', name_localized: 'queso' }),
    ];

    const result = await run({ text: 'sin queso', language: 'es' });

    expect(result.ok).toBe(true);
    expect(result.output!.items).toEqual([]);
    expect(result.output!.needs_clarification).toBe(true);
    expect(result.output!.clarification_question).toBeTruthy();
    // No synthesized replacement food or macros.
    expect(names(result)).toEqual([]);
  });

  it('keeps the retained item and drops the denied one (mixed)', async () => {
    h.items = [
      candidate({ raw_text: 'ensalada', food_name: 'side salad', name_localized: 'ensalada' }),
      candidate({ raw_text: 'aderezo', food_name: 'ranch dressing', name_localized: 'aderezo' }),
      candidate({ raw_text: 'pollo', food_name: 'grilled chicken', name_localized: 'pollo' }),
    ];

    const result = await run({ text: 'ensalada de pollo sin aderezo', language: 'es' });

    expect(result.ok).toBe(true);
    expect(names(result).sort()).toEqual(['grilled chicken', 'side salad']);
    // The denied dressing's fabricated macros never reach the meal.
    expect(result.output!.items.some((item) => item.food_name === 'ranch dressing')).toBe(false);
  });

  it('does not drop an item that is affirmatively present elsewhere', async () => {
    // "sin queso" denies the cheese on the burger, but "30g de queso aparte"
    // re-affirms cheese. The later affirmative anchor must win — the item is
    // not dropped on the first (negated) anchor.
    h.items = [
      candidate({ raw_text: 'hamburguesa', food_name: 'hamburger', name_localized: 'hamburguesa' }),
      candidate({ raw_text: 'queso', food_name: 'cheese', name_localized: 'queso' }),
    ];

    const result = await run({ text: 'hamburguesa sin queso, 30g de queso aparte', language: 'es' });

    expect(result.ok).toBe(true);
    expect(names(result).sort()).toEqual(['cheese', 'hamburger']);
  });
});
