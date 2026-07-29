export const FOOD_ACCURACY_THRESHOLD = 0.95;
export const FOOD_GOLDEN_COVERAGE_THRESHOLD = 1;

type FoodAccuracyGateInput = {
  totalCases: number;
  resolvedCases: number;
  passedCases: number;
  accuracyThreshold?: number;
  coverageThreshold?: number;
};

export type FoodAccuracyGateFailure = 'coverage' | 'accuracy';

function assertCount(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative integer`);
  }
}

function assertThreshold(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be between 0 and 1`);
  }
}

export function evaluateFoodAccuracyGate({
  totalCases,
  resolvedCases,
  passedCases,
  accuracyThreshold = FOOD_ACCURACY_THRESHOLD,
  coverageThreshold = FOOD_GOLDEN_COVERAGE_THRESHOLD,
}: FoodAccuracyGateInput) {
  assertCount('totalCases', totalCases);
  assertCount('resolvedCases', resolvedCases);
  assertCount('passedCases', passedCases);
  assertThreshold('accuracyThreshold', accuracyThreshold);
  assertThreshold('coverageThreshold', coverageThreshold);

  if (totalCases === 0) {
    throw new Error('totalCases must be greater than zero');
  }
  if (resolvedCases > totalCases) {
    throw new Error('resolvedCases cannot exceed totalCases');
  }
  if (passedCases > resolvedCases) {
    throw new Error('passedCases cannot exceed resolvedCases');
  }

  const coverageRate = resolvedCases / totalCases;
  const accuracyRate = resolvedCases === 0 ? 0 : passedCases / resolvedCases;
  const failures: FoodAccuracyGateFailure[] = [];

  if (coverageRate < coverageThreshold) failures.push('coverage');
  if (accuracyRate < accuracyThreshold) failures.push('accuracy');

  return {
    passed: failures.length === 0,
    coverageRate,
    accuracyRate,
    failures,
    thresholds: {
      coverage: coverageThreshold,
      accuracy: accuracyThreshold,
    },
  };
}
