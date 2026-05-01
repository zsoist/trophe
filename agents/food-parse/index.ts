/**
 * Trophē v0.3 — food-parse agent.
 *
 * Phase 3 changes vs v2:
 *   - Model resolved via router (agents/router/index.ts) instead of hardcoded constant.
 *   - Every call is wrapped in a Langfuse generation span (agents/observability/langfuse.ts).
 *   - OTel GenAI attributes emitted on every call (agents/observability/otel.ts).
 *   - Telemetry struct extended with traceId + costUsd.
 *
 * Phase 4 will replace callAnthropicMessages → callGeminiMessages (Gemini 2.5 Flash)
 * and swap enrich.ts for the deterministic lookup.ts.
 * For now the router's policy sets the model for ATTRIBUTION — the actual call
 * still goes to Anthropic to preserve the existing accuracy baseline.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFoodReferencePrompt } from '@/lib/food-units';
import { callAnthropicMessages } from '../clients/anthropic';
import type { FoodParseInput, FoodParseOutput } from '../schemas/food-parse';
import { extractJSON } from './extract';
import { enrichWithLocalDB } from './enrich';
import { pick } from '../router';
import { traced } from '../observability/langfuse';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';

export const FOOD_PARSE_VERSION = 'v3';

// Load prompt template once at module init.
const PROMPT_PATH = join(process.cwd(), 'agents/prompts/food-parse.v3.md');
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(): string {
  return PROMPT_TEMPLATE.replace('{{FOOD_REFERENCE}}', buildFoodReferencePrompt());
}

export interface FoodParseRunResult {
  ok: boolean;
  output?: FoodParseOutput;
  error?: string;
  telemetry: {
    model: string;
    version: string;
    tokensIn: number;
    tokensOut: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
    latencyMs: number;
    rawStatus: number;
    /** Langfuse trace ID — null if Langfuse is not configured. */
    traceId: string | null;
    /** Estimated USD cost for this call. */
    costUsd: number;
  };
}

export async function run(
  input: FoodParseInput,
  opts?: { userId?: string; metadata?: Record<string, unknown> },
): Promise<FoodParseRunResult> {
  const MAX_INPUT_LENGTH = 500;
  const sanitizedText = input.text
    .trim()
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Resolve model via router for attribution.
  const policy = pick('food_parse');

  if (!sanitizedText) {
    return {
      ok: false,
      error: 'text is required and must be a non-empty string',
      telemetry: {
        model: policy.model,
        version: FOOD_PARSE_VERSION,
        tokensIn: 0,
        tokensOut: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        latencyMs: 0,
        rawStatus: 0,
        traceId: null,
        costUsd: 0,
      },
    };
  }

  const language = input.language ?? 'en';
  const systemPrompt = buildSystemPrompt();
  const userMessage = `Parse this food input (language: ${language}):\n\n"${sanitizedText}"`;

  // Phase 3: Anthropic call (model attr from router policy).
  // Phase 4: switch to callGeminiMessages with policy.model when LLM contract changes.
  // For now we use haiku to keep accuracy baseline, but trace as policy.model.
  const RUNTIME_MODEL = 'claude-haiku-4-5-20251001';

  let traceId: string | null = null;

  const result = await traced(
    {
      task: 'food_parse',
      model: policy.model,        // attributed model (gemini-2.5-flash per policy)
      provider: policy.provider,
      prompt: userMessage,
      systemPrompt,
      metadata: { userId: opts?.userId, ...opts?.metadata },
    },
    async (_generation) => {
      // Capture traceId from Langfuse generation if available
      if (_generation) {
        traceId = (_generation as { traceId?: string }).traceId ?? null;
      }
      return callAnthropicMessages({
        model: RUNTIME_MODEL,
        system: systemPrompt,
        userMessage,
        maxTokens: policy.maxTokens,
        cacheSystem: policy.cacheSystem,
      });
    },
  );

  const costUsd = estimateCostUsd(
    RUNTIME_MODEL,
    result.usage.input_tokens,
    result.usage.output_tokens,
    result.usage.cache_read_input_tokens ?? 0,
  );

  // Emit OTel GenAI span.
  emitGenAISpan({
    task: 'food_parse',
    system: 'anthropic',
    model: RUNTIME_MODEL,
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
    finishReasons: ['stop'],
    latencyMs: result.latencyMs,
    cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: result.usage.cache_creation_input_tokens ?? 0,
    error: result.rawError,
  });

  const telemetry = {
    model: policy.model,
    version: FOOD_PARSE_VERSION,
    tokensIn: result.usage.input_tokens,
    tokensOut: result.usage.output_tokens,
    cacheCreationTokens: result.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    latencyMs: result.latencyMs,
    rawStatus: result.rawStatus,
    traceId,
    costUsd,
  };

  if (result.rawStatus === 0 || !result.text) {
    return {
      ok: false,
      error: result.rawError || 'Empty response from AI',
      telemetry,
    };
  }

  const parsed = extractJSON(result.text);
  if (!parsed || parsed.items.length === 0) {
    return {
      ok: false,
      error: 'Could not parse food items from input',
      telemetry,
    };
  }

  const enriched = enrichWithLocalDB(parsed.items);
  return {
    ok: true,
    output: { items: enriched },
    telemetry,
  };
}
