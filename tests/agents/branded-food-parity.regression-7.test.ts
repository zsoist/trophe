/**
 * Regression 7 — branded food identity parity (ES/EN singular + plural).
 *
 * Reported defect: the user typed/said "dos Big Macs" and Food returned the
 * generic "burger". Root cause: `agents/food-parse/brand-fidelity.ts` guarded
 * brand stripping with a SINGULAR intent regex (`/\bbig\s+mac\b/i`). There is no
 * word boundary between "mac" and the plural "s", so the guard never fired for a
 * plural mention, and the explicitly named brand was stripped exactly as if the
 * model had invented it — the model candidate ("Big Mac") matched the candidate
 * regex, the user's own text did NOT match the intent regex.
 *
 * These tests drive the real `run()` pipeline (index.v4) with only the DB
 * lookup, the paid provider transport and the composite decomposer stubbed, so
 * they prove the brand survives the ACTUAL parse → lookup route, not just the
 * regex. No network, no DB, no credentials, no paid calls.
 */
import { describe, it, expect, vi } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** A curated branded catalogue row (McDONALD'S BIG MAC) as lookup would return. */
const bigMacRow = {
  food: {
    id: id(1),
    nameEn: "McDONALD'S, BIG MAC",
    brand: "McDonald's",
    source: 'usda',
    dataQuality: 'label',
    region: ['US'],
    kcalPer100g: 257,
    proteinPer100g: 11.6,
    carbPer100g: 20.4,
    fatPer100g: 14.9,
    fiberPer100g: 1.6,
    sugarPer100g: 3.5,
    macroConfidence: 0.95,
    canonicalFoodKey: 'mcdonalds_big_mac',
    defaultServingGrams: 215,
  },
  conversionId: 'conv-piece-bigmac',
  gramsPerUnit: 215,
};

interface CatalogueRow {
  food: {
    kcalPer100g: number;
    proteinPer100g: number;
    carbPer100g: number;
    fatPer100g: number;
    fiberPer100g: number;
    [key: string]: unknown;
  };
  conversionId: string | null;
  gramsPerUnit: number;
}

function lookupResult(row: CatalogueRow) {
  return {
    food: row.food,
    conversionId: row.conversionId,
    gramsPerUnit: row.gramsPerUnit,
    gramsTotal: (qty: number) => qty * row.gramsPerUnit,
    macros: (qty: number) => {
      const factor = (qty * row.gramsPerUnit) / 100;
      return {
        kcal: row.food.kcalPer100g * factor,
        protein: row.food.proteinPer100g * factor,
        carb: row.food.carbPer100g * factor,
        fat: row.food.fatPer100g * factor,
        fiber: row.food.fiberPer100g * factor,
      };
    },
  };
}

/** A generic, unbranded catalogue row (no brand, no McDonald's identity). */
const genericBurgerRow = {
  food: {
    id: id(2),
    nameEn: 'Burger, plain',
    brand: null,
    source: 'usda',
    dataQuality: 'label',
    region: ['US'],
    kcalPer100g: 254,
    proteinPer100g: 12.8,
    carbPer100g: 25.3,
    fatPer100g: 10.9,
    fiberPer100g: 1.5,
    sugarPer100g: 5.6,
    macroConfidence: 0.9,
    canonicalFoodKey: null,
    defaultServingGrams: 100,
  },
  conversionId: null,
  gramsPerUnit: 100,
};

/** One model candidate as the extraction phase would emit. */
function candidate(overrides: Record<string, unknown>) {
  return {
    raw_text: 'food',
    food_name: 'food',
    name_localized: 'food',
    quantity: 1,
    unit: 'piece',
    qualifier: null,
    food_state: 'unknown',
    portion_explicit: true,
    confidence: 0.9,
    recognized: true,
    ...overrides,
  };
}

const state = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  lookups: [null] as unknown[],
  lookupCalls: [] as Array<{ foodName: string; unit: string; intentText?: string }>,
}));

vi.mock('@/agents/food-parse/lookup', () => ({
  lookupFoodBatch: async (inputs: Array<{ foodName: string; unit: string; intentText?: string }>) => {
    state.lookupCalls = inputs.map(i => ({ foodName: i.foodName, unit: i.unit, intentText: i.intentText }));
    return state.lookups;
  },
  lookupFood: async () => null,
  ragPreSearch: async () => [],
  formatRagContext: () => '',
  correctFoodName: (name: string) => name,
  resolveDirectMetricUnit: () => null,
}));

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
    items: state.items,
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

function reset(items: Record<string, unknown>[], lookups: unknown[]) {
  state.items = items;
  state.lookups = lookups;
  state.lookupCalls = [];
}

