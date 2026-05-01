/**
 * Trophē v0.3 — recipe-analyze agent.
 *
 * Phase 3 changes vs v1:
 *   - Model resolved via router (agents/router/index.ts).
 *   - Every call traced to local Langfuse.
 *   - OTel GenAI semconv attributes emitted.
 *   - Telemetry extended with traceId + costUsd.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFoodReferencePrompt } from '@/lib/food-units';
import { callAnthropicMessages } from '../clients/anthropic';
import type { RecipeAnalyzeInput, RecipeAnalyzeOutput } from '../schemas/recipe-analyze';
import { isRecipeAnalyzeOutput } from '../schemas/recipe-analyze';
import { pick } from '../router';
import { traced } from '../observability/langfuse';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';

export const RECIPE_ANALYZE_VERSION = 'v1';

const PROMPT_PATH = join(process.cwd(), 'agents/prompts/recipe-analyze.v1.md');
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(): string {
  return PROMPT_TEMPLATE.replace('{{FOOD_REFERENCE}}', buildFoodReferencePrompt());
}

function extractJSON(text: string): RecipeAnalyzeOutput | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (isRecipeAnalyzeOutput(parsed)) return parsed;
  } catch {
    // fall through
  }
  return null;
}

export interface RecipeAnalyzeRunResult {
  ok: boolean;
  output?: RecipeAnalyzeOutput;
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
    traceId: string | null;
    costUsd: number;
  };
}

export async function run(
  input: RecipeAnalyzeInput,
  opts?: { userId?: string; metadata?: Record<string, unknown> },
): Promise<RecipeAnalyzeRunResult> {
  const MAX_INPUT_LENGTH = 4000;
  const sanitizedText = input.text
    .trim()
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  const servings = Math.max(1, Math.floor(input.servings || 1));
  const language = input.language ?? 'en';

  const policy = pick('recipe_analyze');

  const baseTelemetry = {
    model: policy.model,
    version: RECIPE_ANALYZE_VERSION,
    tokensIn: 0,
    tokensOut: 0,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    latencyMs: 0,
    rawStatus: 0,
    traceId: null as string | null,
    costUsd: 0,
  };

  if (!sanitizedText) {
    return {
      ok: false,
      error: 'text is required and must be a non-empty string',
      telemetry: baseTelemetry,
    };
  }

  const systemPrompt = buildSystemPrompt();
  const userMessage = `Analyze this recipe (language: ${language}, servings: ${servings}):\n\n${sanitizedText}`;

  let traceId: string | null = null;

  const result = await traced(
    {
      task: 'recipe_analyze',
      model: policy.model,
      provider: policy.provider,
      prompt: userMessage,
      systemPrompt,
      metadata: { userId: opts?.userId, servings, ...opts?.metadata },
    },
    async (_generation) => {
      if (_generation) {
        traceId = (_generation as { traceId?: string }).traceId ?? null;
      }
      return callAnthropicMessages({
        model: policy.model,
        system: systemPrompt,
        userMessage,
        maxTokens: policy.maxTokens,
        cacheSystem: policy.cacheSystem,
      });
    },
  );

  const costUsd = estimateCostUsd(
    policy.model,
    result.usage.input_tokens,
    result.usage.output_tokens,
    result.usage.cache_read_input_tokens ?? 0,
  );

  emitGenAISpan({
    task: 'recipe_analyze',
    system: 'anthropic',
    model: policy.model,
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
    version: RECIPE_ANALYZE_VERSION,
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
    return { ok: false, error: result.rawError || 'Empty response from AI', telemetry };
  }

  const parsed = extractJSON(result.text);
  if (!parsed) {
    return { ok: false, error: 'Could not parse recipe from response', telemetry };
  }

  // User's servings value always wins; recompute per-serving from totals.
  parsed.servings = servings;
  parsed.per_serving = {
    calories: Math.round(parsed.total.calories / servings),
    protein_g: Math.round((parsed.total.protein_g / servings) * 10) / 10,
    carbs_g: Math.round((parsed.total.carbs_g / servings) * 10) / 10,
    fat_g: Math.round((parsed.total.fat_g / servings) * 10) / 10,
    fiber_g: Math.round((parsed.total.fiber_g / servings) * 10) / 10,
    sugar_g: Math.round((parsed.total.sugar_g / servings) * 10) / 10,
  };

  return { ok: true, output: parsed, telemetry };
}
