import { describe, expect, it } from 'vitest';
import { groundKnownDishComponents } from '@/lib/food/photo-grounding';
import type { PhotoAnalysisFood } from '@/lib/food/photo-analysis';

const component = (overrides: Partial<PhotoAnalysisFood> = {}): PhotoAnalysisFood => ({
  name: 'White rice',
  estimated_grams: 180,
  estimated_calories: 234,
  estimated_protein_g: 4.3,
  estimated_carbs_g: 50.8,
  estimated_fat_g: 0.5,
  estimated_fiber_g: 0.7,
  estimated_sugar_g: 0.1,
  confidence: 0.68,
  source: 'ai_estimate',
  accuracy_note: 'Estimated from the visible plate area.',
  ...overrides,
});

describe('known mixed-dish photo grounding', () => {
  it('keeps visible beans as a first-class English component', () => {
    const foods = groundKnownDishComponents({
      dishName: 'Bandeja Paisa',
      foods: [component({ name: 'frijoles', estimated_grams: 170 })],
    });

    expect(foods).toHaveLength(1);
    expect(foods[0]).toMatchObject({
      name: 'Beans',
      estimated_grams: 170,
      needs_confirmation: false,
    });
  });

  it('adds omitted beans conservatively for an explicit Bandeja Paisa identity', () => {
    const foods = groundKnownDishComponents({
      dishName: 'Colombian bandeja paisa platter',
      foods: [component(), component({ name: 'Ground beef', estimated_grams: 100 })],
    });

    const beans = foods.find((food) => food.name === 'Beans');
    expect(beans).toMatchObject({
      estimated_grams: 120,
      needs_confirmation: true,
      source: 'ai_estimate',
    });
    expect(beans?.confidence).toBeLessThanOrEqual(0.45);
    expect(beans?.accuracy_note).toMatch(/confirm/i);
  });

  it('does not invent reference components when the dish identity is unknown', () => {
    const foods = groundKnownDishComponents({
      dishName: null,
      foods: [component({ name: 'White rice' })],
    });

    expect(foods.map((food) => food.name)).toEqual(['White rice']);
  });
});
