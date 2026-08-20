import type { PhotoAnalysisFood } from '@/lib/food/photo-analysis';

export interface PhotoDishGroundingInput {
  dishName: string | null | undefined;
  foods: PhotoAnalysisFood[];
}

const BANDEJA_PATTERN = /\bbandeja\s+paisa\b/i;
const BEANS_PATTERN = /\b(?:beans?|frijoles?|kidney\s+beans?|red\s+beans?)\b/i;
const CANONICAL_COMPONENTS: Array<[RegExp, string]> = [
  [BEANS_PATTERN, 'Beans'],
  [/\b(?:white\s+)?rice|arroz\b/i, 'White rice'],
  [/\bground\s+beef|carne\s+molida\b/i, 'Ground beef'],
  [/\bchicharr[oó]n|pork\s+belly\b/i, 'Chicharrón'],
  [/\b(?:fried\s+)?egg|huevo\b/i, 'Fried egg'],
  [/\bplantain|pl[aá]tano\b/i, 'Fried plantain'],
  [/\barepa\b/i, 'Arepa'],
  [/\bavocado|aguacate\b/i, 'Avocado'],
];

const CONSERVATIVE_BEANS: PhotoAnalysisFood = {
  name: 'Beans',
  estimated_grams: 120,
  estimated_calories: 152,
  estimated_protein_g: 10.4,
  estimated_carbs_g: 27.4,
  estimated_fat_g: 0.6,
  estimated_fiber_g: 7.7,
  estimated_sugar_g: 0.4,
  confidence: 0.4,
  source: 'ai_estimate',
  accuracy_note: 'Bandeja Paisa usually includes beans; confirm that they are visible and adjust the portion.',
  needs_confirmation: true,
};

function canonicalComponentName(name: string): string {
  return CANONICAL_COMPONENTS.find(([pattern]) => pattern.test(name))?.[1] ?? name;
}

export function groundKnownDishComponents({
  dishName,
  foods,
}: PhotoDishGroundingInput): PhotoAnalysisFood[] {
  if (!BANDEJA_PATTERN.test(dishName?.normalize('NFC') ?? '')) return foods;

  const grounded = foods.map((food) => ({
    ...food,
    name: canonicalComponentName(food.name),
    needs_confirmation: food.needs_confirmation ?? false,
  }));

  if (grounded.some((food) => food.name === 'Beans')) return grounded;
  return [...grounded, { ...CONSERVATIVE_BEANS }];
}
