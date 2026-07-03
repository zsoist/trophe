/**
 * Branded/OFF ranking guards — unit tests for brandedOffAdjustment()
 * (agents/food-parse/lookup.ts, the "weird branded items" fix, 2026-07-02).
 *
 * Pure-function tests: no DB. These lock the three behaviors:
 *   1. generic query → OFF demoted (-5); brand-naming query → no penalty
 *   2. foreign-market OFF SKU (region mismatch) → extra -6
 *   3. zero-macro rows (kcal>20, P=C=F=0) → -8, any source
 * Curated sources must be untouched by the OFF-specific penalties.
 */

import { describe, expect, it } from 'vitest';
import { brandedOffAdjustment } from '@/agents/food-parse/lookup';

type Candidate = Parameters<typeof brandedOffAdjustment>[0];

function food(overrides: Partial<Record<string, unknown>>): Candidate {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    nameEn: 'Test food',
    brand: null,
    source: 'usda',
    dataQuality: 'label',
    region: ['US'],
    kcalPer100g: 100,
    proteinPer100g: 10,
    carbPer100g: 10,
    fatPer100g: 2,
    ...overrides,
  } as unknown as Candidate;
}

describe('brandedOffAdjustment — generic-query OFF demotion', () => {
  it('demotes an OFF row -5 when the query never names the brand (same region)', () => {
    const c = food({ source: 'off', brand: 'Black Edition', region: ['GR'] });
    expect(brandedOffAdjustment(c, 'coffee', 'GR')).toBe(-5);
  });

  it('does NOT demote when the query names the brand', () => {
    const c = food({ source: 'off', brand: 'FAGE', region: ['GR'] });
    expect(brandedOffAdjustment(c, '1 fage yogurt', 'GR')).toBe(0);
  });

  it('brand match is accent- and case-insensitive, incl. Greek brands', () => {
    const c = food({ source: 'off', brand: 'ΚΡΙ ΚΡΙ', region: ['GR'] });
    expect(brandedOffAdjustment(c, 'κρι κρι γιαούρτι 2%', 'GR')).toBe(0);
  });

  it('"2 oreo cookies" must not protect a McDONALD\'S McFlurry row', () => {
    const c = food({ source: 'off', brand: "McDonald's", region: ['US'] });
    expect(brandedOffAdjustment(c, '2 oreo cookies', 'US')).toBe(-5);
  });
});

describe('brandedOffAdjustment — foreign-market SKUs (NL/DE pollution)', () => {
  it('OFF row from another market gets -5 generic + -6 region = -11', () => {
    const c = food({ source: 'off', brand: 'Jumbo', region: ['NL'] });
    expect(brandedOffAdjustment(c, 'chicken fillet', 'GR')).toBe(-11);
  });

  it('naming the brand lifts BOTH penalties (barcode/brand queries work across markets)', () => {
    const c = food({ source: 'off', brand: 'Jumbo', region: ['NL'] });
    expect(brandedOffAdjustment(c, 'jumbo kipfilet', 'GR')).toBe(0);
  });
});

describe('brandedOffAdjustment — zero-macro junk', () => {
  it('penalizes zero-macro rows with kcal>20 by -8 regardless of source', () => {
    const c = food({ proteinPer100g: 0, carbPer100g: 0, fatPer100g: 0, kcalPer100g: 350 });
    expect(brandedOffAdjustment(c, 'protein bar', 'US')).toBe(-8);
  });

  it('does not penalize legit near-zero items (diet drinks, kcal ≤ 20)', () => {
    const c = food({ proteinPer100g: 0, carbPer100g: 0, fatPer100g: 0, kcalPer100g: 1 });
    expect(brandedOffAdjustment(c, 'diet cola', 'US')).toBe(0);
  });

  it('zero-macro OFF foreign SKU stacks all three: -8 -5 -6 = -19', () => {
    const c = food({
      source: 'off', brand: 'Kaufland', region: ['DE'],
      proteinPer100g: 0, carbPer100g: 0, fatPer100g: 0, kcalPer100g: 457,
    });
    expect(brandedOffAdjustment(c, 'crispbread', 'GR')).toBe(-19);
  });
});

describe('brandedOffAdjustment — curated sources untouched', () => {
  it.each(['usda', 'ciqual', 'cofid', 'bedca', 'crea', 'hhf', 'custom'])(
    'source %s with normal macros gets 0 adjustment',
    (source) => {
      const c = food({ source, region: ['FR'] });
      // even with region mismatch + no brand — penalties are OFF-only
      expect(brandedOffAdjustment(c, 'yogurt', 'GR')).toBe(0);
    },
  );
});
