import { describe, expect, it } from 'vitest';
import {
  applyUserStatedNutrients,
  extractNutrientClaims,
  hasUserStatedNutrients,
  repairNutrientClaimPortion,
} from '@/agents/food-parse/nutrient-claims';

describe('user-stated nutrient extraction', () => {
  it.each([
    ['protein bar with 13 g of protein', { protein_g: 13 }],
    ['protein bar, protein 13g', { protein_g: 13 }],
    ['barrita con 13 g de proteína', { protein_g: 13 }],
    ['μπάρα με 13 γρ πρωτεΐνη', { protein_g: 13 }],
    ['barre avec 13 g de protéines', { protein_g: 13 }],
  ])('reads nutrient grams instead of food weight: %s', (text, expected) => {
    expect(extractNutrientClaims(text)).toEqual(expected);
  });

  it('reads multiple label facts without confusing their units', () => {
    expect(extractNutrientClaims('1 bar: 13g protein, 22 g carbs, 7g fat, 180 calories')).toEqual({
      protein_g: 13,
      carbs_g: 22,
      fat_g: 7,
      calories: 180,
    });
  });

  it('does not treat a standalone food weight as a nutrient fact', () => {
    expect(extractNutrientClaims('a 60 g protein bar')).toEqual({});
  });
});

describe('nutrient-claim portion repair', () => {
  it('repairs a model that made 13 g protein the bar weight', () => {
    const repaired = repairNutrientClaimPortion({
      raw_text: 'protein bar with 13 g of protein',
      food_name: 'protein bar',
      quantity: 13,
      unit: 'g',
      portion_explicit: true,
      estimated_grams: 13,
    }, { protein_g: 13 });

    expect(repaired).toMatchObject({
      quantity: 1,
      unit: 'piece',
      portion_explicit: false,
    });
    expect(repaired.estimated_grams).toBeUndefined();
  });

  it('preserves an independent 60 g bar weight', () => {
    const candidate = {
      raw_text: '60 g protein bar with 13 g protein',
      food_name: 'protein bar',
      quantity: 60,
      unit: 'g',
      portion_explicit: true,
      estimated_grams: 60,
    };
    expect(repairNutrientClaimPortion(candidate, { protein_g: 13 })).toEqual(candidate);
  });

  it('preserves an independent food weight even when it equals the protein claim', () => {
    const candidate = {
      raw_text: '13 g protein powder with 13 g protein',
      food_name: 'protein powder',
      quantity: 13,
      unit: 'g',
      portion_explicit: true,
      estimated_grams: 13,
    };
    expect(repairNutrientClaimPortion(candidate, { protein_g: 13 })).toEqual(candidate);
  });

  it('preserves a Spanish food-weight span that equals the protein claim', () => {
    const rawText = '13 g de proteína en polvo con 13 g de proteína';
    const candidate = {
      raw_text: rawText,
      food_name: 'protein powder',
      quantity: 13,
      unit: 'g',
      portion_explicit: true,
      estimated_grams: 13,
    };

    expect(extractNutrientClaims(rawText)).toEqual({ protein_g: 13 });
    expect(repairNutrientClaimPortion(candidate, { protein_g: 13 })).toEqual(candidate);
  });
});

describe('user-stated nutrient overrides', () => {
  it('overrides only protein and preserves the resolved bar weight', () => {
    const result = applyUserStatedNutrients({
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
    }, { protein_g: 13 });

    expect(result).toMatchObject({
      grams: 60,
      calories: 190,
      protein_g: 13,
      carbs_g: 18,
      fat_g: 6,
      user_stated_nutrients: { protein_g: 13 },
    });
  });

  it('reports whether any usable claims exist', () => {
    expect(hasUserStatedNutrients({})).toBe(false);
    expect(hasUserStatedNutrients({ carbs_g: 22 })).toBe(true);
  });

  it('ignores impossible label values while retaining plausible stated facts', () => {
    const result = applyUserStatedNutrients({
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
    }, { protein_g: 13, calories: 10_000, fiber_g: 1_000 });

    expect(result).toMatchObject({
      grams: 60,
      calories: 190,
      protein_g: 13,
      fiber_g: 4,
      user_stated_nutrients: { protein_g: 13 },
    });
  });

  it('rejects a physically impossible combination of claimed macros', () => {
    const item = {
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
    };
    expect(applyUserStatedNutrients(item, { protein_g: 50, carbs_g: 50, fat_g: 50 })).toEqual(item);
  });

  it('ignores calories that conflict with the projected label macros', () => {
    const item = {
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
      food_name: 'protein bar',
    };

    expect(applyUserStatedNutrients(item, { calories: 500, protein_g: 13 })).toMatchObject({
      calories: 190,
      protein_g: 13,
      user_stated_nutrients: { protein_g: 13 },
    });
  });

  it('preserves the metabolic-consistency exception for alcoholic drinks', () => {
    const item = {
      grams: 150,
      calories: 125,
      protein_g: 0,
      carbs_g: 4,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 1,
      food_name: 'red wine',
    };

    expect(applyUserStatedNutrients(item, { calories: 150 })).toMatchObject({
      calories: 150,
      user_stated_nutrients: { calories: 150 },
    });
  });

  it.each(['kale salad', 'virgin smoothie'])('does not classify %s as alcohol by substring', (foodName) => {
    const item = {
      grams: 60,
      calories: 190,
      protein_g: 20,
      carbs_g: 18,
      fat_g: 6,
      fiber_g: 4,
      sugar_g: 3,
      food_name: foodName,
    };

    expect(applyUserStatedNutrients(item, { calories: 500 })).toEqual(item);
  });
});
