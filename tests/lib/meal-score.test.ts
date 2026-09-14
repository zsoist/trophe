import { describe, expect, it } from 'vitest';
import { calculateMealScore } from '@/lib/food/meal-score';

type Entry = Parameters<typeof calculateMealScore>[number][number];

function entry(foodName: string, overrides: Partial<Entry> = {}): Entry {
  return {
    food_name: foodName,
    calories: 400,
    // Low protein keeps balance/adequacy off the ceiling so the 30%-weighted
    // variety term (and the A/B grade) is decided by the food identity fix.
    protein_g: 5,
    carbs_g: 40,
    fat_g: 12,
    ...overrides,
  } as Entry;
}

describe('meal score variety', () => {
  it('counts casing/whitespace variants of one food as a single food', () => {
    // User-visible counterexample: a person who logs the same food four times is
    // not showing "variety". The meal must not be scored as 4 unique foods.
    const score = calculateMealScore([
      entry('Chicken breast'),
      entry('chicken breast '),
      entry('CHICKEN BREAST'),
      entry('  Chicken  Breast '),
    ]);
    expect(score?.breakdown.variety).toBe(40);
  });

  it('scores the same food logged four ways no higher than one food, and below four distinct foods', () => {
    const sameFood = calculateMealScore([
      entry('Chicken breast'),
      entry('chicken breast '),
      entry('CHICKEN BREAST'),
      entry('  Chicken  Breast '),
    ]);
    const distinctFoods = calculateMealScore([
      entry('Chicken breast'),
      entry('White rice'),
      entry('Broccoli'),
      entry('Olive oil'),
    ]);
    expect(distinctFoods?.breakdown.variety).toBe(100);
    // A "meal" pretending to be four foods earns less than four real foods, and
    // the inflated score can no longer flip the grade.
    expect(sameFood!.score).toBeLessThan(distinctFoods!.score);
    expect(sameFood!.label).not.toBe(distinctFoods!.label);
  });

  it('ignores blank food names instead of counting them as a food', () => {
    const score = calculateMealScore([
      entry('Chicken breast'),
      entry(''),
      entry('   '),
    ]);
    expect(score?.breakdown.variety).toBe(40);
  });
});
