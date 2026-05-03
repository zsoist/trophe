/**
 * tests/agents/food-parse-ranking-wave2.test.ts
 *
 * Regression tests for Wave 2 (WRONG_FOOD retrieval fixes):
 *
 * Fix 1 — Conditional canonical boost:
 *   Canonical entries only get +5 boost when their name/key shares
 *   a token with the query. Prevents plantain_fried winning for "fries".
 *
 * Fix 3 — Word boundary on fuzzy ILIKE:
 *   Fuzzy fallback rejects matches where query tokens appear only as
 *   substrings of longer words (e.g. "latte" inside "platter").
 *
 * These tests require the local DB (port 5433) with foods seeded.
 * They are skipped in CI where the DB is not available.
 */

import { describe, it, expect } from 'vitest';
import { lookupFood } from '../../agents/food-parse/lookup';

const HAS_DB = !!process.env.DATABASE_URL;

describe.skipIf(!HAS_DB)('food-parse ranking (Wave 2 regression)', () => {
  // ── Fix 1: Canonical boost does not promote unrelated foods ──────────────

  describe('Fix 1: conditional canonical boost', () => {
    it('"fries" should not return plantain', async () => {
      const result = await lookupFood({ foodName: 'fries', unit: 'serving', region: 'US' });
      // Should find actual fries (french fries), not plantain
      expect(result).not.toBeNull();
      expect(result!.food.nameEn.toLowerCase()).not.toContain('plantain');
      expect(result!.food.nameEn.toLowerCase()).toContain('frie');
    });

    it('"french fries" should return french fries', async () => {
      const result = await lookupFood({ foodName: 'french fries', unit: 'serving', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.food.nameEn.toLowerCase()).toContain('french');
      expect(result!.food.nameEn.toLowerCase()).not.toContain('plantain');
    });

    it('"plantain" still returns canonical plantain (boost IS applied)', async () => {
      const result = await lookupFood({ foodName: 'plantain', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.food.nameEn.toLowerCase()).toContain('plantain');
      expect(result!.food.canonicalFoodKey).toContain('plantain');
    });

    it('"fried plantain" returns canonical fried plantain', async () => {
      const result = await lookupFood({ foodName: 'fried plantain', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.food.nameEn.toLowerCase()).toContain('plantain');
      expect(result!.food.canonicalFoodKey).toBe('plantain_fried');
    });

    it('"egg" still returns canonical egg', async () => {
      const result = await lookupFood({ foodName: 'egg', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.food.nameEn.toLowerCase()).toContain('egg');
      expect(result!.food.canonicalFoodKey).toContain('egg');
    });

    it('"banana" still returns canonical banana', async () => {
      const result = await lookupFood({ foodName: 'banana', unit: 'piece', region: 'US' });
      expect(result).not.toBeNull();
      expect(result!.food.canonicalFoodKey).toBe('banana_raw');
    });
  });

  // ── Fix 3: Word boundary prevents substring false positives ─────────────

  describe('Fix 3: word boundary on fuzzy ILIKE', () => {
    it('"latte" should not match "platter" (returns null for AI fallback)', async () => {
      const result = await lookupFood({ foodName: 'latte', unit: 'cup', region: 'US' });
      // No coffee/latte in DB — should return null (→ AI estimation fallback)
      if (result !== null) {
        // If it does match something, it must NOT be platter-related
        expect(result.food.nameEn.toLowerCase()).not.toContain('platter');
        expect(result.food.nameEn.toLowerCase()).not.toContain('chicken tenders');
      }
    });

    it('"caffe latte" should not match "platter"', async () => {
      const result = await lookupFood({ foodName: 'caffe latte', unit: 'cup', region: 'US' });
      if (result !== null) {
        expect(result.food.nameEn.toLowerCase()).not.toContain('platter');
      }
    });
  });

  // ── Canonical foods that MUST still work (regression guard) ──────────────

  describe('canonical foods still resolve correctly', () => {
    const cases: Array<{ query: string; unit: string; mustContain: string }> = [
      { query: 'chicken breast', unit: 'piece', mustContain: 'chicken' },
      { query: 'white rice', unit: 'cup', mustContain: 'rice' },
      { query: 'feta', unit: 'piece', mustContain: 'feta' },
      { query: 'yogurt', unit: 'cup', mustContain: 'yogurt' },
      { query: 'apple', unit: 'piece', mustContain: 'apple' },
      { query: 'rice', unit: 'cup', mustContain: 'rice' },
      { query: 'scrambled eggs', unit: 'piece', mustContain: 'egg' },
    ];

    for (const { query, unit, mustContain } of cases) {
      it(`"${query}" resolves to food containing "${mustContain}"`, async () => {
        const result = await lookupFood({ foodName: query, unit, region: 'US' });
        expect(result).not.toBeNull();
        expect(result!.food.nameEn.toLowerCase()).toContain(mustContain);
      });
    }
  });
});
