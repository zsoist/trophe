/**
 * Regression 5 — a recognized metric unit with no proven user amount must never
 * fall back to the non-metric `quantity * 100` default.
 *
 * In v4 (no chain-of-thought) mode a DB-miss item used
 * `grams: candidate.quantity * 100`. For a metric unit whose amount could not be
 * bound to the user's own text, that heuristic inflated "30 ml" to 3 000 g. The
 * same default lived in `estimateMacrosViaLLM` (`est.grams ?? quantity * 100`),
 * so a model that returned calories but omitted grams silently re-created the
 * 3 000 g mass.
 *
 * The fix: for a recognized metric unit without proven provenance, leave the
 * mass unknown. A reviewed estimator weight is used when supplied; otherwise the
 * item is reported as unmeasurable and the user is asked to confirm the amount.
 * Legacy ×100 is retained only for genuinely non-metric portions ("2 servings").
 *
 * These tests drive the real `run()` pipeline in v4 mode with only the DB
 * lookup, enrichment, decomposer and provider transport stubbed.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Must be set before the module reads it at import time.
process.env.FOOD_PARSE_PROMPT_VERSION = 'v4';

const h = vi.hoisted(() => ({
  items: [] as unknown[],
  estimates: [] as unknown[],
}));

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
// Isolate the legacy default from the small static DB, which would otherwise
// enrich the placeholder before the assertion.
vi.mock('@/agents/food-parse/enrich', () => ({
  enrichWithLocalDB: (items: unknown[]) => items,
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
  invokeStructuredProvider: async (args: { toolName?: string }) => {
    if (args.toolName === 'submit_macro_estimates') return { estimates: h.estimates };
    return {
      items: h.items,
      needs_clarification: false,
      clarification_question: null,
    };
  },
}));
vi.mock('@/agents/runtime/provider-access', () => ({
  assertPaidProviderAccess: () => {},
  isPaidAiAllowed: () => false,
}));
vi.mock('@/agents/clients/google', () => ({ default: {} }));

let run: typeof import('@/agents/food-parse/index.v4').run;
beforeAll(async () => {
  vi.resetModules();
  ({ run } = await import('@/agents/food-parse/index.v4'));
});

type Item = import('@/agents/food-parse/index.v4').V4Candidate;

function item(overrides: Partial<Item>): Item {
  return {
    raw_text: 'cola',
    food_name: 'cola',
    name_localized: 'cola',
    quantity: 30,
    unit: 'ml',
    qualifier: null,
    food_state: 'unknown',
    portion_explicit: false,
    confidence: 0.9,
    recognized: true,
    ...overrides,
  };
}

describe('legacy unproven metric portion (no CoT)', () => {
  beforeEach(() => { h.items = []; h.estimates = []; });

  it('fails closed instead of fabricating 3000 g when the estimator omits grams', async () => {
    h.items = [item({ raw_text: 'cola', food_name: 'cola', name_localized: 'cola', quantity: 30, unit: 'ml' })];
    // The estimator returns calories but omits grams — the exact
    // `est.grams ?? quantity * 100` hole that re-created the 3000 g mass.
    h.estimates = [{ item_index: 1, food_name: 'cola', calories: 105 }];

    // Two-word entry so the single-word canonical-name correction doesn't
    // rewrite the unit to 'serving' before this path runs.
    const result = await run({ text: 'cola soda' });

    // Unknown, not fabricated: the pipeline fails closed rather than return a
    // 3000 g cola it cannot measure.
    expect(result.ok).toBe(false);
    expect(result.output).toBeUndefined();
  });

  it('does not fabricate 3000 g for an unproven "30 ml" (integration, two items)', async () => {
    h.items = [
      item({ raw_text: 'rice 150 g', food_name: 'rice', name_localized: 'rice', quantity: 150, unit: 'g' }),
      item({ raw_text: 'cola', food_name: 'cola', name_localized: 'cola', quantity: 30, unit: 'ml' }),
    ];
    // No estimates at all: the proven rice keeps its bound 150 g, the unproven
    // cola has no weight to report and must not fall back to ×100.
    h.estimates = [];

    const result = await run({ text: 'rice 150 g and cola' });

    expect(result.ok).toBe(true);
    expect(result.output!.items.some((i) => i.grams === 3_000)).toBe(false);
    const rice = result.output!.items.find((i) => i.food_name === 'rice');
    expect(rice?.grams).toBe(150);
    // The unweighed cola item is surfaced as unconfirmed, not fabricated.
    expect(result.output!.items.find((i) => i.food_name === 'cola')).toBeUndefined();
    expect(result.output!.needs_clarification).toBe(true);
  });

  it('uses the proven bound mass when the estimator omits grams', async () => {
    h.items = [item({ raw_text: 'rice 150 g', food_name: 'rice', name_localized: 'rice', quantity: 150, unit: 'g' })];
    h.estimates = [{ item_index: 1, food_name: 'rice', calories: 520, protein_g: 10, carbs_g: 110, fat_g: 2 }];

    const result = await run({ text: 'rice 150 g' });

    expect(result.ok).toBe(true);
    const [rice] = result.output!.items;
    expect(rice.grams).toBe(150);
    expect(rice.calories).toBe(520);
  });

  it('uses a reviewed estimator weight for an unproven metric portion (usable)', async () => {
    h.items = [item({ raw_text: 'cola', food_name: 'cola', name_localized: 'cola', quantity: 30, unit: 'ml' })];
    h.estimates = [
      { item_index: 1, food_name: 'cola', grams: 250, calories: 105, protein_g: 0.5, carbs_g: 25.5, fat_g: 0.2, fiber_g: 0, sugar_g: 25 },
    ];

    const result = await run({ text: 'cola soda' });

    expect(result.ok).toBe(true);
    const [cola] = result.output!.items;
    expect(cola.grams).toBe(250);
    expect(cola.calories).toBe(105);
    expect(cola.grams).not.toBe(3_000);
  });

  it('still keeps the legacy ×100 default for a non-metric portion', async () => {
    h.items = [item({ raw_text: 'mystery dish', food_name: 'mystery dish', name_localized: 'mystery dish', quantity: 2, unit: 'serving' })];
    h.estimates = [];

    const result = await run({ text: 'mystery dish' });

    expect(result.ok).toBe(true);
    expect(result.output!.items[0].grams).toBe(200);
  });
});
