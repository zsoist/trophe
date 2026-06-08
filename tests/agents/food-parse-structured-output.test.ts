import { describe, expect, it } from 'vitest';
import { foodParseStructuredSchema } from '@/agents/schemas/food-parse-structured';

describe('food parse structured output', () => {
  it('accepts valid multilingual food identification output', () => {
    expect(foodParseStructuredSchema.parse({
      needs_clarification: false,
      clarification_question: null,
      items: [{
        raw_text: '2 αυγά',
        food_name: 'eggs',
        name_localized: 'αυγά',
        quantity: 2,
        unit: 'piece',
        qualifier: null,
        food_state: 'cooked',
        portion_explicit: true,
        confidence: 0.95,
        recognized: true,
      }],
    }).items).toHaveLength(1);
  });

  it('rejects invalid confidence and empty canonical names', () => {
    expect(() => foodParseStructuredSchema.parse({
      needs_clarification: false,
      clarification_question: null,
      items: [{
        raw_text: 'food',
        food_name: '',
        name_localized: 'food',
        quantity: 1,
        unit: 'serving',
        food_state: 'unknown',
        portion_explicit: false,
        confidence: 2,
        recognized: true,
      }],
    })).toThrow();
  });
});
