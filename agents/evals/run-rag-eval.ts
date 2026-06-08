import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateRagRelease, type RagEvalCaseResult, type RagEvalCategory } from './rag-release-gate';

type DatasetCase = { id: string; category: RagEvalCategory; expected: boolean };
type Dataset = { version: string; cases: DatasetCase[] };
type ObservedResult = { id: string; passed: boolean };

export function validateRagDataset(dataset: Dataset): void {
  const ids = new Set<string>();
  dataset.cases.forEach((item) => {
    if (ids.has(item.id)) throw new Error(`Duplicate RAG eval id: ${item.id}`);
    ids.add(item.id);
  });
}

export function runRagEval(
  datasetPath = join(process.cwd(), 'agents/evals/datasets/rag-enterprise-v1.json'),
  observedPath = process.env.RAG_EVAL_RESULTS,
) {
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as Dataset;
  validateRagDataset(dataset);
  if (!observedPath) {
    return { version: dataset.version, results: [], release: evaluateRagRelease([]), missingEvidence: dataset.cases.map((item) => item.id) };
  }
  const observed = JSON.parse(readFileSync(observedPath, 'utf8')) as ObservedResult[];
  const observedById = new Map(observed.map((item) => [item.id, item]));
  const results: RagEvalCaseResult[] = dataset.cases.flatMap((item) => {
    const result = observedById.get(item.id);
    return result ? [{ id: item.id, category: item.category, passed: result.passed === item.expected }] : [];
  });
  const missingEvidence = dataset.cases.filter((item) => !observedById.has(item.id)).map((item) => item.id);
  const release = evaluateRagRelease(results);
  return { version: dataset.version, results, release: { ...release, passed: release.passed && missingEvidence.length === 0 }, missingEvidence };
}

if (process.argv[1]?.endsWith('run-rag-eval.ts')) {
  const report = runRagEval();
  console.log(JSON.stringify(report, null, 2));
  if (!report.release.passed) process.exit(1);
}
