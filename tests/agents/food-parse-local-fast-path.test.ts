import { describe, expect, it, vi } from 'vitest';
import { extractLocalFoodCandidates } from '@/agents/food-parse/local-fast-path';
import { run } from '@/agents/food-parse/index.v4';

describe('local food parse fast path', () => {
  it('extracts a common multi-food meal without an AI provider', () => {
    expect(extractLocalFoodCandidates(
      '3 eggs, 2 slices whole wheat toast, banana and coffee with milk',
    )).toEqual([
      expect.objectContaining({
        foodName: 'egg',
        quantity: 3,
        unit: 'piece',
        portionExplicit: true,
      }),
      expect.objectContaining({
        foodName: 'whole wheat bread',
        quantity: 2,
        unit: 'slice',
        portionExplicit: true,
      }),
      expect.objectContaining({
        foodName: 'banana',
        quantity: 1,
        unit: 'serving',
        portionExplicit: false,
      }),
      expect.objectContaining({
        foodName: 'coffee brewed',
        quantity: 1,
        unit: 'serving',
        portionExplicit: false,
      }),
      expect.objectContaining({
        foodName: 'milk whole',
        quantity: 30,
        unit: 'ml',
        portionExplicit: false,
      }),
    ]);
  });

  it('preserves explicit metric portions for database conversion', () => {
    expect(extractLocalFoodCandidates('200 g chicken breast, 150ml milk')).toEqual([
      expect.objectContaining({
        foodName: 'chicken breast',
        quantity: 200,
        unit: 'g',
        portionExplicit: true,
      }),
      expect.objectContaining({
        foodName: 'milk whole',
        quantity: 150,
        unit: 'ml',
        portionExplicit: true,
      }),
    ]);
  });

  it('normalizes generic fries without introducing a restaurant brand', () => {
    expect(extractLocalFoodCandidates('french fries')).toEqual([
      expect.objectContaining({
        foodName: 'french fries',
        quantity: 1,
        unit: 'serving',
        portionExplicit: false,
      }),
    ]);
  });

  it.each([
    ['steak', 1, 'piece', false],
    ['1 steak', 1, 'piece', false],
    ['beef steak', 1, 'piece', false],
    ['big portion of beef steak only', 1, 'piece', false],
    ['100 g steak', 100, 'g', true],
  ] as const)(
    'normalizes generic cooked steak without confusing it with 80/20 ground beef: %s',
    (text, quantity, unit, portionExplicit) => {
      expect(extractLocalFoodCandidates(text)).toEqual([
        expect.objectContaining({
          foodName: 'beef steak grilled',
          quantity,
          unit,
          portionExplicit,
        }),
      ]);
    },
  );

  it.each([
    'tuna steak',
    'pork steak',
    'ground beef steak',
    'ribeye steak',
  ])('does not broaden generic beef-steak handling to a different food: %s', (text) => {
    expect(extractLocalFoodCandidates(text)).toBeNull();
  });

  it.each([
    'mac and cheese',
    'peanut butter and jelly',
    'fish and chips',
    'two spoonfuls of mystery stew',
    '100000 eggs',
  ])('refuses ambiguous or unsafe input so the full parser can handle it: %s', (text) => {
    expect(extractLocalFoodCandidates(text)).toBeNull();
  });

  it('resolves the common meal from Postgres without attempting provider transport', async () => {
    const beforeTransportAttempt = vi.fn(() => {
      throw new Error('paid provider transport must not run');
    });

    const result = await run(
      { text: '3 eggs, 2 slices whole wheat toast, banana and coffee with milk' },
      { beforeTransportAttempt },
    );

    expect(beforeTransportAttempt).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output?.items).toHaveLength(5);
    expect(result.output?.items.every(item => item.source === 'local_db')).toBe(true);
    expect(result.telemetry).toMatchObject({
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      dbHits: 5,
      dbMisses: 0,
    });
  });

  it('resolves generic fries locally and never attempts provider transport', async () => {
    const beforeTransportAttempt = vi.fn(() => {
      throw new Error('paid provider transport must not run');
    });

    const result = await run(
      { text: 'french fries', language: 'en' },
      { beforeTransportAttempt },
    );

    expect(beforeTransportAttempt).not.toHaveBeenCalled();
    expect(result.ok).toBe(true);
    expect(result.output?.items).toHaveLength(1);
    expect(result.output?.items[0]).toMatchObject({
      source: 'local_db',
      brand: null,
    });
    expect(result.output?.items[0].food_name).toMatch(/french/i);
  });

  it.each([
    ['big portion of beef steak only', 200, 49.6, false],
    ['100 g steak', 100, 24.8, true],
  ] as const)(
    'resolves generic steak through the real database without provider transport: %s',
    async (text, expectedGrams, expectedProtein, portionExplicit) => {
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
          portion_explicit: portionExplicit,
        }),
      ]);
      expect(result.telemetry).toMatchObject({
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        dbHits: 1,
        dbMisses: 0,
      });
    },
  );
});
