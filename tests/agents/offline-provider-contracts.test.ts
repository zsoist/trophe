import { describe, expect, it } from 'vitest';
import {
  OFFLINE_PROVIDER_CONTRACT_TITLE,
  runOfflineProviderContracts,
} from '@/agents/evals/offline/run-provider-contracts';

const REQUIRED_CATEGORIES = new Set([
  'success',
  'cache_accounting',
  'auth',
  'rate_limit',
  'transient',
  'abort',
  'malformed_json',
  'missing_tool_call',
  'schema',
  'fallback_success',
  'fallback_exhausted',
]);

describe('offline provider-contract evaluation', () => {
  it('runs the complete sanitized scenario matrix through production adapters', async () => {
    const report = await runOfflineProviderContracts({ writeReport: false });

    expect(report.title).toBe(OFFLINE_PROVIDER_CONTRACT_TITLE);
    expect(report.title).toBe('offline provider-contract evaluation');
    expect(report.evidenceKind).toBe('offline_provider_contract');
    expect(report.liveModelQualityEvidence).toBe(false);
    expect(report.networkPolicy).toBe('injected_fixture_transports_only');
    expect(report.results.length).toBeGreaterThanOrEqual(12);
    expect(new Set(report.results.map((result) => result.provider))).toEqual(
      new Set(['openai', 'anthropic']),
    );
    const categories = new Set(report.results.map((result) => result.category));
    for (const category of REQUIRED_CATEGORIES) expect(categories.has(category)).toBe(true);
    expect(report.results.every((result) => result.passed)).toBe(true);
    expect(report.results.some((result) => result.attempts > 1)).toBe(true);
    expect(report.results.some((result) => result.fallbackUsed)).toBe(true);
    expect(report.results.some((result) => result.usage.cacheReadTokens)).toBe(true);
    expect(report.results.some((result) => result.usage.cacheWriteTokens)).toBe(true);
    expect(report.results.some((result) => result.estimatedCostUsd > 0)).toBe(true);
  });

  it('never includes the redaction sentinel in a result or serialized report', async () => {
    const report = await runOfflineProviderContracts({ writeReport: false });

    expect(report.results.every((result) => !result.leakedSentinel)).toBe(true);
    expect(JSON.stringify(report)).not.toContain('SENSITIVE_SENTINEL_DO_NOT_LOG');
  });

  it('reports deterministic aggregate counts and zero live transport attempts', async () => {
    const report = await runOfflineProviderContracts({ writeReport: false });

    expect(report.summary.total).toBe(report.results.length);
    expect(report.summary.passed).toBe(report.results.length);
    expect(report.summary.failed).toBe(0);
    expect(report.summary.passRate).toBe(1);
    expect(report.summary.liveTransportAttempts).toBe(0);
    expect(report.results.every((result) => Number.isFinite(result.estimatedCostUsd))).toBe(true);
  });
});
