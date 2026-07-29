import type { AiUsage } from '@/agents/runtime/types';

export type OfflineContractProvider = 'openai' | 'anthropic';

export interface OfflineScenarioResult {
  id: string;
  provider: OfflineContractProvider;
  passed: boolean;
  attempts: number;
  fallbackUsed: boolean;
  category: string;
  usage: AiUsage;
  estimatedCostUsd: number;
  leakedSentinel: boolean;
}

export interface OfflineContractReport {
  title: 'offline provider-contract evaluation';
  generatedAt: string;
  evidenceKind: 'offline_provider_contract';
  liveModelQualityEvidence: false;
  networkPolicy: 'injected_fixture_transports_only';
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    liveTransportAttempts: 0;
  };
  results: OfflineScenarioResult[];
}

export interface OfflineFixtureResponse {
  kind: 'response';
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
  rawBody?: string;
}

export interface OfflineFixtureAbort {
  kind: 'abort';
}

export type OfflineFixtureStep = OfflineFixtureResponse | OfflineFixtureAbort;

export interface OfflineFixtureFallback {
  provider: OfflineContractProvider;
  steps: OfflineFixtureStep[];
}

export interface OfflineFixtureScenario {
  id: string;
  provider: OfflineContractProvider;
  reportCategory: string;
  runtimeCategory: string;
  expectedAttempts: number;
  expectedFallbackUsed: boolean;
  expectedSuccess: boolean;
  maxAttempts?: number;
  expectedUsage?: AiUsage;
  steps: OfflineFixtureStep[];
  fallback?: OfflineFixtureFallback;
}
