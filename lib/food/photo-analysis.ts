import {
  isParsedFoodItem,
  type ParsedFoodItem,
} from '@/agents/schemas/food-parse';

export type PhotoAnalysisFood = {
  name: string;
  estimated_grams: number;
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
  confidence: number;
  source: 'ai_estimate';
  accuracy_note: string;
};

const DEFAULT_ACCURACY_NOTE =
  'Photo-only nutrition is an estimate; confirm weight or serving size for accurate tracking.';

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

export function normalizePhotoAnalysisFoods(input: unknown): PhotoAnalysisFood[] {
  if (!Array.isArray(input)) return [];

  return input.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return [];
    const food = candidate as Record<string, unknown>;
    const name = typeof food.name === 'string' ? food.name.trim() : '';
    if (name.length === 0 || name.length > 200) return [];
    if (!boundedNumber(food.estimated_grams, 0.1, 10_000)) return [];
    if (!boundedNumber(food.estimated_calories, 0, 10_000)) return [];
    if (!boundedNumber(food.estimated_protein_g, 0, 1_000)) return [];
    if (!boundedNumber(food.estimated_carbs_g, 0, 1_000)) return [];
    if (!boundedNumber(food.estimated_fat_g, 0, 1_000)) return [];
    if (!boundedNumber(food.confidence, 0, 1)) return [];

    const macroMass = food.estimated_protein_g
      + food.estimated_carbs_g
      + food.estimated_fat_g;
    if (macroMass > food.estimated_grams * 1.15) return [];

    const accuracyNote = typeof food.accuracy_note === 'string'
      ? food.accuracy_note.trim().slice(0, 500)
      : '';

    return [{
      name,
      estimated_grams: food.estimated_grams,
      estimated_calories: food.estimated_calories,
      estimated_protein_g: food.estimated_protein_g,
      estimated_carbs_g: food.estimated_carbs_g,
      estimated_fat_g: food.estimated_fat_g,
      confidence: Math.min(food.confidence, 0.75),
      source: 'ai_estimate' as const,
      accuracy_note: accuracyNote || DEFAULT_ACCURACY_NOTE,
    }];
  });
}

export function photoAnalysisToParsedItems(input: unknown): ParsedFoodItem[] {
  return normalizePhotoAnalysisFoods(input)
    .map((food) => ({
      raw_text: food.name,
      food_name: food.name,
      name_localized: food.name,
      quantity: 1,
      unit: 'serving',
      grams: Math.round(food.estimated_grams),
      calories: Math.round(food.estimated_calories),
      protein_g: Math.round(food.estimated_protein_g * 10) / 10,
      carbs_g: Math.round(food.estimated_carbs_g * 10) / 10,
      fat_g: Math.round(food.estimated_fat_g * 10) / 10,
      fiber_g: 0,
      sugar_g: 0,
      confidence: food.confidence,
      source: 'ai_estimate' as const,
      food_state: 'prepared' as const,
      portion_explicit: false,
      accuracy_note: food.accuracy_note,
    }))
    .filter(isParsedFoodItem);
}
