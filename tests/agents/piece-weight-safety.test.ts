import { describe, expect, it } from 'vitest';
import { resolveCommonPieceWeight } from '../../agents/food-parse/lookup';

describe('common piece-weight matching', () => {
  it.each([
    ['ham', null],
    ['pea', null],
    ['each', null],
  ])('does not expand short food name %s into a longer unrelated food', (foodName, expected) => {
    expect(resolveCommonPieceWeight(foodName)).toBe(expected);
  });

  it.each([
    ['peach', 150],
    ['hamburger', 150],
    ['butter croissant', 60],
    ['souvlaki chicken pita', 280],
  ])('keeps a token-bounded common weight for %s', (foodName, expected) => {
    expect(resolveCommonPieceWeight(foodName)).toBe(expected);
  });
});
