/**
 * Ask/Food identity parity through the shared catalogue adapter.
 *
 * Ask (agents/coach-assistant/food-reference.ts) reuses the real Food lookup
 * (`lookupFood`) via `makeFoodReferenceLookup`, so a query the user typed keeps
 * whatever catalogue row Food would resolve. These tests lock that the adapter
 * surfaces the SAME identity/source facts — including the catalogue brand and
 * foods.id — rather than inventing or dropping them. No DB, no network.
 */
import { expect, it } from 'vitest';
import { makeFoodReferenceLookup } from './food-reference';

const signal = () => new AbortController().signal;

it('returns the branded catalogue identity and id Food resolved', async () => {
  const lookup = makeFoodReferenceLookup(async ({ unit }) => ({
    // The resolver is unit-agnostic for our purposes; only the base row matters.
    food: {
      id: '11111111-1111-4111-8111-111111111111',
      nameEn: "McDONALD'S, BIG MAC",
      brand: "McDonald's",
      source: 'usda',
      dataQuality: 'label',
      kcalPer100g: 257,
      proteinPer100g: 11.6,
    },
    conversionId: unit === 'g' ? null : 'conv-piece-bigmac',
    gramsPerUnit: unit === 'g' ? 100 : 215,
  }));

  const reference = await lookup('Big Mac', 'dos Big Macs', signal());

  expect(reference).not.toBeNull();
  expect(reference!.name).toBe("McDONALD'S, BIG MAC");
  expect(reference!.brand).toBe("McDonald's");
  expect(reference!.catalogueId).toBe('11111111-1111-4111-8111-111111111111');
  expect(reference!.source).toBe('usda');
  expect(reference!.quality).toBe('label');
  // The deterministic catalogue identity is unchanged by adding brand/id.
  expect(reference!.referenceId).toBe("mcdonald's, big mac|usda|");
});

it('reports a generic row as brand-less and never synthesises a brand', async () => {
  const lookup = makeFoodReferenceLookup(async () => ({
    food: {
      id: '22222222-2222-4222-8222-222222222222',
      nameEn: 'Burger, plain',
      brand: null,
      source: 'usda',
      dataQuality: 'label',
      kcalPer100g: 254,
      proteinPer100g: 12.8,
    },
    conversionId: null,
    gramsPerUnit: 100,
  }));

  const reference = await lookup('burger', 'a burger', signal());

  expect(reference!.brand ?? null).toBeNull();
  expect(reference!.catalogueId).toBe('22222222-2222-4222-8222-222222222222');
});

it('fails closed (null) when the catalogue has no matching row', async () => {
  const lookup = makeFoodReferenceLookup(async () => null);
  expect(await lookup('Big Mac', 'dos Big Macs', signal())).toBeNull();
});
