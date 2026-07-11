import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { requiredPolicyModels } from '@/scripts/ops/provider-preflight';

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
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    expect(workflow).toContain('npm run ai:provider-preflight');
    const source = readFileSync(join(process.cwd(), 'scripts/ops/provider-preflight.ts'), 'utf8');
    for (const expected of [
      'usage?.prompt_tokens', 'usage?.completion_tokens', 'data.id',
      '/models', "modelFor('deepseek')", 'deepseek-v4-pro', '/user/balance', 'data.is_available',
    ]) expect(source).toContain(expected);
    expect(requiredPolicyModels().deepseek).toContain('deepseek-v4-flash');
  });

  it('production provider smoke exercises the Luna primary with authoritative usage', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/ops/provider-preflight.ts'), 'utf8');
    for (const expected of [
      'OPENAI_API_KEY', 'openai.entitlement', "modelFor('openai')", 'usage?.prompt_tokens',
      'usage?.completion_tokens', 'data.id', 'X-Client-Request-Id',
    ]) expect(source).toContain(expected);
    expect(requiredPolicyModels().openai).toEqual(['gpt-5.6-luna']);
  });

  it('production provider smoke exercises the Voyage embedding lane and its read-only batch capability', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    const source = readFileSync(join(process.cwd(), 'scripts/ops/provider-preflight.ts'), 'utf8');
    for (const expected of [
      'VOYAGE_API_KEY', 'voyage.entitlement', "modelFor('voyage')", 'api.voyageai.com/v1/embeddings',
      'voyage.batch', 'api.voyageai.com/v1/batches?limit=1',
    ]) expect(`${workflow}\n${source}`).toContain(expected);
    expect(requiredPolicyModels().voyage).toEqual(['voyage-4']);
  });

  it('scopes production credentials to the preflight step after dependency installation', () => {
    const workflow = readFileSync(join(process.cwd(), '.github/workflows/provider-smoke.yml'), 'utf8');
    const installIndex = workflow.indexOf('- name: Install dependencies');
    const preflightIndex = workflow.indexOf('- name: Verify production provider credentials and capabilities');
    const firstSecretIndex = workflow.indexOf('ANTHROPIC_API_KEY:');
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/main"');
    expect(installIndex).toBeGreaterThan(0);
    expect(preflightIndex).toBeGreaterThan(installIndex);
    expect(firstSecretIndex).toBeGreaterThan(preflightIndex);
  });
});
