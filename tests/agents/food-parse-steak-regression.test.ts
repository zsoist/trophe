import { describe, expect, it, vi } from 'vitest';

const lookupMocks = vi.hoisted(() => ({
  lookupFoodBatch: vi.fn(async (items: Array<{ unit: string }>) =>
    items.map(({ unit }) => {
      const gramsPerUnit = unit === 'g' ? 1 : 200;
      return {
        food: {
          id: 'cofid-steak',
          nameEn: 'Beef, sirloin steak, grilled medium-rare, lean and fat',
          kcalPer100g: 213,
          proteinPer100g: 24.8,
          carbPer100g: 0,
          fatPer100g: 12.6,
          fiberPer100g: 0,
          sugarPer100g: 0,
          macroConfidence: 0.95,
          dataQuality: 'lab_verified',
          source: 'cofid',
          brand: null,
        },
        conversionId: null,
        gramsPerUnit,
        gramsTotal: (quantity: number) => quantity * gramsPerUnit,
        macros: (quantity: number) => {
          const factor = quantity * gramsPerUnit / 100;
          return {
            kcal: 213 * factor,
            protein: 24.8 * factor,
            carb: 0,
            fat: 12.6 * factor,
            fiber: 0,
          };
        },
      };
    }),
  ),
}));

vi.mock('@/agents/food-parse/lookup', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/agents/food-parse/lookup')>(),
  lookupFoodBatch: lookupMocks.lookupFoodBatch,
}));

import { run } from '@/agents/food-parse/index.v4';

describe('Nik generic steak regression', () => {
  it.each([
    ['big portion of beef steak only', 200, 49.6],
    ['100 g steak', 100, 24.8],
  ] as const)('uses cooked-steak DB nutrition without a paid provider: %s', async (
    text,
    expectedGrams,
    expectedProtein,
  ) => {
    const beforeTransportAttempt = vi.fn(() => {
      throw new Error('paid provider transport must not run');
    });

    const result = await run({ text, language: 'en' }, { beforeTransportAttempt });

    expect(beforeTransportAttempt).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output?.items).toEqual([
      expect.objectContaining({
        food_name: 'Beef, sirloin steak, grilled medium-rare, lean and fat',
        grams: expectedGrams,
        protein_g: expectedProtein,
        source: 'local_db',
        db_source: 'cofid',
        data_quality: 'lab_verified',
      }),
    ]);
    expect(result.telemetry).toMatchObject({
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      dbHits: 1,
      dbMisses: 0,
    });
  });
});
