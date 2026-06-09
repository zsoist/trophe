export interface MacroRange {
  min: number;
  center: number;
  max: number;
}

export interface ParsedFoodItem {
  raw_text: string;
  food_name: string;
  name_localized: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: number;
  source: 'local_db' | 'ai_estimate' | 'local_db+category_default' | 'llm_cot' | 'hybrid';
  food_state?: 'raw' | 'cooked' | 'fried' | 'grilled' | 'baked' | 'boiled' | 'prepared' | 'unknown';
  portion_explicit?: boolean;
  /** Range-based calorie estimate when portion is implicit */
  calories_range?: MacroRange;
}

export interface FoodParseInput {
  text: string;
  language?: string;
}

export interface FoodParseOutput {
  items: ParsedFoodItem[];
  needs_clarification?: boolean;
  clarification_question?: string | null;
  warnings?: string[];
}

export function isParsedFoodItem(x: unknown): x is ParsedFoodItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.food_name === 'string' &&
    typeof o.grams === 'number' &&
    typeof o.calories === 'number' &&
    typeof o.protein_g === 'number' &&
    typeof o.carbs_g === 'number' &&
    typeof o.fat_g === 'number'
  );
}
