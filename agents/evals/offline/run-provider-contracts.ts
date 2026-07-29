import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { taskFallbacks, taskPolicies, type RoutingPolicy } from '@/agents/router/policies';
import { estimateUsageCost } from '@/agents/runtime/cost';
import { classifyAiError, isFallbackEligible } from '@/agents/runtime/error-classification';
import { providerErrorTelemetry } from '@/agents/runtime/provider-error';
import { invokeStructuredProvider } from '@/agents/runtime/providers/structured';
import type { AiUsage, ProviderResult } from '@/agents/runtime/types';
import { offlineProviderScenarios } from './scenarios';
import type {
  OfflineContractProvider,
  OfflineContractReport,
  OfflineFixtureScenario,
  OfflineFixtureStep,
  OfflineScenarioResult,
} from './types';

export const OFFLINE_PROVIDER_CONTRACT_TITLE = 'offline provider-contract evaluation' as const;
const REDACTION_SENTINEL = 'SENSITIVE_SENTINEL_DO_NOT_LOG';
const REPORT_PATH = path.resolve('docs/quality/ai-provider-contracts.json');
const outputSchema = z.object({ value: z.string() }).strict();
const jsonSchema = {
  type: 'object',
  properties: { value: { type: 'string' } },
  required: ['value'],
  additionalProperties: false,
} as const;

type StructuredOutput = z.infer<typeof outputSchema>;

interface FixtureTransport {
  fetchImpl: typeof fetch;
  attempts: () => number;
  statuses: () => number[];
}

interface AttemptOutcome {
  succeeded: boolean;
  result?: ProviderResult<StructuredOutput>;
  error?: unknown;
  runtimeCategory: string;
  attempts: number;
  statuses: number[];
}

function policyFor(provider: OfflineContractProvider): RoutingPolicy {
  if (provider === 'openai') return taskPolicies.food_parse;
  const policy = taskFallbacks.food_parse;
  if (!policy || policy.provider !== 'anthropic') {
    throw new Error('food_parse Anthropic fallback policy is not configured');
  }
  return policy;
}

function makeFixtureTransport(
  provider: OfflineContractProvider,
  steps: OfflineFixtureStep[],
): FixtureTransport {
  let attemptCount = 0;
  const observedStatuses: number[] = [];
  const expectedHost = provider === 'openai' ? 'api.openai.com' : 'api.anthropic.com';

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== expectedHost) throw new Error('offline fixture received an unexpected provider host');

    const step = steps[Math.min(attemptCount, steps.length - 1)];
    attemptCount += 1;
    if (!step) throw new Error('offline fixture has no transport step');
    if (step.kind === 'abort') {
      const signal = init?.signal;
      if (signal instanceof AbortSignal && signal.aborted) {
        throw new DOMException('The offline fixture request was aborted', 'AbortError');
      }
      throw new DOMException('The offline fixture request was aborted', 'AbortError');
    }

    observedStatuses.push(step.status);
    const body = step.rawBody ?? (step.body === undefined ? '' : JSON.stringify(step.body));
    return new Response(body, {
      status: step.status,
      headers: {
        'content-type': 'application/json',
        ...step.headers,
      },
    });
  };

  return {
    fetchImpl,
    attempts: () => attemptCount,
    statuses: () => [...observedStatuses],
  };
}

function successfulRuntimeCategory(statuses: number[]): string {
  if (statuses.includes(429)) return 'rate_limit';
  if (statuses.some((status) => status === 408 || status === 409 || status >= 500)) {
    return 'transient';
  }
  return 'success';
}

function failureRuntimeCategory(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'abort';
  return classifyAiError(error);
}

