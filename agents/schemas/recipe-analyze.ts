/**
 * Maximum recipe text (characters) the recipe-analyze pipeline processes in
 * full. This is the single source of truth shared by the agent (which must
 * REFUSE, never silently truncate, text past it), the API route (pre-dispatch
 * validation) and the client textarea limit — so the UI bound can never drift
 * from the server bound and produce nutrition for a silently-trimmed recipe.
 */
export const RECIPE_ANALYZE_MAX_INPUT_CHARS = 4000;

export interface RecipeIngredient {
  raw_text: string;
  food_name: string;
  name_localized: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: number;
  source: 'local_db' | 'ai_estimate';
}

export interface RecipeMacros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
}

export interface RecipeAnalyzeInput {
  text: string;
  servings: number;
  language?: string;
}

export interface RecipeAnalyzeOutput {
  recipe_name: string;
  servings: number;
  ingredients: RecipeIngredient[];
  total: RecipeMacros;
  per_serving: RecipeMacros;
}

export function isRecipeAnalyzeOutput(x: unknown): x is RecipeAnalyzeOutput {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.recipe_name === 'string' &&
    typeof o.servings === 'number' &&
    Array.isArray(o.ingredients) &&
    !!o.total &&
    !!o.per_serving
  );
}
