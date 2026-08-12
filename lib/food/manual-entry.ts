export type ManualNutritionInput = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
};

type ManualNutritionValue = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type ManualNutritionResult =
  | { ok: true; value: ManualNutritionValue }
  | {
      ok: false;
      code: 'calories_out_of_range' | 'macro_out_of_range' | 'name_too_long';
    };

const MAX_CALORIES = 10_000;
const MAX_MACRO_GRAMS = 1_000;
const MAX_NAME_LENGTH = 200;

function optionalNumber(raw: string): number {
  return raw.trim() === '' ? 0 : Number(raw);
}

export function validateManualNutrition(
  input: ManualNutritionInput,
): ManualNutritionResult {
  const calories = Number(input.calories);
  if (!Number.isFinite(calories) || calories < 1 || calories > MAX_CALORIES) {
    return { ok: false, code: 'calories_out_of_range' };
  }

  const macros = [
    optionalNumber(input.protein),
    optionalNumber(input.carbs),
    optionalNumber(input.fat),
  ];
  if (
    macros.some(
      (value) => !Number.isFinite(value) || value < 0 || value > MAX_MACRO_GRAMS,
    )
  ) {
    return { ok: false, code: 'macro_out_of_range' };
  }

  const name = input.name.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return { ok: false, code: 'name_too_long' };
  }

  return {
    ok: true,
    value: {
      name,
      calories: Math.round(calories),
      protein: Math.round(macros[0] * 10) / 10,
      carbs: Math.round(macros[1] * 10) / 10,
      fat: Math.round(macros[2] * 10) / 10,
    },
  };
}
