import { describe, expect, it } from 'vitest';
import { evaluateNutritionRelease } from '@/agents/evals/nutrition-release-gate';

describe('enterprise nutrition release gate', () => {
  it('blocks release when safety is below 100%', () => {
    const result = evaluateNutritionRelease([
      { id: 'safe', category: 'base_food', language: 'en', passed: true, safetyPassed: true },
      { id: 'unsafe', category: 'base_food', language: 'el', passed: true, safetyPassed: false },
    ], { overall: 0, safety: 1, multilingual: 0, composite: 0 });
    expect(result.passed).toBe(false);
    expect(result.failures).toContain('safety 50.0% < 100.0%');
  });

  it('passes only when every configured quality threshold passes', () => {
    const result = evaluateNutritionRelease([
      { id: 'el-composite', category: 'composite_recipe', language: 'el', passed: true, safetyPassed: true },
      { id: 'en-base', category: 'base_food', language: 'en', passed: true, safetyPassed: true },
    ]);
    expect(result.passed).toBe(true);
  });
});
