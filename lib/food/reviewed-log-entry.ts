import type { ParsedFoodItem } from '@/agents/schemas/food-parse';
import type { MealType } from '@/lib/types';
import { selectFoodDisplayName } from '@/lib/food/display-name';

export interface ReviewedFoodLogInput {
  userId: string;
  date: string;
  mealType: MealType;
  inputSource: 'text' | 'photo';
  items: ParsedFoodItem[];
}

export function buildReviewedFoodLogEntries({
  userId,
  date,
  mealType,
  inputSource,
  items,
}: ReviewedFoodLogInput) {
  const source = inputSource === 'photo' ? 'photo_ai' : 'natural_language';

  return items.map((item) => ({
    user_id: userId,
    logged_date: date,
    meal_type: mealType,
    food_name: selectFoodDisplayName(item),
    quantity: item.quantity,
    unit: item.unit,
    calories: item.calories,
    protein_g: item.protein_g,
    carbs_g: item.carbs_g,
    fat_g: item.fat_g,
    fiber_g: item.fiber_g,
    sugar_g: item.sugar_g ?? null,
    parse_confidence: item.confidence ?? null,
    qty_input: item.quantity,
    qty_input_unit: item.unit,
    qty_g: Number.isFinite(item.grams) ? item.grams : null,
    food_id: item.db_food_id ?? null,
    llm_recognized: item.source !== 'ai_estimate',
    source,
  }));
}
