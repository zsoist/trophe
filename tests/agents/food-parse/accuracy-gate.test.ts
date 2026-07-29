import { describe, expect, it } from 'vitest';
import { evaluateFoodAccuracyGate } from '../../../agents/evals/food-accuracy-gate';

describe('food accuracy release gate', () => {
  it('rejects an apparently perfect pass rate when golden coverage is incomplete', () => {
    const result = evaluateFoodAccuracyGate({
      totalCases: 43,
      resolvedCases: 27,
      passedCases: 27,
    });

    expect(result.coverageRate).toBeCloseTo(27 / 43);
    expect(result.accuracyRate).toBe(1);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('coverage');
  });

  it('requires at least 95% accuracy without weakening case tolerances', () => {
    const result = evaluateFoodAccuracyGate({
      totalCases: 43,
      resolvedCases: 43,
      passedCases: 40,
    });

    expect(result.accuracyRate).toBeCloseTo(40 / 43);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('accuracy');
  });

  it('passes only when every golden resolves and at least 95% are accurate', () => {
    const result = evaluateFoodAccuracyGate({
      totalCases: 43,
      resolvedCases: 43,
      passedCases: 41,
    });

    expect(result.coverageRate).toBe(1);
    expect(result.accuracyRate).toBeCloseTo(41 / 43);
    expect(result.passed).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it('fails closed for invalid counts and thresholds', () => {
    expect(() =>
      evaluateFoodAccuracyGate({
        totalCases: 0,
        resolvedCases: 0,
        passedCases: 0,
      }),
    ).toThrow('totalCases');

    expect(() =>
      evaluateFoodAccuracyGate({
        totalCases: 2,
        resolvedCases: 3,
        passedCases: 1,
      }),
    ).toThrow('resolvedCases');

    expect(() =>
      evaluateFoodAccuracyGate({
        totalCases: 2,
        resolvedCases: 2,
        passedCases: 3,
      }),
    ).toThrow('passedCases');
  });
});
