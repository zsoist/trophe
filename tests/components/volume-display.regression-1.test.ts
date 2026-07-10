import { describe, expect, it } from 'vitest';
import { getDisplayQuantity, isVolumeUnit } from '@/components/food/ParsedFoodList';
import type { ParsedFoodItem } from '@/app/api/food/parse/route';

function item(unit: string, quantity: number, grams: number): ParsedFoodItem {
  return {
    raw_text: 'Test drink', food_name: 'Test drink', name_localized: 'Test drink', quantity, unit, grams,
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0,
    confidence: 0.9, recognized: true, source: 'local_db',
  } as ParsedFoodItem;
}

// Regression: liquid entries display the user's volume, not the gram conversion.
describe('parsed food volume display', () => {
  it.each(['ml', 'L', 'cl', 'fl_oz', 'fl oz'])('recognizes %s as volume', (unit) => {
    expect(isVolumeUnit(unit)).toBe(true);
  });

  it('preserves 450 ml after density-based gram conversion', () => {
    expect(getDisplayQuantity(item('ml', 450, 464))).toBe(450);
  });

  it('continues to display grams for non-volume units', () => {
    expect(getDisplayQuantity(item('cup', 0.5, 122))).toBe(122);
  });
});
