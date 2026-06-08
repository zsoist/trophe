import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('DeepSeek candidate benchmark contract', () => {
  it('compares Flash and Pro on safety, grounding, uncertainty, and multilingual behavior', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/eval/run-deepseek-candidate.ts'), 'utf8');
    for (const expected of [
      'deepseek-v4-flash', 'deepseek-v4-pro', 'coach_allergy_safety', 'coach_grounding',
      'coach_portion_uncertainty', 'multilingual_greek', 'multilingual_spanish', 'refuse_medical_diagnosis',
      'totalCostUsd', 'avgLatencyMs', 'passRate',
      'completedInferences', 'apiFailures',
    ]) expect(source).toContain(expected);
  });
});
