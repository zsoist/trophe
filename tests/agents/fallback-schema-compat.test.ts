/**
 * tests/agents/fallback-schema-compat.test.ts
 *
 * Validates that primary and fallback providers for each task produce
 * outputs compatible with the same Zod validator. This prevents a scenario
 * where the primary (e.g. Gemini) returns a shape that passes validation,
 * but the fallback (e.g. DeepSeek) returns a slightly different shape that
 * silently fails.
 *
 * Strategy: generate a representative output fixture per schema, validate it
 * against the Zod validator, then verify all fields the pipeline accesses exist.
 */

import { describe, expect, it } from 'vitest';
import { foodParseStructuredSchema } from '../../agents/schemas/food-parse-structured';
import { macroEstimateStructuredSchema } from '../../agents/schemas/macro-estimate-structured';
import { taskFallbacks } from '../../agents/router/policies';
import { taskPolicies } from '../../agents/router/policies';

// ── food_parse schema compat ──────────────────────────────────────────────

const FOOD_PARSE_FIXTURE = {
  items: [
    {
      raw_text: '2 eggs scrambled',
      food_name: 'egg_scrambled',
      name_localized: 'huevos revueltos',
      quantity: 2,
      unit: 'piece',
      qualifier: null,
      food_state: 'cooked',
      portion_explicit: true,
      confidence: 0.9,
      recognized: true,
    },
  ],
  needs_clarification: false,
  clarification_question: null,
};

const MACRO_ESTIMATE_FIXTURE = {
  estimates: [
    {
      food_name: 'scrambled eggs',
      grams: 122,
      calories: 197,
      protein_g: 13.6,
      carbs_g: 1.6,
      fat_g: 14.8,
      fiber_g: 0,
      sugar_g: 0.4,
    },
  ],
};

describe('Fallback schema compatibility', () => {
  it('food_parse fixture passes the structured validator', () => {
    const result = foodParseStructuredSchema.safeParse(FOOD_PARSE_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('macro_estimate fixture passes the structured validator', () => {
    const result = macroEstimateStructuredSchema.safeParse(MACRO_ESTIMATE_FIXTURE);
    expect(result.success).toBe(true);
  });

  it('food_parse fallback stays inside the compliance lane', () => {
    const primary = taskPolicies.food_parse;
    const fallback = taskFallbacks.food_parse;
    expect(fallback).toBeDefined();
    expect(primary).toMatchObject({ provider: 'openai', model: 'gpt-5.6-luna' });
    expect(fallback).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    expect(fallback!.timeoutMs).toBeGreaterThan(primary.timeoutMs);
  });

  it('meal_suggest has a defined fallback', () => {
    expect(taskFallbacks.meal_suggest).toBeDefined();
    expect(taskFallbacks.meal_suggest!.provider).toBeTruthy();
  });

  it('memory_extract has a defined fallback', () => {
    expect(taskFallbacks.memory_extract).toBeDefined();
    expect(taskFallbacks.memory_extract!.provider).toBe('anthropic');
    expect(taskFallbacks.memory_extract!.model).toBe('claude-haiku-4-5-20251001');
  });

  it('coach_insight fallback cannot send health context to DeepSeek', () => {
    expect(taskFallbacks.coach_insight).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
    });
  });

  it('food_parse schema requires all pipeline-critical fields', () => {
    // These fields are accessed by index.v4.ts during pipeline processing.
    // If the schema doesn't require them, a fallback provider might omit them.
    const requiredPaths = ['needs_clarification'];
    const itemPaths = ['food_name', 'quantity', 'unit', 'raw_text', 'confidence', 'recognized'];

    for (const path of requiredPaths) {
      const missing = { ...FOOD_PARSE_FIXTURE, [path]: undefined };
      const result = foodParseStructuredSchema.safeParse(missing);
      expect(result.success, `Schema should reject missing '${path}'`).toBe(false);
    }

    // 'items' deliberately defaults to [] — DeepSeek omits it when asking for
    // clarification, and rejecting the parse 422'd valid clarification turns.
    const noItems = { ...FOOD_PARSE_FIXTURE, items: undefined };
    const parsed = foodParseStructuredSchema.safeParse(noItems);
    expect(parsed.success, 'Missing items should coerce to []').toBe(true);
    if (parsed.success) expect(parsed.data.items).toEqual([]);

    for (const path of itemPaths) {
      const badItem = { ...FOOD_PARSE_FIXTURE.items[0], [path]: undefined };
      const bad = { ...FOOD_PARSE_FIXTURE, items: [badItem] };
      const result = foodParseStructuredSchema.safeParse(bad);
      expect(result.success, `Schema should reject missing item.${path}`).toBe(false);
    }
  });

  it('macro_estimate schema requires all pipeline-critical fields', () => {
    const estPaths = ['food_name', 'grams', 'calories'];

    for (const path of estPaths) {
      const badEst = { ...MACRO_ESTIMATE_FIXTURE.estimates[0], [path]: undefined };
      const bad = { estimates: [badEst] };
      const result = macroEstimateStructuredSchema.safeParse(bad);
      expect(result.success, `Schema should reject missing estimate.${path}`).toBe(false);
    }
  });
});
