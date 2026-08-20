import { describe, expect, it } from 'vitest';
import { selectFoodDisplayName } from '@/lib/food/display-name';

describe('English food display names', () => {
  it('keeps custom beans in English when localized output says frijoles', () => {
    expect(selectFoodDisplayName({
      food_name: 'Beans',
      raw_text: 'custom beans',
      name_localized: 'frijoles',
    })).toBe('Beans');
  });

  it('falls back to the raw input before a localized name', () => {
    expect(selectFoodDisplayName({
      food_name: ' ',
      raw_text: 'custom beans',
      name_localized: 'frijoles',
    })).toBe('custom beans');
  });

  it('preserves a canonical branded product name', () => {
    expect(selectFoodDisplayName({
      food_name: 'Oikos Triple Zero Vanilla Greek Yogurt',
      raw_text: 'oikos vanilla',
      name_localized: 'yogur de vainilla',
    })).toBe('Oikos Triple Zero Vanilla Greek Yogurt');
  });
});
