import { describe, it, expect } from 'vitest';
import { rawToCooked, cookedToRaw, resolveHouseholdPortion } from '@/lib/food/food-yields';

describe('food-yields', () => {
  it('raw→cooked applies method yield', () => {
    expect(rawToCooked(100, 'meat_red', 'roast')).toBe(75);
    expect(rawToCooked(100, 'meat_red')).toBe(72);          // default
    expect(rawToCooked(100, 'fish_seafood', 'fry')).toBe(80);
    expect(rawToCooked(100, 'grain_rice')).toBe(300);        // dry→cooked multiplier
  });

  it('cooked→raw inverts the factor', () => {
    expect(cookedToRaw(180, 'meat_red')).toBe(250);          // 180 / 0.72
  });

  it('household portions resolve with a confidence flag', () => {
    const palm = resolveHouseholdPortion('palm', 'meat_red');
    expect(palm?.grams).toBe(100);
    expect(palm?.confidence).toBeLessThan(1);
    expect(resolveHouseholdPortion('a handful of nuts')?.grams).toBe(30);
    expect(resolveHouseholdPortion('one fruit')?.note).toMatch(/fruit/);
    expect(resolveHouseholdPortion('plasma rifle')).toBeNull();
  });
});
