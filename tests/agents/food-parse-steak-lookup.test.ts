import { describe, expect, it } from 'vitest';
import { correctFoodName, lookupFood } from '@/agents/food-parse/lookup';

describe('generic cooked steak lookup', () => {
  it('pins generic steak to the representative lab-verified cooked sirloin row', () => {
    for (const genericName of ['steak', 'beef steak grilled', 'carne de res', 'carne']) {
      expect(correctFoodName(genericName)).toBe(
        'Beef, sirloin steak, grilled medium-rare, lean and fat',
      );
    }
  });

  it.each([
    ['g', 100, 100, 24.8],
    ['piece', 1, 200, 49.6],
  ] as const)(
    'resolves the real database lookup and unit conversion for %s',
    async (unit, quantity, expectedGrams, expectedProtein) => {
      const result = await lookupFood({
        foodName: 'beef steak grilled',
        unit,
        region: 'US',
      });

      expect(result).not.toBeNull();
      expect(result?.food.nameEn).toBe('Beef, sirloin steak, grilled medium-rare, lean and fat');
      expect(result?.food.source).toBe('cofid');
      expect(result?.food.dataQuality).toBe('lab_verified');
      expect(result?.gramsTotal(quantity)).toBe(expectedGrams);
      expect(result?.macros(quantity).protein).toBeCloseTo(expectedProtein, 1);
    },
  );
});
