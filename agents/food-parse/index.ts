import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildFoodReferencePrompt } from '@/lib/food-units';
import { callAnthropicMessages } from '../clients/anthropic';
import type { FoodParseInput, FoodParseOutput } from '../schemas/food-parse';
import { extractJSON } from './extract';
import { enrichWithLocalDB } from './enrich';

export const FOOD_PARSE_MODEL = 'claude-haiku-4-5-20251001';
export const FOOD_PARSE_VERSION = 'v3';

// Load prompt template once at module init. Next.js bundles referenced files.
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
  };
}

export async function run(input: FoodParseInput): Promise<FoodParseRunResult> {
  const MAX_INPUT_LENGTH = 500;
  const sanitizedText = input.text
    .trim()
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  if (!sanitizedText) {
    return {
      ok: false,
      error: 'text is required and must be a non-empty string',
      telemetry: {
        model: FOOD_PARSE_MODEL,
        version: FOOD_PARSE_VERSION,
        tokensIn: 0,
        tokensOut: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        latencyMs: 0,
        rawStatus: 0,
      },
    };
  }

  const language = input.language ?? 'en';
  const systemPrompt = buildSystemPrompt();

  const result = await callAnthropicMessages({
    model: FOOD_PARSE_MODEL,
    system: systemPrompt,
    userMessage: `Parse this food input (language: ${language}):\n\n"${sanitizedText}"`,
    maxTokens: 2048,
    cacheSystem: true,
  });

  const telemetry = {
    model: FOOD_PARSE_MODEL,
    version: FOOD_PARSE_VERSION,
    tokensIn: result.usage.input_tokens,
    tokensOut: result.usage.output_tokens,
    cacheCreationTokens: result.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: result.usage.cache_read_input_tokens ?? 0,
    latencyMs: result.latencyMs,
    rawStatus: result.rawStatus,
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
