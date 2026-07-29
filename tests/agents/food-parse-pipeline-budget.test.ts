import { describe, expect, it } from 'vitest';
import {
  FOOD_PARSE_MAX_ITEMS,
  FOOD_PARSE_PIPELINE_BUDGET_MS,
  foodParseItemLimitQuestion,
  hasFoodParseAiPhaseBudget,
} from '../../agents/food-parse/pipeline-budget';
import {
  FOOD_PARSE_COMPUTED_MAX_PROVIDER_ATTEMPTS,
  FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS,
} from '../../lib/ai/food-parse-limits';
import { macroEstimateStructuredSchema } from '../../agents/schemas/macro-estimate-structured';

describe('food parse aggregate budget', () => {
  it('leaves headroom below the 60-second function cap', () => {
    expect(FOOD_PARSE_PIPELINE_BUDGET_MS).toBe(50_000);
  });

  it('starts no new AI phase without a full attempt plus cleanup reserve', () => {
    expect(hasFoodParseAiPhaseBudget(50_000, 33_000)).toBe(true);
    expect(hasFoodParseAiPhaseBudget(50_000, 34_001)).toBe(false);
  });

  it('caps one meal review at a user-manageable number of items', () => {
    expect(FOOD_PARSE_MAX_ITEMS).toBe(12);
  });

  it('explains the split-meal limit in the requested language', () => {
    expect(foodParseItemLimitQuestion('el', 14)).toContain('14');
    expect(foodParseItemLimitQuestion('el', 14)).toContain('12');
    expect(foodParseItemLimitQuestion('el', 14)).toMatch(/[Α-Ωα-ω]/);
    expect(foodParseItemLimitQuestion('unknown', 14)).toContain('Please split');
  });

  it('computes the real transport ceiling while keeping live opaque tools disabled', () => {
    expect(FOOD_PARSE_COMPUTED_MAX_PROVIDER_ATTEMPTS).toBe(60);
    expect(FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS).toBeGreaterThan(1_000);
  });

  it('requires a stable item index for every batched macro estimate', () => {
    const estimate = {
      food_name: 'rice',
      grams: 100,
      calories: 130,
      protein_g: 2.7,
      carbs_g: 28,
      fat_g: 0.3,
      fiber_g: 0.4,
      sugar_g: 0.1,
    };

    expect(macroEstimateStructuredSchema.safeParse({
      estimates: [estimate],
    }).success).toBe(false);
    expect(macroEstimateStructuredSchema.safeParse({
      estimates: [{ ...estimate, item_index: 1 }],
    }).success).toBe(true);
  });
});
