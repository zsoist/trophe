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
import { buildFoodReferencePrompt } from '@/lib/food/food-units';
import { z } from 'zod';
import { executeAiTask } from '../runtime';
import { invokeStructuredProvider } from '../runtime/providers/structured';
import type { RecipeAnalyzeInput, RecipeAnalyzeOutput } from '../schemas/recipe-analyze';
import { isRecipeAnalyzeOutput } from '../schemas/recipe-analyze';
import { pick } from '../router';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';
import { normalizeRecipeWithLookup } from './normalize';

export const RECIPE_ANALYZE_VERSION = 'v1';

const PROMPT_PATH = join(process.cwd(), 'agents/prompts/recipe-analyze.v1.md');
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf-8');

function buildSystemPrompt(): string {
  return PROMPT_TEMPLATE.replace('{{FOOD_REFERENCE}}', buildFoodReferencePrompt());
}

const macroProperties = {
  calories: { type: 'number' as const },
  protein_g: { type: 'number' as const },
  carbs_g: { type: 'number' as const },
  fat_g: { type: 'number' as const },
  fiber_g: { type: 'number' as const },
  sugar_g: { type: 'number' as const },
};

const RECIPE_ANALYZE_TOOL = {
  name: 'submit_recipe_analysis',
  description: 'Submit a structured recipe nutrition analysis.',
  input_schema: {
    type: 'object' as const,
    required: ['recipe_name', 'servings', 'ingredients', 'total', 'per_serving'],
    properties: {
      recipe_name: { type: 'string' as const },
      servings: { type: 'number' as const },
      ingredients: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          required: ['raw_text', 'food_name', 'name_localized', 'grams', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'confidence', 'source'],
          properties: {
            raw_text: { type: 'string' as const }, food_name: { type: 'string' as const }, name_localized: { type: 'string' as const },
            grams: { type: 'number' as const }, ...macroProperties, confidence: { type: 'number' as const },
            source: { type: 'string' as const, enum: ['local_db', 'ai_estimate'] },
          },
        },
      },
      total: { type: 'object' as const, required: Object.keys(macroProperties), properties: macroProperties },
      per_serving: { type: 'object' as const, required: Object.keys(macroProperties), properties: macroProperties },
    },
  },
};

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

  const generation = await executeAiTask({
    task: 'recipe_analyze',
    prompt: userMessage,
    systemPrompt,
    context: { userId: opts?.userId, metadata: { servings, ...opts?.metadata } },
    invoke: ({ policy: selected, signal }) => invokeStructuredProvider<RecipeAnalyzeOutput>({
      policy: selected,
      system: systemPrompt,
      prompt: userMessage,
      signal,
      schema: RECIPE_ANALYZE_TOOL.input_schema as unknown as Record<string, unknown>,
      validator: z.custom<RecipeAnalyzeOutput>((v) => isRecipeAnalyzeOutput(v)),
      toolName: RECIPE_ANALYZE_TOOL.name,
      toolDescription: RECIPE_ANALYZE_TOOL.description,
      // Schema does not declare additionalProperties:false, so DeepSeek /beta
      // strict mode would reject it — use standard tool calling.
      strict: false,
    }),
  });
  const parsed = generation.output as RecipeAnalyzeOutput | undefined;
  const result = {
    parsed,
    usage: {
      input_tokens: generation.usage.inputTokens,
      output_tokens: generation.usage.outputTokens,
      cache_read_input_tokens: generation.usage.cacheReadTokens,
      cache_creation_input_tokens: generation.usage.cacheWriteTokens,
    },
    latencyMs: generation.latencyMs,
    rawStatus: generation.rawStatus,
    rawError: undefined,
  };
  const traceId: string | null = generation.generationId;

  const costUsd = estimateCostUsd(
    policy.model,
    result.usage.input_tokens,
    result.usage.output_tokens,
    result.usage.cache_read_input_tokens ?? 0,
  );

  emitGenAISpan({
    task: 'recipe_analyze',
    system: policy.provider,
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

  if (result.rawStatus === 0 || !result.parsed) {
    return { ok: false, error: result.rawError || 'Empty response from AI', telemetry };
  }

  const normalized = await normalizeRecipeWithLookup(result.parsed, servings);

  return { ok: true, output: normalized, telemetry };
}
