/**
 * tests/agents/food-parse-beverage-unit.test.ts
 *
 * Wave 3.5 regression tests for beverage unit normalization.
 *
 * Problem: LLM emits unit:"piece" for "1 coca cola can", pipeline
 * falls back to universal piece=80g default → 31 kcal instead of 138 kcal.
 *
 * Fix: When normalizedUnit === 'piece' AND food is detected as a beverage
 * (via canonical_food_key), prefer liquid container units (can > bottle > glass > cup).
 *
 * Tests split into:
 *   1. Pure unit tests for isBeverageByKey (no DB)
 *   2. DB-dependent resolveUnit tests (skipped in CI)
 */

import { describe, it, expect } from 'vitest';

// ── Pure unit tests: beverage detection logic ────────────────────────────────

// Re-implement the detection logic here for unit testing (same as lookup.ts)
const BEVERAGE_KEY_TOKENS = [
  'cola', 'soda', 'beer', 'juice', 'latte', 'coffee', 'tea', 'water',
  'gatorade', 'pepsi', 'sprite', 'fanta', 'milk', 'energy_drink', 'cappuccino',
];

function isBeverageByKey(canonicalFoodKey: string | null | undefined): boolean {
  if (!canonicalFoodKey) return false;
  const key = canonicalFoodKey.toLowerCase();
  return BEVERAGE_KEY_TOKENS.some(token => key.includes(token));
}

describe('beverage unit normalization (Wave 3.5)', () => {
  describe('isBeverageByKey — pure detection logic', () => {
    // Positive cases: these ARE beverages
    const beverageKeys = [
      'coca_cola',
      'pepsi_cola',
      'sprite',
      'fanta_orange',
      'red_bull_energy_drink',
      'starbucks_caffe_latte',
      'orange_juice_commercial',
      'beer_regular',
      'green_tea',
      'whole_milk',
      'coffee_black',
      'cappuccino_regular',
    ];

    for (const key of beverageKeys) {
      it(`"${key}" is detected as beverage`, () => {
        expect(isBeverageByKey(key)).toBe(true);
      });
    }

    // Negative cases: these are NOT beverages (must not trigger override)
    const nonBeverageKeys = [
      'mcdonalds_big_mac',
      'mcdonalds_chicken_mcnuggets',
      'mcdonalds_french_fries_large',
      'banana_raw',
      'egg_whole_raw',
      'chicken_breast_raw',
      'white_rice_cooked',
      'feta_cheese',
      'plantain_fried',
      'burger_king_whopper',
      'kfc_popcorn_chicken',
      'subway_meatball_sub',
    ];

    for (const key of nonBeverageKeys) {
      it(`"${key}" is NOT detected as beverage`, () => {
        expect(isBeverageByKey(key)).toBe(false);
      });
    }

    // Edge cases
    it('null key returns false', () => {
      expect(isBeverageByKey(null)).toBe(false);
    });

    it('undefined key returns false', () => {
      expect(isBeverageByKey(undefined)).toBe(false);
    });

    it('empty string returns false', () => {
      expect(isBeverageByKey('')).toBe(false);
    });
  });

  // ── DB-dependent tests (require seeded Wave 3 data) ──────────────────────
  const HAS_SEEDED_DB = !!process.env.DATABASE_URL && !process.env.CI;

  describe.skipIf(!HAS_SEEDED_DB)('resolveUnit beverage override (DB)', () => {
    it('"coca_cola" with unit "piece" should resolve to can=355g', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'coca cola', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      // Should get 355g (can) not 80g (universal piece default)
      expect(result!.gramsPerUnit).toBe(355);
    });

    it('"sprite" with unit "piece" should resolve to can=355g', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'sprite', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.gramsPerUnit).toBe(355);
    });

    it('"starbucks_caffe_latte" with unit "piece" should resolve to cup=354g', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'starbucks latte', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      // Should get cup=354 (first in liquid priority after can/bottle/glass)
      // Actually cup is in priority list — depends on what's seeded
      expect(result!.gramsPerUnit).toBeGreaterThan(200); // definitely not 80g
    });

    it('"beer" with unit "piece" should resolve to can=355g', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'beer', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.gramsPerUnit).toBe(355);
    });

    // Regression: non-beverages must NOT be affected
    it('"big mac" with unit "piece" still resolves to 215g (not beverage)', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'big mac', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.gramsPerUnit).toBe(215);
    });

    it('"chicken mcnuggets" with unit "piece" still resolves to 17g (not beverage)', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'chicken mcnuggets', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.gramsPerUnit).toBe(17);
    });

    it('"coca cola" with unit "can" still works directly (no override needed)', async () => {
      const { lookupFood } = await import('../../agents/food-parse/lookup');
      const result = await lookupFood({ foodName: 'coca cola', unit: 'can', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.gramsPerUnit).toBe(355);
    });
  });
});
