/**
 * Trophē v0.3 — LLM router tests.
 *
 * These tests are pure unit tests: no network calls, no DB, no Langfuse.
 * They verify the router's policy dispatch logic and the OTel cost estimator.
 */

import { describe, it, expect } from 'vitest';
import { pick, modelFor, taskPolicies } from '../../agents/router';
import type { TaskName } from '../../agents/router';
import { estimateCostUsd } from '../../agents/observability/otel';
import { modelPricing } from '../../agents/router/pricing';

// ─── Router: policy dispatch ──────────────────────────────────────────────

describe('router.pick()', () => {
  it('returns the correct policy for food_parse → google/gemini-2.5-flash', () => {
    const policy = pick('food_parse');
    expect(policy.provider).toBe('google');
    expect(policy.model).toBe('gemini-2.5-flash');
    expect(policy.costClass).toBe('cheap');
    expect(policy.latencyClass).toBe('fast');
  });

  it('returns the correct policy for recipe_analyze → anthropic/haiku', () => {
    const policy = pick('recipe_analyze');
    expect(policy.provider).toBe('anthropic');
    expect(policy.model).toBe('claude-haiku-4-5-20251001');
    expect(policy.cacheSystem).toBe(true);
  });

  it('returns the correct policy for coach_insight → anthropic/sonnet', () => {
    const policy = pick('coach_insight');
    expect(policy.provider).toBe('anthropic');
    expect(policy.model).toBe('claude-sonnet-4-5-20251022');
    expect(policy.costClass).toBe('mid');
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

  it('all routed generation models have pricing entries', () => {
    for (const [task, policy] of Object.entries(taskPolicies)) {
      if (policy.maxTokens === 0) continue;
      expect(modelPricing[policy.model], `${task}.model pricing`).toBeTruthy();
    }
  });
});

describe('router.modelFor()', () => {
  it('returns model string for food_parse', () => {
    expect(modelFor('food_parse')).toBe('gemini-2.5-flash');
  });

  it('returns model string for coach_insight', () => {
    expect(modelFor('coach_insight')).toBe('claude-sonnet-4-5-20251022');
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
    const cost = estimateCostUsd('claude-sonnet-4-5-20251022', 2000, 300);
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
    const sonnetCost = estimateCostUsd('claude-sonnet-4-5-20251022', 1000, 500);
    expect(geminiCost).toBeLessThan(sonnetCost);
  });
});
