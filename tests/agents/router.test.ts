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
  it('routes food_parse through Luna', () => {
    const policy = pick('food_parse');
    expect(policy.provider).toBe('openai');
    expect(policy.model).toBe('gpt-5.6-luna');
    expect(policy.costClass).toBe('mid');
    expect(policy.latencyClass).toBe('fast');
  });

  it('keeps consumer text tasks out of the factory lane', () => {
    const policy = pick('recipe_analyze');
    expect(policy.provider).toBe('openai');
    expect(policy.model).toBe('gpt-5.6-luna');
  });

  it('keeps health-context coach insight on Anthropic', () => {
    const policy = pick('coach_insight');
    expect(policy.provider).toBe('anthropic');
    expect(policy.model).toBe('claude-haiku-4-5-20251001');
    expect(policy.costClass).toBe('cheap');
  });

  it('does not let the retired DeepSeek coach override cross the compliance boundary', () => {
    process.env.DEEPSEEK_COACH_MODEL = 'deepseek-v4-pro';
    expect(pick('coach_insight')).toMatchObject({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001' });
    expect(pick('food_parse')).toMatchObject({ provider: 'openai', model: 'gpt-5.6-luna' });
    delete process.env.DEEPSEEK_COACH_MODEL;
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
    expect(modelFor('food_parse')).toBe('gpt-5.6-luna');
  });

  it('returns model string for coach_insight', () => {
    expect(modelFor('coach_insight')).toBe('claude-haiku-4-5-20251001');
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
    // Anthropic reports 200 uncached input + 800 cached input as additive buckets.
    const withCache = estimateCostUsd('claude-haiku-4-5-20251001', 200, 100, 800);
    const withoutCache = estimateCostUsd('claude-haiku-4-5-20251001', 1000, 100, 0);
    // Cache-read tokens are billed at ~10% of full input rate → should be cheaper
    expect(withCache).toBeLessThan(withoutCache);
  });

  it('prices Anthropic native input and additive cache buckets without subtracting twice', () => {
    const cost = estimateCostUsd('claude-haiku-4-5-20251001', 120, 0, 40, 80);
    expect(cost).toBeCloseTo((120 * 1.00 + 40 * 0.10 + 80 * 1.25) / 1_000_000, 10);
  });

  it('prices Luna cache reads and writes at their distinct rates', () => {
    // 100 uncached + 800 read + 100 write tokens, no output.
    const cost = estimateCostUsd('gpt-5.6-luna', 1_000, 0, 800, 100);
    expect(cost).toBeCloseTo((100 * 1.00 + 800 * 0.10 + 100 * 1.25) / 1_000_000, 10);
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
