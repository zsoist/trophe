/**
 * scripts/eval/validate-dataset.ts
 *
 * Cross-validates benchmark dataset expected ranges against actual DB lookups.
 * Flags cases where LLM-generated expectations don't match database reality.
 *
 * Usage:
 *   EVAL_DATASET=v3 npx tsx scripts/eval/validate-dataset.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requirePaidAiToolApproval } from '../safety/require-paid-ai-approval';

const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-validate-dataset',
  argv: process.argv.slice(2),
  env: process.env,
});

type Range = { min: number; max: number };
type EvalCase = {
  id: string;
  input: string;
  language: string;
  category: string;
  expect_item_count: number;
  expect_total: {
    calories?: Range;
    protein_g?: Range;
    carbs_g?: Range;
    fat_g?: Range;
  } | null;
  expect_safety: boolean;
  expect_needs_clarification: boolean;
  notes?: string;
};

type LookupResult = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

type ValidationVerdict = {
  caseId: string;
  status: 'pass' | 'flag' | 'skip';
  reason: string;
  details?: {
    macro: string;
    expected: Range;
    actual: number;
    deviationPct: number;
  }[];
};

// TODO(human): Implement the validation logic
function validateCase(
  evalCase: EvalCase,
  lookupResult: LookupResult | null,
): ValidationVerdict {
  // Your task: decide how to validate a case against DB results.
  //
  // Parameters:
  //   evalCase — the benchmark case with expected ranges
  //   lookupResult — the actual macros from running the food through our pipeline
  //                  (null if pipeline couldn't parse/find the food)
  //
  // Return: { caseId, status: 'pass'|'flag'|'skip', reason, details? }
  //
  // Consider:
  //   - What if lookupResult is null? (pipeline couldn't find the food)
  //   - What tolerance makes sense for base_food vs composite vs multi_item?
  //   - Should you flag when actual is WITHIN expected range but at the edge?
  //   - How do you handle cases with expect_needs_clarification: true?

  throw new Error('Not implemented — see TODO(human)');
}

async function runLookup(input: string): Promise<LookupResult | null> {
  const baseUrl = process.env.TROPHE_API ?? 'https://trophe.app';
  try {
    paidAiApproval.consumeAttempt();
    const res = await fetch(`${baseUrl}/api/food-parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input, language: 'en' }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    if (!data.items?.length) return null;
    const totals = data.items.reduce(
      (acc: LookupResult, item: any) => ({
        calories: acc.calories + (item.calories ?? 0),
        protein_g: acc.protein_g + (item.protein_g ?? 0),
        carbs_g: acc.carbs_g + (item.carbs_g ?? 0),
        fat_g: acc.fat_g + (item.fat_g ?? 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
    );
    return totals;
  } catch {
    return null;
  }
}

async function main() {
  const version = process.env.EVAL_DATASET ?? 'v3';
  const datasetPath = join(process.cwd(), `agents/evals/datasets/nutrition-enterprise-${version}.json`);
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as { cases: EvalCase[] };
  const approvedCases = paidAiApproval.boundCases(dataset.cases);

  console.log(`[validate] dataset: ${version} (${approvedCases.length} cases)`);

  const verdicts: ValidationVerdict[] = [];
  const concurrency = 5;
  let next = 0;

  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < approvedCases.length) {
      const idx = next++;
      const c = approvedCases[idx];
      const lookup = await runLookup(c.input);
      verdicts[idx] = validateCase(c, lookup);
      if (verdicts[idx].status === 'flag') {
        console.log(`  ⚠ ${c.id}: ${verdicts[idx].reason}`);
      }
    }
  }));

  const passed = verdicts.filter(v => v.status === 'pass').length;
  const flagged = verdicts.filter(v => v.status === 'flag').length;
  const skipped = verdicts.filter(v => v.status === 'skip').length;

  console.log(`\n[validate] Results: ${passed} pass, ${flagged} flagged, ${skipped} skipped`);
  console.log(`[validate] Validation rate: ${((passed / (passed + flagged)) * 100).toFixed(1)}%`);
}

main().catch(console.error);