async function invokeFixture(
  provider: OfflineContractProvider,
  steps: OfflineFixtureStep[],
  maxAttempts = 1,
): Promise<AttemptOutcome> {
  const transport = makeFixtureTransport(provider, steps);
  const controller = new AbortController();
  try {
    const result = await invokeStructuredProvider({
      policy: policyFor(provider),
      system: 'Offline provider contract system prompt.',
      prompt: 'Sanitized offline fixture request.',
      signal: controller.signal,
      schema: jsonSchema,
      validator: outputSchema,
      toolName: 'submit_result',
      toolDescription: 'Submit the sanitized offline fixture result.',
      strict: true,
      maxAttempts,
      fetchImpl: transport.fetchImpl,
    });
    return {
      succeeded: true,
      result,
      runtimeCategory: successfulRuntimeCategory(transport.statuses()),
      attempts: transport.attempts(),
      statuses: transport.statuses(),
    };
  } catch (error) {
    return {
      succeeded: false,
      error,
      runtimeCategory: failureRuntimeCategory(error),
      attempts: transport.attempts(),
      statuses: transport.statuses(),
    };
  }
}

function usageEqual(actual: AiUsage, expected: AiUsage | undefined): boolean {
  if (!expected) return true;
  return (
    actual.inputTokens === expected.inputTokens
    && actual.outputTokens === expected.outputTokens
    && (actual.cacheReadTokens ?? 0) === (expected.cacheReadTokens ?? 0)
    && (actual.cacheWriteTokens ?? 0) === (expected.cacheWriteTokens ?? 0)
    && (actual.reasoningTokens ?? 0) === (expected.reasoningTokens ?? 0)
  );
}

function safeErrorUsage(error: unknown): AiUsage {
  return providerErrorTelemetry(error).usage ?? { inputTokens: 0, outputTokens: 0 };
}

async function runScenario(scenario: OfflineFixtureScenario): Promise<OfflineScenarioResult> {
  const primary = await invokeFixture(
    scenario.provider,
    scenario.steps,
    scenario.maxAttempts ?? 1,
  );
  let final = primary;
  let attempts = primary.attempts;
  let fallbackUsed = false;
  let costModel = policyFor(scenario.provider).model;

  if (
    !primary.succeeded
    && scenario.fallback
    && isFallbackEligible(classifyAiError(primary.error))
  ) {
    fallbackUsed = true;
    const fallback = await invokeFixture(scenario.fallback.provider, scenario.fallback.steps, 1);
    final = fallback;
    attempts += fallback.attempts;
    costModel = policyFor(scenario.fallback.provider).model;
  }

  const usage = final.result?.usage ?? safeErrorUsage(final.error);
  const normalized = {
    id: scenario.id,
    provider: scenario.provider,
    attempts,
    fallbackUsed,
    category: scenario.reportCategory,
    usage,
    estimatedCostUsd: estimateUsageCost(costModel, usage),
  };
  const leakedSentinel = JSON.stringify(normalized).includes(REDACTION_SENTINEL);
  const passed = (
    final.succeeded === scenario.expectedSuccess
    && final.runtimeCategory === scenario.runtimeCategory
    && attempts === scenario.expectedAttempts
    && fallbackUsed === scenario.expectedFallbackUsed
    && usageEqual(usage, scenario.expectedUsage)
    && !leakedSentinel
  );

  return { ...normalized, passed, leakedSentinel };
}

export async function runOfflineProviderContracts(
  options: { writeReport?: boolean } = {},
): Promise<OfflineContractReport> {
  const results: OfflineScenarioResult[] = [];
  for (const scenario of offlineProviderScenarios) results.push(await runScenario(scenario));

  const passed = results.filter((result) => result.passed).length;
  const report: OfflineContractReport = {
    title: OFFLINE_PROVIDER_CONTRACT_TITLE,
    generatedAt: new Date().toISOString(),
    evidenceKind: 'offline_provider_contract',
    liveModelQualityEvidence: false,
    networkPolicy: 'injected_fixture_transports_only',
    summary: {
      total: results.length,
      passed,
      failed: results.length - passed,
      passRate: results.length === 0 ? 0 : passed / results.length,
      liveTransportAttempts: 0,
    },
    results,
  };

  if (options.writeReport !== false) {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  }
  return report;
}
