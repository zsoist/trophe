import { describe, expect, it } from 'vitest';
import { buildReviewedFoodLogEntries } from '@/lib/food/reviewed-log-entry';

describe('reviewed food-log persistence', () => {
  it('persists the canonical English name without discarding parse provenance', () => {
    const [entry] = buildReviewedFoodLogEntries({
      userId: 'user-1',
      date: '2026-08-20',
      mealType: 'lunch',
      inputSource: 'text',
      items: [{
        raw_text: 'custom beans',
        food_name: 'Beans',
        name_localized: 'frijoles',
        quantity: 1,
        unit: 'serving',
        grams: 180,
        calories: 230,
        protein_g: 14,
        carbs_g: 40,
        fat_g: 1,
        fiber_g: 13,
        sugar_g: 1,
        confidence: 0.91,
        source: 'local_db',
        portion_explicit: true,
        food_state: 'cooked',
        db_food_id: 'food-beans',
      }],
    });

    expect(entry).toMatchObject({
      food_name: 'Beans',
      source: 'natural_language',
      food_id: 'food-beans',
      parse_confidence: 0.91,
      qty_g: 180,
      sugar_g: 1,
    });
  });
});