describe('branded food identity parity (plural included)', () => {
  it('preserves an explicitly named brand typed in the plural (ES): "dos Big Macs"', async () => {
    reset([candidate({ raw_text: 'dos Big Macs', food_name: 'Big Mac', name_localized: 'Big Mac', quantity: 2 })], [lookupResult(bigMacRow)]);

    const result = await run({ text: 'dos Big Macs', language: 'es' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    // The brand reached the real lookup: it was NOT stripped to "burger".
    expect(state.lookupCalls[0].foodName).toBe('Big Mac');
    expect(state.lookupCalls[0].foodName).not.toContain('burger');
    // Identity + provenance come from the catalogue, not from the model.
    const [item] = result.output!.items;
    expect(item.food_name).toBe("McDONALD'S, BIG MAC");
    expect(item.brand).toBe("McDonald's");
    expect(item.db_source).toBe('usda');
    expect(item.data_quality).toBe('label');
    // Two Big Macs scale the catalogue serving basis (2 × 215 g).
    expect(item.quantity).toBe(2);
    expect(item.grams).toBe(430);
  });

  it('preserves the same brand typed in the plural (EN): "two Big Macs"', async () => {
    reset([candidate({ raw_text: 'two Big Macs', food_name: 'Big Mac', name_localized: 'Big Mac', quantity: 2 })], [lookupResult(bigMacRow)]);

    const result = await run({ text: 'two Big Macs', language: 'en' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    expect(state.lookupCalls[0].foodName).toBe('Big Mac');
    expect(result.output!.items[0].brand).toBe("McDonald's");
  });

  it('keeps quantity/serving consistency between one Big Mac and two Big Macs', async () => {
    reset([candidate({ raw_text: 'one Big Mac', food_name: 'Big Mac', name_localized: 'Big Mac', quantity: 1 })], [lookupResult(bigMacRow)]);
    const one = await run({ text: 'one Big Mac', language: 'en' });

    reset([candidate({ raw_text: 'dos Big Macs', food_name: 'Big Mac', name_localized: 'Big Mac', quantity: 2 })], [lookupResult(bigMacRow)]);
    const two = await run({ text: 'dos Big Macs', language: 'es' });

    expect(one.output!.items[0].grams).toBe(215);
    expect(two.output!.items[0].grams).toBe(430);
    expect(two.output!.items[0].grams).toBe(2 * one.output!.items[0].grams!);
    expect(two.output!.items[0].calories).toBe(one.output!.items[0].calories! * 2);
  });

  it('never invents a brand for a generic "burger" query', async () => {
    reset([candidate({ raw_text: 'burger', food_name: 'burger', name_localized: 'burger', quantity: 1, portion_explicit: false })], [lookupResult(genericBurgerRow)]);

    const result = await run({ text: 'burger', language: 'en' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    expect(state.lookupCalls[0].foodName).toBe('burger');
    const [item] = result.output!.items;
    expect(item.food_name).toBe('Burger, plain');
    expect(item.food_name).not.toContain('Big Mac');
    expect(item.brand ?? null).toBeNull();
    expect(item.db_source).toBe('usda');
  });

  it('strips a brand the user did not name even when the model emits the plural', async () => {
    // Cross-brand: user asked for a generic burger, the model claimed "Big Macs".
    reset([candidate({ raw_text: 'burger', food_name: 'Big Macs', name_localized: 'Big Macs', quantity: 1 })], [lookupResult(genericBurgerRow)]);

    const result = await run({ text: 'burger', language: 'en' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    expect(state.lookupCalls[0].foodName).toBe('burger');
    expect(result.output!.items[0].food_name).toBe('Burger, plain');
    expect(result.output!.items[0].brand ?? null).toBeNull();
  });

  it('strips a mismatched brand when the user named a different one', async () => {
    // User named the Whopper; the model claimed a Big Mac (cross-brand candidate).
    // The mismatched brand is stripped; the user's brand is never replaced by it.
    reset([candidate({ raw_text: 'dos Whoppers', food_name: 'Big Mac', name_localized: 'Big Mac', quantity: 2 })], [lookupResult(genericBurgerRow)]);

    const result = await run({ text: 'dos Whoppers', language: 'en' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    expect(state.lookupCalls[0].foodName).toBe('burger');
    expect(result.output!.items[0].food_name).not.toContain('Big Mac');
    expect(result.output!.items[0].brand ?? null).toBeNull();
  });

  it('returns an honest branded no-match instead of relabelling generic data as Big Mac', async () => {
    reset(
      [candidate({
        raw_text: 'dos Big Macs',
        food_name: 'Big Mac',
        name_localized: 'Big Mac',
        quantity: 2,
        estimated_grams: 430,
        estimated_calories: 1100,
        estimated_protein_g: 50,
        estimated_carbs_g: 88,
        estimated_fat_g: 64,
        estimation_confidence: 0.6,
      })],
      [null], // catalogue has no Big Mac row → honest miss
    );

    const result = await run({ text: 'dos Big Macs', language: 'es' });

    expect(result.ok, JSON.stringify(result.error)).toBe(true);
    // The brand name survives the query (it is the user's own words) …
    expect(state.lookupCalls[0].foodName).toBe('Big Mac');
    const [item] = result.output!.items;
    expect(item.food_name).toBe('Big Mac');
    // … but a catalogue miss is never presented as official brand data.
    expect(item.brand ?? null).toBeNull();
    expect(item.db_source ?? null).toBeNull();
    expect(item.db_food_id ?? null).toBeNull();
    expect(item.source).toBe('llm_cot');
  });
});
