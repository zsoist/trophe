/**
 * Regression 3 — legacy (no-CoT) DB-miss metric portions.
 *
 * When the prompt has no chain-of-thought fields (`FOOD_PARSE_PROMPT_VERSION=v4`)
 * and a food misses the DB, the legacy fallback chain used
 * `grams: candidate.quantity * 100` as a rough default. That heuristic assumes
 * a "unit" portion (~100 g); applied to a typed metric amount it inflates by
 * 100× — "30 ml" became 3 000 g, "150 g" became 15 000 g, "2 kg" became 200 g.
 *
 * The fix reuses the canonical `resolveDirectMetricUnit` conversion when the
 * user actually typed a metric amount at the raw-input boundary (same
 * provenance rule as the CoT path). Non-metric portions ("2 servings") keep
 * the legacy ×100 default.
 *
 * These tests drive the real `run()` pipeline in v4 mode with only the DB
 * lookup, enrichment, decomposer and provider transport stubbed. No network,
 * no DB, no credentials.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// Must be set before the module reads it at import time.
process.env.FOOD_PARSE_PROMPT_VERSION = 'v4';

const h = vi.hoisted(() => ({
  items: [] as unknown[],
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
// Isolate the legacy `quantity * 100` default from the small static DB, which
// would otherwise enrich the placeholder before the assertion.
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
    if (args.toolName === 'submit_macro_estimates') return { estimates: [] };
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

function missCandidate(overrides: Partial<import('@/agents/food-parse/index.v4').V4Candidate> = {}) {
  return {
    raw_text: 'cola 30 ml',
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

async function gramsFor(text: string, candidate: ReturnType<typeof missCandidate>): Promise<number> {
  h.items = [candidate];
  const result = await run({ text });
  expect(result.ok).toBe(true);
  return result.output!.items[0].grams;
}

describe('legacy no-CoT DB-miss metric portions', () => {
  beforeEach(() => { h.items = []; });

  it('converts a typed "30 ml" via the canonical metric unit (not ×100 → 3000 g)', async () => {
    const grams = await gramsFor('cola 30 ml', missCandidate({ quantity: 30, unit: 'ml' }));
    expect(grams).toBe(30);
  });

  it('converts a typed "150 g" via the canonical metric unit (not ×100 → 15000 g)', async () => {
    const grams = await gramsFor(
      'rice 150 g',
      missCandidate({ raw_text: 'rice 150 g', food_name: 'rice', name_localized: 'rice', quantity: 150, unit: 'g' }),
    );
    expect(grams).toBe(150);
  });

  it('converts a typed "2 kg" via the canonical metric unit (not ×100 → 200 g)', async () => {
    const grams = await gramsFor(
      'rice 2 kg',
      missCandidate({ raw_text: 'rice 2 kg', food_name: 'rice', name_localized: 'rice', quantity: 2, unit: 'kg' }),
    );
    expect(grams).toBe(2_000);
  });

  it('preserves the legacy ×100 default for a non-metric portion', async () => {
    const grams = await gramsFor(
      'mystery dish 2 servings',
      missCandidate({
        raw_text: 'mystery dish 2 servings',
        food_name: 'mystery dish',
        name_localized: 'mystery dish',
        quantity: 2,
        unit: 'serving',
      }),
    );
    expect(grams).toBe(200);
  });
});
