/**
 * Regression 6 — the negation predicate behind metric span binding must cover
 * every supported app language, not just English/es/fr/it/de/el.
 *
 * Regression 4 taught the binder to ignore a *negated* metric amount
 * ("cola, not 30 ml" is not a 30 ml measurement). Its `NEGATION_WORDS` set
 * omitted the Portuguese ("sem 30 ml", "não 30 ml") and Dutch ("zonder 30 ml",
 * "geen 30 ml") forms, so a denied amount in those languages was still read as
 * a real measurement and logged as e.g. 30 ml of cola.
 *
 * The fix only extends the word set — the parser/span-binding design is
 * unchanged. These tests drive the real `run()` pipeline (no network, no DB, no
 * credentials) with the localized food name present in the source, so the
 * candidate anchor exists and the amount would bind on the positive path. The
 * negative cases therefore prove the negated amount is filtered by the
 * predicate itself, not merely by the anchorless fallback.
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

/** A DB-miss CoT candidate. `estimated_grams` (15_000) is the model's own
 *  hallucinated portion — far larger than any plausible typed amount — so a
 *  borrowed measurement (e.g. 30) is unambiguously distinguishable from the
 *  unproven fallback estimate (15_000). */
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

const COLA_UNPROVEN = { quantity: 30, unit: 'ml' as const };
const RICE_POSITIVE = {
  quantity: 150,
  unit: 'g' as const,
  per_100g_kcal: 340,
  per_100g_protein: 7,
  per_100g_carbs: 74,
  per_100g_fat: 1,
};

/** One entry per supported app language: the localized food surface (so the
 *  binder finds an anchor in the source), the denied 30 ml phrase, and the
 *  positive 150 g phrase where the amount legitimately belongs to the food. */
const LOCALES = [
  { lang: 'en', food: 'cola', negated: 'cola, not 30 ml', positive: 'rice 150 g' },
  { lang: 'es', food: 'cola', negated: 'cola, sin 30 ml', positive: 'arroz 150 g' },
  { lang: 'fr', food: 'cola', negated: 'cola, sans 30 ml', positive: 'riz 150 g' },
  { lang: 'it', food: 'cola', negated: 'cola, senza 30 ml', positive: 'riso 150 g' },
  { lang: 'de', food: 'cola', negated: 'cola, ohne 30 ml', positive: 'reis 150 g' },
  { lang: 'el', food: 'cola', negated: 'cola, χωρίς 30 ml', positive: 'ρύζι 150 g' },
  { lang: 'pt', food: 'cola', negated: 'sem 30 ml de cola', positive: 'arroz 150 g' },
  { lang: 'pt', food: 'cola', negated: 'cola, não 30 ml', positive: 'arroz 150 g' },
  { lang: 'nl', food: 'cola', negated: 'cola, zonder 30 ml', positive: 'rijst 150 g' },
  { lang: 'nl', food: 'cola', negated: 'cola, geen 30 ml', positive: 'rijst 150 g' },
] as const;

describe('metric negation coverage across supported languages', () => {
  beforeEach(() => { h.items = []; });

  for (const locale of LOCALES) {
    it(`ignores a denied amount in ${locale.lang}: "${locale.negated}"`, async () => {
      h.items = [
        candidate({
          raw_text: locale.food, food_name: locale.food, name_localized: locale.food,
          ...COLA_UNPROVEN,
        }),
      ];

      const result = await run({ text: locale.negated, language: locale.lang });

      expect(result.ok).toBe(true);
      const [item] = result.output!.items;
      // The denied 30 ml must never be logged...
      expect(item.grams).not.toBe(30);
      // ...and the unproven estimate stays fail-closed at the model's fallback.
      expect(item.grams).toBe(15_000);
    });

    it(`still binds a positive amount in ${locale.lang}: "${locale.positive}"`, async () => {
      const [food, amount] = locale.positive.split(' ');
      h.items = [
        candidate({
          raw_text: `${food} ${amount}`, food_name: food, name_localized: food,
          ...RICE_POSITIVE,
        }),
      ];

      const result = await run({ text: locale.positive, language: locale.lang });

      expect(result.ok).toBe(true);
      const [item] = result.output!.items;
      expect(item.grams).toBe(150);
    });
  }
});
