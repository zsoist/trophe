import type { ParsedFoodItem } from '../schemas/food-parse';

type CachedIngredientQuality = {
  food_id?: string | null;
  matched_confidence?: number;
  estimation_source?: string;
};

type CachedRecipeQualityInput = {
  confidence: number;
  ingredients: CachedIngredientQuality[];
};

export function confidenceForMatchRatio(matchRatio: number): number {
  if (matchRatio === 1) return 0.85;
  if (matchRatio >= 0.5) {
    return Math.round(Math.min(0.65, Math.max(0.5, matchRatio * 0.75)) * 1_000) / 1_000;
  }
  return 0.45;
}

export function resolveCachedRecipeQuality(
  recipe: CachedRecipeQualityInput,
): Pick<ParsedFoodItem, 'confidence' | 'source'> {
  const fallbackCount = recipe.ingredients.filter(
    (ingredient) => ingredient.estimation_source === 'category_default',
  ).length;

  if (fallbackCount === 0 || recipe.ingredients.length === 0) {
    return {
      confidence: recipe.confidence,
      source: 'local_db',
    };
  }

  const matchRatio = (recipe.ingredients.length - fallbackCount) / recipe.ingredients.length;
  return {
    confidence: Math.min(recipe.confidence, confidenceForMatchRatio(matchRatio)),
    source: 'local_db+category_default',
  };
}
