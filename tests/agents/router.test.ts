/**
 * Trophē v0.3 — LLM router tests.
 *
 * These tests are pure unit tests: no network calls, no DB, no Langfuse.
 * They verify the router's policy dispatch logic and the OTel cost estimator.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { pick, modelFor, taskPolicies } from '../../agents/router';
import type { TaskName } from '../../agents/router';
import { estimateCostUsd } from '../../agents/observability/otel';
import { modelPricing } from '../../agents/router/pricing';

afterEach(() => {
  delete process.env.DEEPSEEK_COACH_MODEL;
});

// ─── Router: policy dispatch ──────────────────────────────────────────────

describe('router.pick()', () => {
  it('returns the correct policy for food_parse → deepseek/deepseek-v4-flash', () => {
    const policy = pick('food_parse');
    expect(policy.provider).toBe('deepseek');
    expect(policy.model).toBe('deepseek-v4-flash');
    expect(policy.costClass).toBe('cheap');
    expect(policy.latencyClass).toBe('fast');
  });

  it('returns the correct policy for recipe_analyze → deepseek/deepseek-v4-flash', () => {
    const policy = pick('recipe_analyze');
    expect(policy.provider).toBe('deepseek');
    expect(policy.model).toBe('deepseek-v4-flash');
  });

  it('returns the correct policy for coach_insight → deepseek/deepseek-v4-flash', () => {
    const policy = pick('coach_insight');
    expect(policy.provider).toBe('deepseek');
    expect(policy.model).toBe('deepseek-v4-flash');
    expect(policy.costClass).toBe('cheap');
  });

  it('allows an explicit DeepSeek coach canary without changing other routes', () => {
    process.env.DEEPSEEK_COACH_MODEL = 'deepseek-v4-pro';
    expect(pick('coach_insight')).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-pro' });
    expect(pick('food_parse')).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash' });
  });

  it('throws for unknown task names', () => {
    // Cast to TaskName to test runtime guard
    expect(() => pick('unknown_task' as TaskName)).toThrow('[router] Unknown task');
  });

  it('all task policies have required fields', () => {
    for (const [task, policy] of Object.entries(taskPolicies)) {
      expect(policy.provider, `${task}.provider`).toBeTruthy();
      expect(policy.model, `${task}.model`).toBeTruthy();
      expect(policy.costClass, `${task}.costClass`).toBeTruthy();
      expect(policy.latencyClass, `${task}.latencyClass`).toBeTruthy();
      expect(typeof policy.maxTokens, `${task}.maxTokens`).toBe('number');
    }
  });

  it('all routed models have non-zero input pricing entries', () => {
    for (const [task, policy] of Object.entries(taskPolicies)) {
      expect(modelPricing[policy.model], `${task}.model pricing`).toBeTruthy();
      expect(modelPricing[policy.model]?.inputPerMillion, `${task}.input pricing`).toBeGreaterThan(0);
    }
  });
});

describe('router.modelFor()', () => {
  it('returns model string for food_parse', () => {
    expect(modelFor('food_parse')).toBe('deepseek-v4-flash');
  });

  it('returns model string for coach_insight', () => {
    expect(modelFor('coach_insight')).toBe('deepseek-v4-flash');
  });
});

// ─── OTel: cost estimation ─────────────────────────────────────────────────

describe('estimateCostUsd()', () => {
  it('calculates Haiku cost correctly', () => {
    // 1000 input tokens @ $1.00/M + 500 output tokens @ $5.00/M
    const cost = estimateCostUsd('claude-haiku-4-5-20251001', 1000, 500);
    // input: 1000 * 1.00/1M = $0.001; output: 500 * 5.00/1M = $0.0025
    expect(cost).toBeCloseTo(0.001 + 0.0025, 8);
  });

  it('calculates Sonnet cost correctly', () => {
    // 2000 input @ $3/M + 300 output @ $15/M
    const cost = estimateCostUsd('claude-sonnet-4-6', 2000, 300);
    expect(cost).toBeCloseTo(2000 * 3 / 1_000_000 + 300 * 15 / 1_000_000, 8);
  });

  it('deducts cache-read tokens from billable input (Anthropic cache discount)', () => {
    // 1000 total input, 800 cached (charged at cache-read rate), 200 new (charged at full rate)
    const withCache = estimateCostUsd('claude-haiku-4-5-20251001', 1000, 100, 800);
    const withoutCache = estimateCostUsd('claude-haiku-4-5-20251001', 1000, 100, 0);
    // Cache-read tokens are billed at ~10% of full input rate → should be cheaper
    expect(withCache).toBeLessThan(withoutCache);
  });

  it('returns 0 for unknown model', () => {
    expect(estimateCostUsd('unknown-model-xyz', 1000, 1000)).toBe(0);
  });

  it('returns 0 for all-zero tokens', () => {
    expect(estimateCostUsd('claude-haiku-4-5-20251001', 0, 0)).toBe(0);
  });

  it('Gemini Flash is cheaper than Sonnet for equivalent tokens', () => {
    const geminiCost = estimateCostUsd('gemini-2.5-flash', 1000, 500);
    const sonnetCost = estimateCostUsd('claude-sonnet-4-6', 1000, 500);
    expect(geminiCost).toBeLessThan(sonnetCost);
  });
});
