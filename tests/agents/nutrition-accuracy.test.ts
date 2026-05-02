import { describe, expect, it } from 'vitest';
import { enrichWithLocalDB } from '../../agents/food-parse/enrich';
import { normalizeRecipeWithLookup } from '../../agents/recipe-analyze/normalize';
import type { RecipeAnalyzeOutput } from '../../agents/schemas/recipe-analyze';
import type { LookupResult } from '../../agents/food-parse/lookup';

describe('nutrition accuracy guardrails', () => {
  it('does not promote fallback food-parse enrichment to authoritative local_db confidence', () => {
    const [item] = enrichWithLocalDB([
      {
        raw_text: 'unknown amount chicken breast',
        food_name: 'chicken breast',
        name_localized: 'chicken breast',
        quantity: 1,
        unit: 'serving',
        grams: 100,
        calories: 0,
        protein_g: 0,
        carbs_g: 0,
        fat_g: 0,
        fiber_g: 0,
        sugar_g: 0,
        confidence: 0.42,
        source: 'ai_estimate',
      },
    ]);

    expect(item.source).toBe('ai_estimate');
    expect(item.confidence).toBe(0.42);
    expect(item.calories).toBeGreaterThan(0);
  });

  it('recomputes recipe macros from lookup results when ingredients are recognized', async () => {
    const parsed: RecipeAnalyzeOutput = {
      recipe_name: 'Chicken bowl',
      servings: 2,
      ingredients: [
        {
          raw_text: '200g chicken breast',
          food_name: 'chicken breast',
          name_localized: 'chicken breast',
          grams: 200,
          calories: 999,
          protein_g: 1,
          carbs_g: 1,
          fat_g: 1,
          fiber_g: 0,
          sugar_g: 0,
          confidence: 0.7,
          source: 'ai_estimate',
        },
      ],
      total: { calories: 999, protein_g: 1, carbs_g: 1, fat_g: 1, fiber_g: 0, sugar_g: 0 },
      per_serving: { calories: 500, protein_g: 0.5, carbs_g: 0.5, fat_g: 0.5, fiber_g: 0, sugar_g: 0 },
    };

    const fakeResult: LookupResult = {
      food: {
        id: 'food-id',
        source: 'usda',
        sourceId: 'x',
        sourceUrl: null,
        dataQuality: 'lab_verified',
        nameEn: 'Chicken Breast Grilled',
        nameEl: null,
        nameEs: null,
        brand: null,
        barcode: null,
        region: ['US'],
        kcalPer100g: 165,
        proteinPer100g: 31,
        carbPer100g: 0,
        fatPer100g: 3.6,
        fiberPer100g: 0,
        sugarPer100g: 0,
        sodiumMg: null,
        micronutrients: null,
        defaultServingGrams: 100,
        defaultServingUnit: '100g',
        usdaFdcId: null,
        macroConfidence: 0.95,
        unitConversionVerified: false,
        canonicalFoodKey: null,
        provenanceNotes: null,
        dataReviewedAt: null,
        popularity: 0,
        verified: null,
        createdAt: new Date(),
        lastSyncedAt: null,
      },
      conversionId: null,
      gramsPerUnit: 1,
      gramsTotal: (qty) => qty,
      macros: (qty) => ({
        kcal: Math.round(165 * qty / 100),
        protein: Math.round(31 * qty / 100 * 10) / 10,
        carb: 0,
        fat: Math.round(3.6 * qty / 100 * 10) / 10,
        fiber: 0,
      }),
    };

    const normalized = await normalizeRecipeWithLookup(parsed, 2, async () => [fakeResult]);

    expect(normalized.ingredients[0]).toMatchObject({
      food_name: 'Chicken Breast Grilled',
      calories: 330,
      protein_g: 62,
      carbs_g: 0,
      fat_g: 7.2,
      source: 'local_db',
    });
    expect(normalized.total.calories).toBe(330);
    expect(normalized.per_serving.calories).toBe(165);
  });
});
