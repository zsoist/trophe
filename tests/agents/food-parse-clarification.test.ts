import { describe, expect, it } from 'vitest';
import { requiresPortionClarification } from '@/agents/food-parse/index.v4';

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
