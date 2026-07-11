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

  it('routes eval generators through governed factory telemetry', () => {
    for (const file of [
      'scripts/eval/generate-replacement-cases.ts',
      'scripts/eval/generate-french-cases.ts',
      'scripts/eval/generate-benchmark-cases.ts',
    ]) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source).toContain("import { generateFactoryText } from './factory-runtime'");
      expect(source).not.toContain('api.deepseek.com');
    }
    const runtime = readFileSync(join(process.cwd(), 'scripts/eval/factory-runtime.ts'), 'utf8');
    expect(runtime).toContain("task: 'factory_generate'");
    expect(runtime).toContain('executeAiTask');
    expect(runtime).toContain("{ ...metadata, lane: 'factory', syntheticOnly: true }");
  });

  it('production provider smoke verifies DeepSeek usage, supported models, and available balance', () => {
    const source = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    for (const expected of [
      'usage.prompt_tokens', 'usage.completion_tokens', 'completion.id',
      '/models', 'deepseek-v4-flash', 'deepseek-v4-pro', '/user/balance', 'balance.is_available',
    ]) expect(source).toContain(expected);
  });

  it('production provider smoke exercises the Luna primary with authoritative usage', () => {
    const source = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    for (const expected of [
      'OPENAI_API_KEY', 'OpenAI Luna', 'gpt-5.6-luna', 'usage.prompt_tokens',
      'usage.completion_tokens', 'completion.id',
    ]) expect(source).toContain(expected);
  });
});
