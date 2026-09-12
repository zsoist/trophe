/**
 * Regression 4 — the metric provenance check must bind an amount to the item it
 * describes, not to any matching number elsewhere in the entry.
 *
 * `sourceDeclaresDirectMetricPortion` (regressions 1–2) scanned the WHOLE raw
 * input for a `<number><metric-unit>` pair. Two fabrication paths remained:
 *
 *  1. Multi-item borrowing: in "rice 150 g and cola", a cola candidate that
 *     reported quantity=150/unit=g (a model slip) matched rice's "150 g" and was
 *     logged as 150 g of cola — the amount the user typed for a *different* food.
 *  2. Negation: "cola, not 30 ml" was read as a 30 ml measurement even though the
 *     user explicitly denied it.
 *
 * The fix associates each metric pair with the candidate whose food text sits
 * nearest (span binding) and ignores negated amounts. These tests drive the real
 * `run()` pipeline with only the DB lookup, provider transport and composite
 * decomposer stubbed — no network, no DB, no credentials.
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

/** A DB-miss CoT candidate. `estimated_grams` is the model's own hallucinated
 *  portion — far larger than any typed amount — so a borrowed measurement is
 *  unambiguously distinguishable from the model's fallback estimate. */
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

describe('metric span binding on a DB miss', () => {
  beforeEach(() => { h.items = []; });

  it('does not let one item borrow another item’s amount (multi-item)', async () => {
    h.items = [
      candidate({
        raw_text: 'rice 150 g', food_name: 'rice', name_localized: 'rice',
        quantity: 150, unit: 'g', per_100g_kcal: 347,
      }),
      // Model slip: cola copies rice's quantity/unit but has no typed amount of
      // its own ("cola" alone in the source).
      candidate({
        raw_text: 'cola', food_name: 'cola', name_localized: 'cola',
        quantity: 150, unit: 'g',
      }),
    ];

    const result = await run({ text: 'rice 150 g and cola' });

    expect(result.ok).toBe(true);
    const rice = result.output!.items.find((i) => i.food_name === 'rice');
    const cola = result.output!.items.find((i) => i.food_name === 'cola');
    // rice legitimately resolves to the typed 150 g.
    expect(rice?.grams).toBe(150);
    // cola must NOT inherit rice's 150 g — it falls back to its own estimate.
    expect(cola?.grams).not.toBe(150);
    expect(cola?.grams).toBe(15_000);
  });

  it('ignores a negated metric amount (does not read "not 30 ml" as 30 ml)', async () => {
    h.items = [
      candidate({ raw_text: 'cola', food_name: 'cola', name_localized: 'cola', quantity: 30, unit: 'ml' }),
    ];

    const result = await run({ text: 'cola, not 30 ml' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item.grams).not.toBe(30);
    expect(item.grams).toBe(15_000);
  });

  it('resolves two items with their own typed metric amounts (positive)', async () => {
    h.items = [
      candidate({
        raw_text: 'rice 150 g', food_name: 'rice', name_localized: 'rice',
        quantity: 150, unit: 'g', per_100g_kcal: 340, per_100g_protein: 7, per_100g_carbs: 74, per_100g_fat: 1,
      }),
      candidate({
        raw_text: 'cola 330 ml', food_name: 'cola', name_localized: 'cola',
        quantity: 330, unit: 'ml', per_100g_kcal: 42, per_100g_protein: 0, per_100g_carbs: 10.6, per_100g_fat: 0,
      }),
    ];

    const result = await run({ text: 'rice 150 g and cola 330 ml' });

    expect(result.ok).toBe(true);
    const rice = result.output!.items.find((i) => i.food_name === 'rice');
    const cola = result.output!.items.find((i) => i.food_name === 'cola');
    expect(rice?.grams).toBe(150);
    expect(cola?.grams).toBe(330);
    expect(cola?.calories).toBe(138.6); // 42 kcal/100ml × 330 ml
  });

  it('binds an amount that follows a comma after the food name (positive)', async () => {
    h.items = [
      candidate({
        raw_text: 'cola 30 ml', food_name: 'cola', name_localized: 'cola',
        quantity: 30, unit: 'ml', per_100g_kcal: 42, per_100g_protein: 0, per_100g_carbs: 10.6, per_100g_fat: 0,
      }),
    ];

    const result = await run({ text: 'cola, 30 ml' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item.grams).toBe(30);
    expect(item.calories).toBe(12.6);
  });

  it('still binds a single localized amount when the model translated raw_text (positive)', async () => {
    // The user typed a Greek amount; the model returned an English food name, so
    // there is no surface anchor — but the entry has exactly one unclaimed metric
    // pair matching the reported quantity, which is unambiguous.
    h.items = [
      candidate({
        raw_text: 'rice', food_name: 'rice', name_localized: 'rice',
        quantity: 150, unit: 'g', per_100g_kcal: 340, per_100g_protein: 7, per_100g_carbs: 74, per_100g_fat: 1,
      }),
    ];

    const result = await run({ text: 'ρύζι 150 γρ' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item.grams).toBe(150);
  });
});
