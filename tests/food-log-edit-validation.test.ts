import { describe, expect, it } from 'vitest';
import { validateFoodLogEdit } from '@/lib/food/log-edit-validation';

describe('food log edit validation', () => {
  it('normalizes a valid sparse edit', () => {
    expect(validateFoodLogEdit({
      foodName: '  Chicken bowl  ',
      grams: 275,
      calories: '540',
      proteinG: '42.5',
    })).toEqual({
      ok: true,
      value: {
        foodName: 'Chicken bowl',
        grams: 275,
        calories: 540,
        proteinG: 42.5,
      },
    });
  });

  it.each([
    [{ quantity: 0 }, 'quantity'],
    [{ quantity: 10001 }, 'quantity'],
    [{ foodName: '   ' }, 'foodName'],
    [{ foodName: 'x'.repeat(501) }, 'foodName'],
    [{ grams: Number.NaN }, 'grams'],
    [{ grams: 10001 }, 'grams'],
    [{ calories: '' }, 'calories'],
    [{ calories: '-1' }, 'calories'],
    [{ calories: '100001' }, 'calories'],
    [{ proteinG: 'not-a-number' }, 'proteinG'],
    [{ carbsG: '10001' }, 'carbsG'],
    [{ fatG: '-0.1' }, 'fatG'],
    [{ sugarG: '' }, 'sugarG'],
  ])('rejects invalid edits instead of silently dropping them', (input, issue) => {
    expect(validateFoodLogEdit(input)).toEqual({ ok: false, issue });
  });
});
