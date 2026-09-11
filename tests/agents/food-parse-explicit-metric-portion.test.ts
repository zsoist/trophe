import { describe, expect, it } from 'vitest';
import { arbitrateDbVsCoT, type V4Candidate } from '@/agents/food-parse/index.v4';

function colaCandidate(overrides: Partial<V4Candidate> = {}): V4Candidate {
  return {
    raw_text: 'cola 30 ml',
    food_name: 'cola',
    name_localized: 'cola',
    quantity: 30,
    unit: 'ml',
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
    ...overrides,
  };
}

describe('explicit metric portion arbitration', () => {
  it('keeps the resolved 30 ml cola mass instead of the conflicting 15 kg estimate', () => {
    const result = arbitrateDbVsCoT(
      colaCandidate(),
      { kcal: 12.6, protein: 0, carb: 3.18, fat: 0, fiber: 0 },
      30,
      3.2,
      0.85,
      true,
      false,
      { kcal: 42, protein: 0, carb: 10.6, fat: 0, fiber: 0 },
      0.9,
    );

    expect(result).toMatchObject({
      source: 'local_db',
      grams: 30,
      calories: 12.6,
      protein_g: 0,
      carbs_g: 3.18,
      fat_g: 0,
      confidence: 0.85,
    });
  });

  it('keeps the estimate when an explicit unknown unit has no valid conversion', () => {
    const result = arbitrateDbVsCoT(
      colaCandidate({
        raw_text: 'one bottleful of cola',
        quantity: 1,
        unit: 'bottleful',
        estimated_grams: 500,
        estimated_calories: 210,
        estimated_carbs_g: 53,
      }),
      { kcal: 42, protein: 0, carb: 10.6, fat: 0, fiber: 0 },
      100,
      3.2,
      0.55,
      true,
      false,
      { kcal: 42, protein: 0, carb: 10.6, fat: 0, fiber: 0 },
      0.7,
    );

    expect(result).toMatchObject({
      source: 'llm_cot',
      grams: 500,
      calories: 210,
      carbs_g: 53,
    });
  });

  it('preserves a valid two-serving Big Mac conversion', () => {
    const candidate: V4Candidate = {
      raw_text: '2 Big Macs',
      food_name: "McDonald's Big Mac",
      name_localized: "McDonald's Big Mac",
      quantity: 2,
      unit: 'piece',
      portion_explicit: true,
      confidence: 0.95,
      recognized: true,
      estimated_grams: 500,
      estimated_calories: 1_280,
      estimation_confidence: 0.8,
    };

    const result = arbitrateDbVsCoT(
      candidate,
      { kcal: 1_105.1, protein: 50.74, carb: 86.43, fat: 64.5, fiber: 6.88 },
      430,
      4,
      0.95,
      true,
      true,
      { kcal: 257, protein: 11.8, carb: 20.1, fat: 15, fiber: 1.6 },
      0.95,
    );

    expect(result).toMatchObject({
      source: 'local_db',
      grams: 430,
      calories: 1_105.1,
      protein_g: 50.74,
      carbs_g: 86.43,
      fat_g: 64.5,
    });
  });
});
