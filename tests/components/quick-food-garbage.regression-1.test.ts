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
});
