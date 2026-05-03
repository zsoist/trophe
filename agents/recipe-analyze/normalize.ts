import type { RecipeAnalyzeOutput, RecipeIngredient, RecipeMacros } from '../schemas/recipe-analyze';
import { lookupFoodBatch } from '../food-parse/lookup';
import type { LookupInput, LookupResult } from '../food-parse/lookup';

export type RecipeLookupFn = (items: LookupInput[]) => Promise<Array<LookupResult | null>>;

function roundMacro(value: number): number {
  return Math.round(value * 10) / 10;
}

function sumMacros(ingredients: RecipeIngredient[]): RecipeMacros {
  return ingredients.reduce<RecipeMacros>(
    (acc, ingredient) => ({
      calories: acc.calories + ingredient.calories,
      protein_g: roundMacro(acc.protein_g + ingredient.protein_g),
      carbs_g: roundMacro(acc.carbs_g + ingredient.carbs_g),
      fat_g: roundMacro(acc.fat_g + ingredient.fat_g),
      fiber_g: roundMacro(acc.fiber_g + ingredient.fiber_g),
      sugar_g: roundMacro(acc.sugar_g + ingredient.sugar_g),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  );
}

function perServing(total: RecipeMacros, servings: number): RecipeMacros {
  return {
    calories: Math.round(total.calories / servings),
    protein_g: roundMacro(total.protein_g / servings),
    carbs_g: roundMacro(total.carbs_g / servings),
    fat_g: roundMacro(total.fat_g / servings),
    fiber_g: roundMacro(total.fiber_g / servings),
    sugar_g: roundMacro(total.sugar_g / servings),
  };
}

export async function normalizeRecipeWithLookup(
  parsed: RecipeAnalyzeOutput,
  servings: number,
  lookup: RecipeLookupFn = lookupFoodBatch,
): Promise<RecipeAnalyzeOutput> {
  const lookupInputs = parsed.ingredients.map((ingredient) => ({
    foodName: ingredient.food_name,
    unit: 'g',
    qty: Math.max(0, ingredient.grams),
    region: 'GR',
  }));

  const lookupResults = await lookup(lookupInputs);

  const ingredients = parsed.ingredients.map((ingredient, index) => {
    const result = lookupResults[index];
    if (!result) {
      return {
        ...ingredient,
        source: 'ai_estimate' as const,
        confidence: Math.min(ingredient.confidence, 0.65),
      };
    }

    const macros = result.macros(ingredient.grams);
    const gramsTotal = result.gramsTotal(ingredient.grams);
    return {
      ...ingredient,
      food_name: result.food.nameEn,
      grams: gramsTotal,
      calories: Math.round(macros.kcal),
      protein_g: macros.protein,
      carbs_g: macros.carb,
      fat_g: macros.fat,
      fiber_g: macros.fiber ?? 0,
      sugar_g: roundMacro((result.food.sugarPer100g ?? 0) * gramsTotal / 100),
      source: 'local_db' as const,
      confidence: Math.min(Math.max(ingredient.confidence, 0.8), 0.98),
    };
  });

  const total = sumMacros(ingredients);
  total.calories = Math.round(total.calories);

  return {
    ...parsed,
    servings,
    ingredients,
    total,
    per_serving: perServing(total, servings),
  };
}
