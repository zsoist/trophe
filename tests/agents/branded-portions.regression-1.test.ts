import { describe, expect, it } from 'vitest';
import { arbitrateDbVsCoT, type V4Candidate } from '@/agents/food-parse/index.v4';

// Regression: branded label macros must not be replaced by generic LLM estimates.
describe('high-confidence branded food portions', () => {
  it('keeps FAGE label macros for an explicit 170g serving', () => {
    const candidate: V4Candidate = {
      raw_text: '1 FAGE Total 2% yogurt',
      food_name: 'FAGE Total 2% Greek yogurt',
      name_localized: 'FAGE Total 2% Greek yogurt',
      quantity: 1,
      unit: 'serving',
      portion_explicit: true,
      confidence: 0.95,
      recognized: true,
      estimated_grams: 200,
      estimated_calories: 190,
      estimated_protein_g: 18,
      estimated_carbs_g: 12,
      estimated_fat_g: 8,
      estimation_confidence: 0.8,
      per_100g_kcal: 95,
      per_100g_protein: 9,
      per_100g_carbs: 6,
      per_100g_fat: 4,
    };

    const result = arbitrateDbVsCoT(
      candidate,
      { kcal: 124, protein: 20, carb: 6, fat: 3.4, fiber: 0 },
      170,
      3.5,
      0.75,
      true,
      true,
      { kcal: 73, protein: 11.8, carb: 3.5, fat: 2, fiber: 0 },
      0.95,
    );

    expect(result).toMatchObject({
      source: 'local_db', grams: 170, calories: 124,
      protein_g: 20, carbs_g: 6, fat_g: 3.4,
    });
  });
});
