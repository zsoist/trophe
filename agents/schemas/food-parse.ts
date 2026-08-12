import type { UserStatedNutrients } from '@/agents/food-parse/nutrient-claims';

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
  /** Matched DB row's brand — branded products render it as a chip in the UI. */
  brand?: string | null;
  /** Matched DB row's provenance ('usda' | 'off' | 'ciqual' …). 'off' renders a "community data" hint. */
  db_source?: string | null;
  /** Matched DB row's data_quality tier ('lab_verified' | 'label' | 'crowdsourced' | 'estimated'). */
  data_quality?: string | null;
  /** Matched canonical foods.id — written to food_log.food_id so entries stay joinable. */
  db_food_id?: string | null;
  /** Photo-path only: model's own uncertainty note, shown as a caption under the item. */
  accuracy_note?: string | null;
  /** Nutrition totals the user stated explicitly, e.g. a label's 13 g protein. */
  user_stated_nutrients?: UserStatedNutrients;
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
