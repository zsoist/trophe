import { describe, expect, it } from 'vitest';
import {
  confidenceForMatchRatio,
  resolveCachedRecipeQuality,
} from '../../agents/food-parse/decomposition-quality';

describe('decomposition quality policy', () => {
  it.each([
    [1, 0.85],
    [0.8, 0.6],
    [0.5, 0.5],
    [0.49, 0.45],
    [0.4, 0.45],
  ])('maps a %s ingredient match ratio to %s confidence', (ratio, expected) => {
    expect(confidenceForMatchRatio(ratio)).toBe(expected);
  });

  it('preserves curated recipe confidence when no category fallback marker exists', () => {
    expect(resolveCachedRecipeQuality({
      confidence: 0.9,
      ingredients: [
        { food_id: null, matched_confidence: 0.9 },
        { food_id: null, matched_confidence: 0.85 },
      ],
    })).toEqual({
      confidence: 0.9,
      source: 'local_db',
    });
  });

  it('keeps a mostly guessed cached recipe partial and low-confidence', () => {
    expect(resolveCachedRecipeQuality({
      confidence: 0.75,
      ingredients: [
        { food_id: 'food-1', matched_confidence: 0.9 },
        { food_id: 'food-2', matched_confidence: 0.9 },
        { food_id: null, matched_confidence: 0.3, estimation_source: 'category_default' },
        { food_id: null, matched_confidence: 0.3, estimation_source: 'category_default' },
        { food_id: null, matched_confidence: 0.3, estimation_source: 'category_default' },
      ],
    })).toEqual({
      confidence: 0.45,
      source: 'local_db+category_default',
    });
  });
});
