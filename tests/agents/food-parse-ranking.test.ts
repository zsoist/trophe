import { describe, it, expect } from 'vitest';
import { lexicalIntentScore } from '@/agents/food-parse/lookup';

// lexicalIntentScore only reads candidate.nameEn — minimal fixtures suffice.
const food = (nameEn: string) => ({ nameEn }) as never;

describe('lexicalIntentScore — wrong-variant disambiguation (Phase 1a)', () => {
  it('generic "coffee" ranks plain coffee ABOVE a branded protein product', () => {
    // The benchmark blunder: "coffee" → "Black Edition Coffee" (protein shake, +104g protein).
    expect(lexicalIntentScore(food('Coffee, brewed'), 'coffee'))
      .toBeGreaterThan(lexicalIntentScore(food('Black Edition Coffee'), 'coffee'));
  });

  it('penalizes supplement/shake products for a plain food query', () => {
    expect(lexicalIntentScore(food('Chocolate Whey Protein Shake'), 'chocolate milk'))
      .toBeLessThan(lexicalIntentScore(food('Milk, chocolate, whole'), 'chocolate milk'));
  });

  it('does NOT penalize when the query itself names the product', () => {
    // Querying "whey protein" should not be hurt by the product-token guard.
    expect(lexicalIntentScore(food('Whey Protein Isolate'), 'whey protein'))
      .toBeGreaterThan(0);
  });

  it('leaves ordinary generic matches unaffected', () => {
    // Sanity: a plain food query → plain food keeps its positive score.
    expect(lexicalIntentScore(food('Rice, white, cooked'), 'white rice'))
      .toBeGreaterThan(0);
  });
});
