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

const PARSED_ITEM_SOURCES = new Set<ParsedFoodItem['source']>([
  'local_db',
  'ai_estimate',
  'local_db+category_default',
  'llm_cot',
  'hybrid',
]);

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function boundedString(value: unknown, maximum: number, allowEmpty = false): value is string {
  if (typeof value !== 'string' || value.length > maximum) return false;
  return allowEmpty || value.trim().length > 0;
}

export function isParsedFoodItem(x: unknown): x is ParsedFoodItem {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (
    !boundedString(o.raw_text, 500, true)
    || !boundedString(o.food_name, 200)
    || !boundedString(o.name_localized, 200, true)
    || !boundedString(o.unit, 50)
    || !boundedNumber(o.quantity, 0.0001, 10_000)
    || !boundedNumber(o.grams, 0.1, 15_000)
    || !boundedNumber(o.calories, 0, 15_000)
    || !boundedNumber(o.protein_g, 0, 1_000)
    || !boundedNumber(o.carbs_g, 0, 1_000)
    || !boundedNumber(o.fat_g, 0, 1_000)
    || !boundedNumber(o.fiber_g, 0, 1_000)
    || !boundedNumber(o.sugar_g, 0, 1_000)
    || !boundedNumber(o.confidence, 0, 1)
    || typeof o.source !== 'string'
    || !PARSED_ITEM_SOURCES.has(o.source as ParsedFoodItem['source'])
  ) {
    return false;
  }

  const macroMass = o.protein_g + o.carbs_g + o.fat_g;
  if (macroMass > o.grams * 1.15) return false;

  if (o.portion_explicit !== undefined && typeof o.portion_explicit !== 'boolean') {
    return false;
  }

  if (o.calories_range !== undefined) {
    if (!o.calories_range || typeof o.calories_range !== 'object') return false;
    const range = o.calories_range as Record<string, unknown>;
    if (
      !boundedNumber(range.min, 0, 15_000)
      || !boundedNumber(range.center, 0, 15_000)
      || !boundedNumber(range.max, 0, 15_000)
      || range.min > range.center
      || range.center > range.max
    ) {
      return false;
    }
  }

  return true;
}
