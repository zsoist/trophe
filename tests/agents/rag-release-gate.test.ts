import { describe, expect, it } from 'vitest';
import { evaluateRagRelease, type RagEvalCaseResult, type RagEvalCategory } from '@/agents/evals/rag-release-gate';

const categories: RagEvalCategory[] = [
  'permission_isolation', 'retrieval_relevance', 'citation_accuracy', 'groundedness', 'no_answer',
];

const passingCases = categories.flatMap((category) =>
  Array.from({ length: 5 }, (_, index): RagEvalCaseResult => ({
    id: `${category}-${index + 1}`, category, passed: true,
  })),
);

describe('enterprise RAG release gate', () => {
  it('requires a complete 25-case evaluation suite', () => {
    const result = evaluateRagRelease(passingCases.slice(0, 24));
    expect(result.passed).toBe(false);
    expect(result.caseCount).toBe(24);
  });

  it('blocks any tenant-isolation or no-answer failure', () => {
    const cases = passingCases.map((item) =>
      item.id === 'permission_isolation-1' ? { ...item, passed: false } : item,
    );
    const result = evaluateRagRelease(cases);
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('permission_isolation 80.0% < 100.0%');
  });

  it('passes only when all enterprise thresholds pass', () => {
    expect(evaluateRagRelease(passingCases).passed).toBe(true);
  });
});
