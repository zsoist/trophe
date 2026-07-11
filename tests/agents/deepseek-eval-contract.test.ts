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

  it('uses supported V4 model ids across eval generators before the legacy alias retirement', () => {
    for (const file of [
      'scripts/eval/generate-replacement-cases.ts',
      'scripts/eval/generate-french-cases.ts',
      'scripts/eval/generate-benchmark-cases.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain("const MODEL = 'deepseek-v4-flash'");
      expect(source).not.toContain("const MODEL = 'deepseek-chat'");
    }
  });

  it('production provider smoke verifies DeepSeek usage, supported models, and available balance', () => {
    const source = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    for (const expected of [
      'usage.prompt_tokens', 'usage.completion_tokens', 'completion.id',
      '/models', 'deepseek-v4-flash', 'deepseek-v4-pro', '/user/balance', 'balance.is_available',
    ]) expect(source).toContain(expected);
  });
});
