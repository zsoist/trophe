export type RagEvalCategory =
  | 'permission_isolation'
  | 'retrieval_relevance'
  | 'citation_accuracy'
  | 'groundedness'
  | 'no_answer';

export type RagEvalCaseResult = {
  id: string;
  category: RagEvalCategory;
  passed: boolean;
};

export const ENTERPRISE_RAG_THRESHOLDS: Record<RagEvalCategory | 'overall', number> = {
  overall: 0.90,
  permission_isolation: 1,
  retrieval_relevance: 0.80,
  citation_accuracy: 1,
  groundedness: 0.90,
  no_answer: 1,
};

export function evaluateRagRelease(
  cases: RagEvalCaseResult[],
  thresholds = ENTERPRISE_RAG_THRESHOLDS,
) {
  const categories: RagEvalCategory[] = [
    'permission_isolation', 'retrieval_relevance', 'citation_accuracy', 'groundedness', 'no_answer',
  ];
  const rate = (selected: RagEvalCaseResult[]) =>
    selected.length ? selected.filter((item) => item.passed).length / selected.length : 0;
  const metrics = Object.fromEntries([
    ['overall', rate(cases)],
    ...categories.map((category) => [category, rate(cases.filter((item) => item.category === category))]),
  ]) as Record<keyof typeof thresholds, number>;
  const failures = (Object.keys(thresholds) as Array<keyof typeof thresholds>)
    .filter((metric) => metrics[metric] < thresholds[metric])
    .map((metric) => `${metric} ${(metrics[metric] * 100).toFixed(1)}% < ${(thresholds[metric] * 100).toFixed(1)}%`);
  return { passed: cases.length >= 25 && failures.length === 0, metrics, failures, caseCount: cases.length };
}
