import { describe, expect, it } from 'vitest';
import { runRagEval } from '@/agents/evals/run-rag-eval';

describe('enterprise RAG eval dataset', () => {
  it('refuses to pass without observed retrieval evidence', () => {
    const report = runRagEval();
    expect(report.results).toHaveLength(0);
    expect(report.missingEvidence).toHaveLength(25);
    expect(report.release.passed).toBe(false);
  });
});
