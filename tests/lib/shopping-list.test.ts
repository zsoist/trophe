import { describe, it, expect } from 'vitest';
import { aggregateIngredients, groupByCategory } from '@/lib/shopping-list';
import type { ShoppingItem } from '@/agents/schemas/shopping-extract';

const it_ = (name: string, quantity: number, unit: string, category: ShoppingItem['category'] = 'other'): ShoppingItem =>
  ({ name, quantity, unit, category });

describe('aggregateIngredients', () => {
  it('merges same name + unit, sums quantity, counts occurrences', () => {
    const out = aggregateIngredients([it_('Rice', 100, 'g', 'grains'), it_('rice', 50, 'g', 'grains')]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('rice');        // folded + lowercased
    expect(out[0].quantity).toBe(150);
    expect(out[0].occurrences).toBe(2);
  });

  it('keeps mismatched units in extras rather than summing', () => {
    const out = aggregateIngredients([it_('oil', 1, 'tbsp', 'pantry'), it_('oil', 10, 'ml', 'pantry')]);
    expect(out).toHaveLength(1);
    expect(out[0].occurrences).toBe(2);
    expect(out[0].extras).toContain('10 ml');
  });

  it('sorts by occurrences desc then name', () => {
    const out = aggregateIngredients([
      it_('chicken', 200, 'g', 'protein'),
      it_('rice', 100, 'g', 'grains'), it_('rice', 100, 'g', 'grains'),
    ]);
    expect(out[0].name).toBe('rice');   // 2 occurrences first
    expect(out[1].name).toBe('chicken');
  });

  it('groupByCategory buckets correctly', () => {
    const grouped = groupByCategory(aggregateIngredients([it_('apple', 1, 'piece', 'produce'), it_('beef', 100, 'g', 'protein')]));
    expect(Object.keys(grouped).sort()).toEqual(['produce', 'protein']);
  });
});
