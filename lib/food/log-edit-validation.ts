export interface FoodLogEditDraft {
  foodName?: string;
  quantity?: number;
  grams?: number;
  calories?: string | number;
  proteinG?: string | number;
  carbsG?: string | number;
  fatG?: string | number;
  sugarG?: string | number;
}

export type FoodLogEditIssue = keyof FoodLogEditDraft;

type ValidatedFoodLogEdit = {
  foodName?: string;
  quantity?: number;
  grams?: number;
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  sugarG?: number;
};

export type FoodLogEditValidation =
  | { ok: true; value: ValidatedFoodLogEdit }
  | { ok: false; issue: FoodLogEditIssue };

function boundedNumber(
  raw: string | number,
  min: number,
  max: number,
  minExclusive = false,
): number | null {
  if (typeof raw === 'string' && raw.trim() === '') return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  if (minExclusive ? value <= min : value < min) return null;
  if (value > max) return null;
  return value;
}

/**
 * Validate sparse food-log edits against the tRPC API contract. PostgreSQL
 * retains broader outer guardrails for every integration. Undefined fields
 * mean "unchanged"; supplied invalid fields fail the entire edit.
 */
export function validateFoodLogEdit(
  draft: FoodLogEditDraft,
): FoodLogEditValidation {
  const value: ValidatedFoodLogEdit = {};

  if (draft.foodName !== undefined) {
    const foodName = draft.foodName.trim();
    if (foodName.length < 1 || foodName.length > 200) {
      return { ok: false, issue: 'foodName' };
    }
    value.foodName = foodName;
  }

  const amountBounds = { quantity: 1_000, grams: 10_000 } as const;
  for (const field of Object.keys(amountBounds) as Array<keyof typeof amountBounds>) {
    const raw = draft[field];
    if (raw === undefined) continue;
    const parsed = boundedNumber(raw, 0, amountBounds[field], true);
    if (parsed === null) return { ok: false, issue: field };
    value[field] = parsed;
  }

  const nutritionBounds = {
    calories: 10_000,
    proteinG: 1_000,
    carbsG: 1_000,
    fatG: 1_000,
    sugarG: 1_000,
  } as const;
  for (const field of Object.keys(nutritionBounds) as Array<keyof typeof nutritionBounds>) {
    const raw = draft[field];
    if (raw === undefined) continue;
    const parsed = boundedNumber(raw, 0, nutritionBounds[field]);
    if (parsed === null) return { ok: false, issue: field };
    value[field] = parsed;
  }

  return { ok: true, value };
}
