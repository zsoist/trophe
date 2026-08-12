import { describe, expect, it } from 'vitest';
import { enforceLiteralBrandName } from '@/agents/food-parse/brand-fidelity';

describe('food output brand fidelity', () => {
  it.each([
    ['Starbucks grande latte', 'latte', 'grande latte'],
    ["McDonald's cheeseburger", 'burger', 'cheeseburger'],
    ['Big Mac', 'burger', 'burger'],
    ['Coca-Cola', 'cola', 'cola'],
    ['Red Bull energy drink', 'energy drink', 'energy drink'],
    ['Red Bull', 'energy drink', 'energy drink'],
    ['Quest protein bar', 'protein bar', 'protein bar'],
  ])('removes invented branded identity from %s', (candidate, input, expected) => {
    expect(enforceLiteralBrandName(candidate, input)).toEqual({
      name: expected,
      changed: true,
    });
  });

  it.each([
    ['Starbucks latte', 'one Starbucks latte'],
    ['Big Mac', 'a Big Mac'],
    ['Coca-Cola', 'one coke'],
    ['Red Bull', 'red bull'],
  ])('preserves an explicitly stated brand in %s', (candidate, input) => {
    expect(enforceLiteralBrandName(candidate, input)).toEqual({
      name: candidate,
      changed: false,
    });
  });
});
