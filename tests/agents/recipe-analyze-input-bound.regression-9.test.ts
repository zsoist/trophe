/**
 * Regression 9 — a long recipe must never be silently truncated.
 *
 * `/api/food/recipe-analyze` accepted up to 30 000 characters, but
 * `agents/recipe-analyze/index.ts` did `input.text.trim().slice(0, 4000)`.
 * A recipe longer than 4000 chars therefore had every ingredient past the cut
 * dropped, and the model returned nutrition for a DIFFERENT (smaller) recipe
 * that the user never entered — a silent, unreported wrong answer. No error,
 * no clarification: the user logs macros for food they didn't submit.
 *
 * The fix makes the bound explicit and honest: text past the supported bound is
 * REFUSED before any provider dispatch (the route validates it too), and text
 * within the bound is sent whole. These tests drive the real `run()` with the
 * provider transport and DB lookup stubbed — no network, no DB, no credentials.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ prompts: [] as string[] }));

vi.mock('@/agents/food-parse/lookup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/agents/food-parse/lookup')>();
  return {
    ...actual,
    lookupFoodBatch: async () => [],
    lookupFood: async () => null,
    ragPreSearch: async () => [],
    formatRagContext: () => '',
  };
});
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
  invokeStructuredProvider: async ({ prompt }: { prompt: string }) => {
    h.prompts.push(prompt);
    const zero = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 };
    return {
      recipe_name: 'Test recipe',
      servings: 1,
      ingredients: [],
      total: zero,
      per_serving: zero,
    };
  },
}));
vi.mock('@/agents/runtime/provider-access', () => ({
  assertPaidProviderAccess: () => {},
  isPaidAiAllowed: () => false,
}));
vi.mock('@/agents/clients/google', () => ({ default: {} }));

import { run } from '@/agents/recipe-analyze';
import { RECIPE_ANALYZE_MAX_INPUT_CHARS } from '@/agents/schemas/recipe-analyze';

/** A late ingredient that only survives if the WHOLE text is analyzed. */
const LATE_INGREDIENT = '- 500g chicken breast';

describe('recipe-analyze input bound (no silent truncation)', () => {
  beforeEach(() => { h.prompts = []; });

  it('refuses (does not truncate) a recipe past the supported bound — the late ingredient is never silently dropped', async () => {
    // The late ingredient sits past the old 4000-char cut.
    const longText = 'x'.repeat(RECIPE_ANALYZE_MAX_INPUT_CHARS + 50) + '\n' + LATE_INGREDIENT;
    expect(longText.length).toBeGreaterThan(RECIPE_ANALYZE_MAX_INPUT_CHARS);

    const result = await run({ text: longText, servings: 4, language: 'en' });

    // Never return nutrition for a silently-trimmed recipe.
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too long/i);
    expect(result.output).toBeUndefined();
    // The refusal happens BEFORE dispatch — no paid call builds a different recipe.
    expect(h.prompts).toHaveLength(0);
  });

  it('sends a within-bound recipe WHOLE — an ingredient near the end is present in the prompt', async () => {
    // Exact-length recipe: the late ingredient's last char is the 4000th.
    const text = 'y'.repeat(RECIPE_ANALYZE_MAX_INPUT_CHARS - LATE_INGREDIENT.length - 1) + '\n' + LATE_INGREDIENT;
    expect(text.length).toBe(RECIPE_ANALYZE_MAX_INPUT_CHARS);

    const result = await run({ text, servings: 4, language: 'en' });

    expect(result.ok).toBe(true);
    expect(h.prompts).toHaveLength(1);
    expect(h.prompts[0]).toContain(LATE_INGREDIENT);
  });

  it('still returns the empty/clarification contract for whitespace-only text', async () => {
    const result = await run({ text: '   ', servings: 4, language: 'en' });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/text is required/i);
    expect(h.prompts).toHaveLength(0);
  });
});
