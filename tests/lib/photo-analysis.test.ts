import { describe, expect, it } from 'vitest';
import {
  normalizePhotoAnalysisFoods,
  photoAnalysisToParsedItems,
} from '@/lib/food/photo-analysis';

const validFood = {
  name: 'Chicken and rice',
  estimated_grams: 320,
  estimated_calories: 510,
  estimated_protein_g: 42,
  estimated_carbs_g: 55,
  estimated_fat_g: 12,
  estimated_fiber_g: 6,
  estimated_sugar_g: 3,
  confidence: 0.92,
  source: 'ai_estimate',
  accuracy_note: 'Portion estimated from the plate.',
};

describe('photo analysis normalization', () => {
  it('drops malformed items independently and clamps unanchored confidence', () => {
    expect(normalizePhotoAnalysisFoods([
      null,
      {},
      { ...validFood, name: '   ' },
      { ...validFood, estimated_grams: Number.NaN },
      validFood,
    ])).toEqual([
      {
        ...validFood,
        confidence: 0.75,
      },
    ]);
  });

  it('rejects impossible macro mass and invalid confidence', () => {
    expect(normalizePhotoAnalysisFoods([
      { ...validFood, estimated_grams: 100, estimated_protein_g: 120 },
      { ...validFood, confidence: -0.1 },
      { ...validFood, confidence: Number.POSITIVE_INFINITY },
    ])).toEqual([]);
  });

  it('converts only normalized foods into schema-valid review items', () => {
    const items = photoAnalysisToParsedItems([validFood, null, { name: 'broken' }]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      food_name: 'Chicken and rice',
      grams: 320,
      calories: 510,
      source: 'ai_estimate',
      portion_explicit: false,
      confidence: 0.75,
      fiber_g: 6,
      sugar_g: 3,
    });
  });
});
