/**
 * tests/lib/usda-fdc.test.ts — USDA FDC client unit tests.
 *
 * Tests the macro extraction and serving extraction logic.
 * Network calls are tested only when USDA_FDC_API_KEY is set
 * (skipped in CI without the key).
 */

import { describe, it, expect } from 'vitest';
import {
  getMacrosFromFood,
  getMacrosFromSearchResult,
  getServingsFromFood,
  getDataTypeRank,
  type USDAFoodDetail,
  type USDAFoodSearchResult,
} from '../../lib/nutrition/usda-fdc';

describe('USDA FDC client', () => {
  describe('getMacrosFromFood', () => {
    it('extracts macros from food detail nutrients', () => {
      const food: USDAFoodDetail = {
        fdcId: 171287,
        description: 'Egg, whole, raw, fresh',
        dataType: 'SR Legacy',
        foodClass: 'FinalFood',
        foodNutrients: [
          { nutrient: { id: 1008, number: '208', name: 'Energy', unitName: 'kcal' }, amount: 143 },
          { nutrient: { id: 1003, number: '203', name: 'Protein', unitName: 'g' }, amount: 12.6 },
          { nutrient: { id: 1005, number: '205', name: 'Carbohydrate', unitName: 'g' }, amount: 0.72 },
          { nutrient: { id: 1004, number: '204', name: 'Total lipid (fat)', unitName: 'g' }, amount: 9.51 },
          { nutrient: { id: 1079, number: '291', name: 'Fiber', unitName: 'g' }, amount: 0 },
          { nutrient: { id: 1063, number: '269', name: 'Sugars', unitName: 'g' }, amount: 0.37 },
        ],
      };

      const macros = getMacrosFromFood(food);
      expect(macros.calories).toBe(143);
      expect(macros.protein_g).toBe(12.6);
      expect(macros.carbs_g).toBe(0.72);
      expect(macros.fat_g).toBe(9.51);
      expect(macros.fiber_g).toBe(0);
      expect(macros.sugar_g).toBe(0.37);
    });

    it('handles missing nutrients gracefully', () => {
      const food: USDAFoodDetail = {
        fdcId: 999999,
        description: 'Sparse food',
        dataType: 'Branded',
        foodClass: 'Branded',
        foodNutrients: [
          { nutrient: { id: 1008, number: '208', name: 'Energy', unitName: 'kcal' }, amount: 100 },
        ],
      };

      const macros = getMacrosFromFood(food);
      expect(macros.calories).toBe(100);
      expect(macros.protein_g).toBe(0);
      expect(macros.fiber_g).toBeNull();
      expect(macros.sugar_g).toBeNull();
    });
  });

  describe('getMacrosFromSearchResult', () => {
    it('extracts macros from search result flat nutrient format', () => {
      const food: USDAFoodSearchResult = {
        fdcId: 171287,
        description: 'Egg, whole, raw, fresh',
        dataType: 'SR Legacy',
        foodNutrients: [
          { nutrientId: 1008, nutrientName: 'Energy', nutrientNumber: '208', unitName: 'kcal', value: 143 },
          { nutrientId: 1003, nutrientName: 'Protein', nutrientNumber: '203', unitName: 'g', value: 12.6 },
        ],
      };

      const macros = getMacrosFromSearchResult(food);
      expect(macros.calories).toBe(143);
      expect(macros.protein_g).toBe(12.6);
    });
  });

  describe('getServingsFromFood', () => {
    it('extracts servings from food portions', () => {
      const food: USDAFoodDetail = {
        fdcId: 171287,
        description: 'Egg, whole, raw, fresh',
        dataType: 'SR Legacy',
        foodClass: 'FinalFood',
        foodNutrients: [],
        foodPortions: [
          { id: 1, gramWeight: 50, amount: 1, portionDescription: '1 large', sequenceNumber: 1 },
          { id: 2, gramWeight: 38, amount: 1, portionDescription: '1 medium', sequenceNumber: 2 },
        ],
      };

      const servings = getServingsFromFood(food);
      expect(servings).toHaveLength(2);
      expect(servings[0].unit).toBe('1 large');
      expect(servings[0].grams).toBe(50);
      expect(servings[0].source).toContain('171287');
      expect(servings[1].grams).toBe(38);
    });

    it('handles food with no portions', () => {
      const food: USDAFoodDetail = {
        fdcId: 999,
        description: 'No portions',
        dataType: 'Branded',
        foodClass: 'Branded',
        foodNutrients: [],
      };

      expect(getServingsFromFood(food)).toEqual([]);
    });

    it('filters out zero-gram portions', () => {
      const food: USDAFoodDetail = {
        fdcId: 171287,
        description: 'Test',
        dataType: 'SR Legacy',
        foodClass: 'FinalFood',
        foodNutrients: [],
        foodPortions: [
          { id: 1, gramWeight: 0, amount: 1, portionDescription: 'invalid', sequenceNumber: 1 },
          { id: 2, gramWeight: 50, amount: 1, portionDescription: 'valid', sequenceNumber: 2 },
        ],
      };

      const servings = getServingsFromFood(food);
      expect(servings).toHaveLength(1);
      expect(servings[0].unit).toBe('valid');
    });
  });

  describe('getDataTypeRank', () => {
    it('ranks Foundation highest', () => {
      expect(getDataTypeRank('Foundation')).toBe(1);
      expect(getDataTypeRank('SR Legacy')).toBe(2);
      expect(getDataTypeRank('Survey (FNDDS)')).toBe(3);
      expect(getDataTypeRank('Branded')).toBe(4);
    });

    it('returns 99 for unknown types', () => {
      expect(getDataTypeRank('Unknown')).toBe(99);
    });
  });
});
