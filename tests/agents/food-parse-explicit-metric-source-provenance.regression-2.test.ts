/**
 * Regression 2 — explicit metric portion provenance on a DB-miss item.
 *
 * Regression 1 gated the deterministic metric mass on the model's
 * `portion_explicit` boolean. That boolean is model-reported and unreliable:
 * the SAME typed amount ("cola 30 ml") with `portion_explicit: false` (or the
 * field simply missing) fell back to the model's `estimated_grams` and could
 * again log 15 000 g / 6 300 kcal for a 30 ml serving.
 *
 * The authoritative signal is the user's raw input text, not the boolean. We
 * resolve the metric amount only when the typed <number><metric-unit> pair is
 * actually present at the raw-input boundary; we never promote an arbitrary
 * model-estimated quantity into a user measurement.
 *
 * These tests drive the real `run()` pipeline with only the DB lookup, the
 * provider transport, and the composite decomposer stubbed. No network, no DB,
 * no credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  items: [] as unknown[],
}));

// Keep the real unit-resolution helpers (lookup.ts is schema-imports only, no
// connection at import time) so the canonical conversion is exercised.
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

function colaCandidate(overrides: Partial<V4Candidate> = {}): V4Candidate {
  return {
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
    // The model's hallucinated portion (500× the typed amount).
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
    ...overrides,
  };
}

describe('explicit metric portion provenance on a DB miss', () => {
  beforeEach(() => { h.items = []; });

  it('resolves a typed "30 ml" even when the model reports portion_explicit=false', async () => {
    h.items = [colaCandidate({ portion_explicit: false })];

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
    });
  });

  it('resolves a typed "30 ml" even when portion_explicit is missing', async () => {
    h.items = [colaCandidate({ portion_explicit: undefined })];

    const result = await run({ text: 'cola 30 ml' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item.grams).toBe(30);
    expect(item.calories).toBe(12.6);
  });

  it('does not promote a model-estimated quantity when no metric amount was typed', async () => {
    // The model invented quantity=30 / unit=ml from a serving phrase; the user
    // never typed an amount. That is an estimate, not a measurement — it must
    // not be converted as though it were user-supplied provenance.
    h.items = [colaCandidate({ raw_text: 'cola with ice', portion_explicit: false })];

    const result = await run({ text: 'cola with ice' });

    expect(result.ok).toBe(true);
    const [item] = result.output!.items;
    expect(item.grams).not.toBe(30);
    // Falls back to the model's own estimate (unchanged, not fabricated).
    expect(item.grams).toBe(15_000);
  });
});
