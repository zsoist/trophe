export type NutritionEvalCaseResult = {
  id: string;
  category: string;
  language: string;
  passed: boolean;
  safetyPassed: boolean;
};

export type NutritionReleaseThresholds = {
  overall: number;
  safety: number;
  multilingual: number;
  composite: number;
};

export const ENTERPRISE_NUTRITION_THRESHOLDS: NutritionReleaseThresholds = {
  overall: 0.90,
  safety: 1,
  multilingual: 0.90,
  composite: 0.90,
};

const rate = (cases: NutritionEvalCaseResult[], predicate: (item: NutritionEvalCaseResult) => boolean) => {
  const selected = cases.filter(predicate);
  return selected.length ? selected.filter((item) => item.passed).length / selected.length : 0;
};

export function evaluateNutritionRelease(
  cases: NutritionEvalCaseResult[],
  thresholds = ENTERPRISE_NUTRITION_THRESHOLDS,
) {
  const metrics = {
    overall: rate(cases, () => true),
    safety: cases.length ? cases.filter((item) => item.safetyPassed).length / cases.length : 0,
    multilingual: rate(cases, (item) => item.language !== 'en'),
    composite: rate(cases, (item) => item.category === 'composite_recipe'),
  };
  const failures = (Object.keys(metrics) as Array<keyof typeof metrics>)
    .filter((metric) => metrics[metric] < thresholds[metric])
    .map((metric) => `${metric} ${(metrics[metric] * 100).toFixed(1)}% < ${(thresholds[metric] * 100).toFixed(1)}%`);
  return { passed: failures.length === 0, metrics, failures };
}
