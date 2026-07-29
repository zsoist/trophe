import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isParsedFoodItem } from '@/agents/schemas/food-parse';

// Regression: STAB-007 — a provider response such as { items: [null] } reached
// ParsedFoodList and crashed the food-entry UI.
describe('QuickFoodInput provider-output boundary', () => {
  it.each([null, undefined, {}, { food_name: null }, { food_name: 'egg' }])(
    'rejects malformed item %j',
    (item) => expect(isParsedFoodItem(item)).toBe(false),
  );

  it('filters every response item through the runtime schema guard', () => {
    const source = readFileSync(join(process.cwd(), 'components/food/QuickFoodInput.tsx'), 'utf8');
    expect(source).toContain('data.items.filter(isParsedFoodItem)');
  });

  const validItem = {
    raw_text: '100g feta',
    food_name: 'Feta cheese',
    name_localized: 'Φέτα',
    quantity: 1,
    unit: 'serving',
    grams: 100,
    calories: 264,
    protein_g: 14.2,
    carbs_g: 4.1,
    fat_g: 21.3,
    fiber_g: 0,
    sugar_g: 0,
    confidence: 0.95,
    source: 'local_db',
  };

  it('accepts a complete, finite, plausible parsed item', () => {
    expect(isParsedFoodItem(validItem)).toBe(true);
  });

  it.each([
    { field: 'grams', value: Number.NaN },
    { field: 'calories', value: Number.POSITIVE_INFINITY },
    { field: 'protein_g', value: -1 },
    { field: 'confidence', value: 1.1 },
    { field: 'food_name', value: ' ' },
    { field: 'source', value: 'invented_provider' },
  ])('rejects unsafe $field values at the client boundary', ({ field, value }) => {
    expect(isParsedFoodItem({ ...validItem, [field]: value })).toBe(false);
  });

  it('rejects macros whose mass is impossible for the resolved food weight', () => {
    expect(
      isParsedFoodItem({
        ...validItem,
        grams: 10,
        protein_g: 20,
        carbs_g: 20,
        fat_g: 20,
      }),
    ).toBe(false);
  });
});
