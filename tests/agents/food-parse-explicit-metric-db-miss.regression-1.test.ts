/**
 * Regression 1 — explicit metric portion on a DB-miss item.
 *
 * Reported defect: a user typed "cola 30 ml". When the food is not in the
 * canonical DB, the pipeline trusted the model's chain-of-thought portion
 * (`estimated_grams`) verbatim, so a hallucinated 15 000 g / 6 300 kcal estimate
 * was returned for a 30 ml serving (~500× dimensional error, ~0.42 kcal/g
 * density preserved — i.e. the mass was wrong, not the per-100g profile).
 *
 * Root cause: the DB-hit path arbitrates an explicit direct metric unit to its
 * deterministic mass (`arbitrateDbVsCoT` Rule 1), but the DB-miss CoT branch
 * (`index.v4.ts`) had no equivalent guard and used `estimated_grams` directly.
 *
 * These tests drive the real `run()` pipeline with only the DB lookup, the
 * provider transport, and the composite decomposer stubbed. No network, no DB,
 * no credentials.
 */
import { describe, it, expect, vi } from 'vitest';

const colaCandidate = {
  raw_text: 'cola 30 ml',
  food_name: 'cola',
  name_localized: 'cola',
  quantity: 30,
  unit: 'ml',
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
  nutrition_reasoning: 'Cola is ~42 kcal/100ml.',
};

// DB miss: every lookup returns null so the pipeline takes its CoT fallback.
vi.mock('@/agents/food-parse/lookup', () => ({
  lookupFoodBatch: async () => [null],
  lookupFood: async () => null,
  ragPreSearch: async () => [],
  formatRagContext: () => '',
  correctFoodName: (name: string) => name,
  resolveDirectMetricUnit: (unit: string) => {
    const normalized = unit.toLowerCase().trim();
    if (normalized === 'g') return { gramsPerUnit: 1, basis: 'measured_mass' };
    if (normalized === 'kg') return { gramsPerUnit: 1000, basis: 'measured_mass' };
    if (normalized === 'ml') return { gramsPerUnit: 1, basis: 'density_assumption' };
    return null;
  },
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
    items: [colaCandidate],
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

describe('explicit metric portion on a DB miss', () => {
  it('resolves "cola 30 ml" to 30 g — not the model’s 15 kg hallucination', async () => {
    const result = await run({ text: 'cola 30 ml' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item).toMatchObject({
      quantity: 30,
      unit: 'ml',
      grams: 30,
      calories: 12.6,
      protein_g: 0,
      carbs_g: 3.2,
      fat_g: 0,
      portion_explicit: true,
    });
    // Sanity: mass dropped ~500×, per-100g density preserved (≈0.42 kcal/g).
    expect(item.unavailable_nutrients).toEqual(['fiber_g', 'sugar_g']);
    expect(item.calories / item.grams).toBeCloseTo(0.42, 2);
  });
});
