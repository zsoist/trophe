/**
 * Branded-intent plural parity for the shared lookup path.
 *
 * `lookupFood()` (agents/food-parse/lookup.ts) filters/demotes branded
 * catalogue rows unless the user's own text names the brand. That decision has
 * the same singular/plural blind spot as the output guard: the query marker
 * `/\bbig mac\b/` has no word boundary before a trailing plural "s".
 *
 * Consequence: "dos Big Macs" lost branded intent, so `metadataBoost` filtered
 * the Big Mac row out and Food/Ask could not return the same catalogue identity
 * the user named. `brandedOffAdjustment()` is the exported single A/B lever over
 * that decision, so it is the honest seam to lock here (pure, no DB).
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

const bigMac = food({
  nameEn: "McDONALD'S, BIG MAC",
  brand: "McDonald's",
  source: 'usda',
  canonicalFoodKey: 'mcdonalds_big_mac',
  region: ['US'],
});

const whopper = food({
  nameEn: 'WHOPPER, Burger King',
  brand: 'Burger King',
  source: 'off',
  region: ['US'],
});

describe('branded intent survives ES/EN singular and plural', () => {
  it.each([
    ['one Big Mac', "McDonald's"],
    ['dos Big Macs', "McDonald's"],
    ['two big macs', "McDonald's"],
    ['2 Big Macs', "McDonald's"],
  ])('keeps the Big Mac row eligible for "%s" (no generic-query penalty)', (query) => {
    expect(brandedOffAdjustment(bigMac, query, 'US')).toBe(0);
  });

  it.each([
    ['burger', -5],
    ['hamburguesa', -5],
  ])('still demotes the Big Mac row for a generic query "%s"', (query, expected) => {
    expect(brandedOffAdjustment(bigMac, query, 'US')).toBe(expected);
  });

  it.each([
    ['one whopper', 0],
    ['dos whoppers', 0],
    ['two Whoppers', 0],
  ])('keeps the Whopper row eligible for "%s"', (query, expected) => {
    // source 'off' + same region: only lifted when the brand is genuinely named.
    expect(brandedOffAdjustment(whopper, query, 'US')).toBe(expected);
  });
});
