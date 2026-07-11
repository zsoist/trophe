import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  factoryPolicy,
  foodParseSimulatorPolicy,
  taskFallbacks,
  taskPolicies,
  type TaskName,
} from '../../agents/router/policies';

const consumerTasks: TaskName[] = [
  'food_parse',
  'recipe_analyze',
  'coach_insight',
  'meal_suggest',
  'photo_analyze',
  'memory_extract',
  'shopping_extract',
];

describe('Phase 3 routing policy', () => {
  it('uses Luna then Haiku for food_parse', () => {
    expect(taskPolicies.food_parse).toMatchObject({
      provider: 'openai',
      model: 'gpt-5.6-luna',
      fallbackOnTimeout: true,
      timeoutMs: 15_000,
    });
    expect(taskFallbacks.food_parse).toMatchObject({
      provider: 'anthropic',
      model: 'claude-haiku-4-5-20251001',
      timeoutMs: 25_000,
    });
  });

  it('keeps DeepSeek out of every consumer primary and fallback', () => {
    for (const task of consumerTasks) {
      expect(taskPolicies[task].provider, `${task} primary`).not.toBe('deepseek');
      expect(taskFallbacks[task]?.provider, `${task} fallback`).not.toBe('deepseek');
    }
  });

  it('keeps health-context tasks on Haiku', () => {
    for (const task of ['coach_insight', 'memory_extract'] as const) {
      expect(taskPolicies[task]).toMatchObject({
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
      });
    }
  });

  it('exposes the exact production policy object to food-parse simulators', () => {
    expect(foodParseSimulatorPolicy).toBe(taskPolicies.food_parse);
  });

  it('confines DeepSeek V4 Flash to the synthetic factory lane', () => {
    expect(factoryPolicy).toBe(taskPolicies.factory_generate);
    expect(factoryPolicy).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash' });
  });

  it('requires eval identity from environment configuration', () => {
    const source = readFileSync(join(process.cwd(), 'scripts/eval/run-greek-colombian-prod.ts'), 'utf8');
    expect(source).toContain('const EVAL_EMAIL = process.env.EVAL_AUTH_EMAIL;');
    expect(source).not.toMatch(/const EVAL_EMAIL\s*=\s*process\.env\.EVAL_AUTH_EMAIL\s*(?:\|\||\?\?)/);
    expect(source).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    expect(source).toContain("const FROZEN_GOLDEN_REF = process.env.EVAL_GOLDEN_REF ?? 'f534ee5';");
    expect(source).toContain('assertOffPeakEvalWindow();');
  });

  it('keeps lane simulators on production policy objects instead of model literals', () => {
    const simulatorFiles = [
      'agents/evals/run-all.ts',
      'agents/evals/run-meal-suggest.ts',
      'scripts/eval/run-food-parse-watchlist.ts',
      'scripts/eval/run-greek-colombian-prod.ts',
    ];
    for (const file of simulatorFiles) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      expect(source, file).toMatch(/taskPolicies|foodParseSimulatorPolicy|verifyProductionFoodParsePolicy/);
      expect(source, file).not.toMatch(/model:\s*['"][^'"]+['"]/);
      expect(source, file).not.toMatch(/const\s+MODEL\s*=/);
    }
  });
});
