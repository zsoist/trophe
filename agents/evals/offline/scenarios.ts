import { z } from 'zod';
import anthropicFixture from '@/tests/fixtures/ai-provider-contracts/anthropic.json';
import openAiFixture from '@/tests/fixtures/ai-provider-contracts/openai.json';
import type { OfflineFixtureScenario } from './types';

const usageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative().optional(),
  cacheWriteTokens: z.number().int().nonnegative().optional(),
  reasoningTokens: z.number().int().nonnegative().optional(),
}).strict();

const stepSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('response'),
    status: z.number().int().min(100).max(599),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.unknown().optional(),
    rawBody: z.string().optional(),
  }).strict().refine((step) => !(step.body !== undefined && step.rawBody !== undefined), {
    message: 'fixture response cannot contain both body and rawBody',
  }),
  z.object({ kind: z.literal('abort') }).strict(),
]);

const fallbackSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  steps: z.array(stepSchema).min(1),
}).strict();

const scenarioSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  reportCategory: z.string().min(1),
  runtimeCategory: z.string().min(1),
  expectedAttempts: z.number().int().positive(),
  expectedFallbackUsed: z.boolean(),
  expectedSuccess: z.boolean(),
  maxAttempts: z.number().int().min(1).max(3).optional(),
  expectedUsage: usageSchema.optional(),
  steps: z.array(stepSchema).min(1),
  fallback: fallbackSchema.optional(),
}).strict();

const fixtureSchema = z.object({
  provider: z.enum(['openai', 'anthropic']),
  scenarios: z.array(scenarioSchema).min(1),
}).strict();

function parseFixture(fixture: unknown): OfflineFixtureScenario[] {
  const parsed = fixtureSchema.parse(fixture);
  return parsed.scenarios.map((scenario) => ({
    ...scenario,
    provider: parsed.provider,
  })) as OfflineFixtureScenario[];
}

export const offlineProviderScenarios = Object.freeze([
  ...parseFixture(openAiFixture),
  ...parseFixture(anthropicFixture),
]);
