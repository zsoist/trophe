import { describe, expect, it } from 'vitest';
import { requiresPortionClarification, shouldRejectAsNonFood } from '@/agents/food-parse/index.v4';

describe('food parse clarification policy', () => {
  it('requires clarification for an inferred ambiguous serving', () => {
    expect(requiresPortionClarification([{
      raw_text: 'some yogurt', food_name: 'greek yogurt', name_localized: 'yogurt',
      quantity: 1, unit: 'serving', food_state: 'prepared', portion_explicit: false,
      confidence: 0.8, recognized: true,
    }])).toBe(true);
  });

  it('does not require clarification for explicit measurable portions', () => {
    expect(requiresPortionClarification([{
      raw_text: '200g yogurt', food_name: 'greek yogurt', name_localized: 'yogurt',
      quantity: 200, unit: 'g', food_state: 'prepared', portion_explicit: true,
      confidence: 0.95, recognized: true,
    }])).toBe(false);
  });
});

describe('food parse non-food preflight', () => {
  it.each([
    'asdfghjkl',
    'unicorn steak with dragon sauce',
    "'; DROP TABLE foods; --",
    "<script>alert('xss')</script>",
    '-3 bananas',
    '100ml of gasoline',
    '1000000 calories worth of butter',
    'a',
  ])('rejects clearly unsafe or non-food input: %s', (input) => {
    expect(shouldRejectAsNonFood(input)).toBe(true);
  });

  it.each([
    '3 bananas',
    'dragon fruit',
    'petrolina bread',
    '100 calories worth of butter',
  ])('does not reject plausible food input: %s', (input) => {
    expect(shouldRejectAsNonFood(input)).toBe(false);
  });
});
