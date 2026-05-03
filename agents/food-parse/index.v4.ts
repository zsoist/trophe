/**
 * agents/food-parse/index.v4.ts — DietAI24 deterministic food parse pipeline.
 *
 * Phase 4 architecture change vs v3:
 *   v3: LLM emits macros → 81% accuracy (LLM invents numbers)
 *   v4: LLM emits {food_name, qty, unit} only → DB supplies macros → ≥95% accuracy
 *
 * Pipeline:
 *   1. Router-selected extraction model identifies foods + quantities (fast, cheap)
 *   2. lookupFood() retrieves food row + unit conversion from DB
 *   3. Macros computed deterministically: grams × food.kcal_per_100g / 100
 *   4. Falls back to enrichWithLocalDB (v3 behavior) if lookup returns null
 *
 * Telemetry:
 *   - Langfuse trace per call (includes food_id hits/misses)
 *   - OTel span with model attribution
 *   - agent_runs row written for cost accounting
 *
 * Usage:
 *   import { run as runV4 } from '@/agents/food-parse/index.v4';
 *   const result = await runV4({ text: "2 φέτες ψωμί με 1 κ.σ. ταχίνι" });
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { callAnthropicMessages } from '../clients/anthropic';
import { callGeminiMessages } from '../clients/google';
import type { FoodParseInput, FoodParseOutput, ParsedFoodItem } from '../schemas/food-parse';
import { enrichWithLocalDB } from './enrich';
import { lookupFoodBatch } from './lookup';
import type { LookupInput } from './lookup';
import { pick } from '../router';
import { traced } from '../observability/langfuse';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';
import { db } from '../../db/client';
import { agentRuns } from '../../db/schema/agent_runs';

export const FOOD_PARSE_VERSION = 'v4';

// ── Prompt ───────────────────────────────────────────────────────────────────
const PROMPT_PATH = join(process.cwd(), 'agents/prompts/food-parse.v4.md');
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf-8');

// ── V4 LLM output schema ──────────────────────────────────────────────────────
interface V4Candidate {
  raw_text:      string;
  food_name:     string;
  name_localized: string;
  quantity:      number;
  unit:          string;
  qualifier?:    string | null;
  confidence:    number;
  recognized:    boolean;
}

interface V4LLMOutput {
  items: V4Candidate[];
}

function extractV4JSON(text: string): V4LLMOutput | null {
  // Strip markdown code fences — LLMs often wrap JSON in ```json...```
  const cleaned = text.replace(/```(?:json)?\s*/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*"items"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]);
    if (Array.isArray(parsed.items)) {
      // Filter out items with null/empty food_name — LLM sometimes returns null
      // for foods it can't identify, which would crash downstream .toLowerCase()
      parsed.items = parsed.items.filter((item: V4Candidate) => {
        if (!item.food_name || typeof item.food_name !== 'string' || item.food_name.trim() === '') {
          console.warn('[food-parse] Skipping item with null/empty food_name:', item.raw_text ?? '(no raw_text)');
          return false;
        }
        return true;
      });
      return parsed as V4LLMOutput;
    }
  } catch {}
  return null;
}

// ── Result type ───────────────────────────────────────────────────────────────
export interface FoodParseRunResultV4 {
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
    traceId: string | null;
    costUsd: number;
    /** How many items were resolved from DB (vs falling back to enrich). */
    dbHits: number;
    dbMisses: number;
  };
}

// ── LLM macro estimation fallback ────────────────────────────────────────────
interface MacroEstimate {
  food_name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
}

const MACRO_ESTIMATE_PROMPT = `You are a nutrition database. Given food items with quantities, estimate their macronutrient values.
Return ONLY valid JSON in this exact format:
{
  "estimates": [
    {
      "food_name": "the food name",
      "grams": <estimated total grams for the given quantity>,
      "calories": <total kcal>,
      "protein_g": <total protein in grams>,
      "carbs_g": <total carbohydrates in grams>,
      "fat_g": <total fat in grams>,
      "fiber_g": <total fiber in grams>,
      "sugar_g": <total sugar in grams>
    }
  ]
}

Rules:
- Use standard serving sizes for the region (e.g., 1 arepa ~120g, 1 empanada ~100g, 1 serving soup ~350g).
- All values should be for the TOTAL quantity specified, not per 100g.
- Round to 1 decimal place.
- Be conservative — better to slightly underestimate than overestimate.
- Consider cooking method (fried adds fat, boiled doesn't).`;

async function estimateMacrosViaLLM(
  items: { food_name: string; quantity: number; unit: string; raw_text: string }[],
): Promise<(MacroEstimate | null)[]> {
  if (items.length === 0) return [];

  const userMessage = items
    .map((it, i) => `${i + 1}. ${it.raw_text} (${it.quantity} ${it.unit} of ${it.food_name})`)
    .join('\n');

  try {
    const policy = pick('food_parse'); // Use the same model for consistency

    let responseText = '';

    if (policy.provider === 'google') {
      const result = await callGeminiMessages({
        model: policy.model,
        system: MACRO_ESTIMATE_PROMPT,
        userMessage,
        maxTokens: 1024,
        // Disable thinking for macro estimation — it's a simple structured-output
        // task and thinking tokens consume the maxOutputTokens budget, causing
        // truncated JSON responses (root cause of ZERO_KCAL for Colombian dishes).
        disableThinking: true,
      });
      responseText = result.text;
    } else {
      const result = await callAnthropicMessages({
        model: policy.model,
        system: MACRO_ESTIMATE_PROMPT,
        userMessage,
        maxTokens: 1024,
        cacheSystem: false,
      });
      responseText = result.text;
    }

    // Strip markdown code fences — Gemini Flash often wraps JSON in ```json...```
    responseText = responseText.replace(/```(?:json)?\s*/g, '').trim();

    // Guard: detect truncated responses (incomplete JSON from token budget exhaustion)
    if (responseText.length > 0 && !responseText.endsWith('}') && !responseText.endsWith(']')) {
      console.warn('[food-parse] LLM macro estimation: response appears truncated (no closing brace). Length:', responseText.length, 'Tail:', responseText.slice(-60));
      return items.map(() => null);
    }

    // Extract JSON — try multiple patterns
    interface MacroEstimate {
      food_name?: string;
      grams?: number;
      calories: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
      fiber_g?: number;
      sugar_g?: number;
    }
    let estimates: MacroEstimate[] | null = null;

    // Pattern 1: { "estimates": [...] }
    const wrapperMatch = responseText.match(/\{[\s\S]*"estimates"\s*:\s*(\[[\s\S]*?\])[\s\S]*?\}/);
    if (wrapperMatch) {
      try { estimates = JSON.parse(wrapperMatch[1]); } catch {}
    }

    // Pattern 2: direct array [...]
    if (!estimates) {
      const arrayMatch = responseText.match(/\[[\s\S]*\]/);
      if (arrayMatch) {
        try { estimates = JSON.parse(arrayMatch[0]); } catch {}
      }
    }

    // Pattern 3: full wrapper object
    if (!estimates) {
      const fullMatch = responseText.match(/\{[\s\S]*\}/);
      if (fullMatch) {
        try {
          const obj = JSON.parse(fullMatch[0]);
          if (Array.isArray(obj.estimates)) estimates = obj.estimates;
          else if (typeof obj.calories === 'number') estimates = [obj]; // single item
        } catch {}
      }
    }

    if (!estimates || !Array.isArray(estimates)) {
      console.warn('[food-parse] LLM macro estimation: no parseable JSON. Response:', responseText.slice(0, 300));
      return items.map(() => null);
    }

    return items.map((_, i) => {
      const est = estimates![i];
      if (!est || typeof est.calories !== 'number') return null;
      return {
        food_name: est.food_name ?? items[i].food_name,
        grams: Math.round(est.grams ?? items[i].quantity * 100),
        calories: Math.round(est.calories),
        protein_g: Math.round((est.protein_g ?? 0) * 10) / 10,
        carbs_g: Math.round((est.carbs_g ?? 0) * 10) / 10,
        fat_g: Math.round((est.fat_g ?? 0) * 10) / 10,
        fiber_g: Math.round((est.fiber_g ?? 0) * 10) / 10,
        sugar_g: Math.round((est.sugar_g ?? 0) * 10) / 10,
      };
    });
  } catch (err) {
    console.error('[food-parse] LLM macro estimation failed:', err);
    return items.map(() => null);
  }
}

// ── Main run function ─────────────────────────────────────────────────────────
export async function run(
  input: FoodParseInput,
  opts?: { userId?: string; metadata?: Record<string, unknown> },
): Promise<FoodParseRunResultV4> {
  const MAX_INPUT_LENGTH = 500;
  const sanitizedText = input.text
    .trim()
    .slice(0, MAX_INPUT_LENGTH)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  const policy = pick('food_parse');
  const language = input.language ?? 'en';

  const emptyTelemetry = {
    model: policy.model, version: FOOD_PARSE_VERSION,
    tokensIn: 0, tokensOut: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
    latencyMs: 0, rawStatus: 0, traceId: null, costUsd: 0, dbHits: 0, dbMisses: 0,
  };

  if (!sanitizedText) {
    return { ok: false, error: 'text is required', telemetry: emptyTelemetry };
  }

  const userMessage = `Parse this food input (language: ${language}):\n\n"${sanitizedText}"`;

  let traceId: string | null = null;

  // ── Step 1: LLM identifies foods (no macro numbers) ──────────────────────
  let llmResult: Awaited<ReturnType<typeof callAnthropicMessages>>;

  try {
    llmResult = await traced(
      {
        task: 'food_parse',
        model: policy.model,
        provider: policy.provider,
        prompt: userMessage,
        systemPrompt: PROMPT_TEMPLATE,
        metadata: { version: 'v4', userId: opts?.userId, ...opts?.metadata },
      },
      async (_generation) => {
        if (_generation) {
          traceId = (_generation as { traceId?: string }).traceId ?? null;
        }

        if (policy.provider === 'google') {
          return callGeminiMessages({
            model: policy.model,
            system: PROMPT_TEMPLATE,
            userMessage,
            maxTokens: policy.maxTokens,
          });
        }

        if (policy.provider !== 'anthropic') {
          throw new Error(`[food_parse] Unsupported provider: ${policy.provider}`);
        }

        return callAnthropicMessages({
          model: policy.model,
          system: PROMPT_TEMPLATE,
          userMessage,
          maxTokens: policy.maxTokens,
          cacheSystem: policy.cacheSystem,
        });
      },
    );
  } catch (err) {
    return {
      ok: false,
      error: String(err),
      telemetry: { ...emptyTelemetry, traceId },
    };
  }

  const costUsd = estimateCostUsd(
    policy.model,
    llmResult.usage.input_tokens,
    llmResult.usage.output_tokens,
    llmResult.usage.cache_read_input_tokens ?? 0,
  );

  emitGenAISpan({
    task: 'food_parse',
    system: policy.provider,
    model: policy.model,
    inputTokens: llmResult.usage.input_tokens,
    outputTokens: llmResult.usage.output_tokens,
    finishReasons: ['stop'],
    latencyMs: llmResult.latencyMs,
    cacheReadTokens: llmResult.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: llmResult.usage.cache_creation_input_tokens ?? 0,
    error: llmResult.rawError,
  });

  const telemetry = {
    model: policy.model,
    version: FOOD_PARSE_VERSION,
    tokensIn: llmResult.usage.input_tokens,
    tokensOut: llmResult.usage.output_tokens,
    cacheCreationTokens: llmResult.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: llmResult.usage.cache_read_input_tokens ?? 0,
    latencyMs: llmResult.latencyMs,
    rawStatus: llmResult.rawStatus,
    traceId,
    costUsd,
    dbHits: 0,
    dbMisses: 0,
  };

  if (llmResult.rawStatus === 0 || !llmResult.text) {
    return { ok: false, error: llmResult.rawError || 'Empty LLM response', telemetry };
  }

  const v4Parsed = extractV4JSON(llmResult.text);
  if (!v4Parsed || v4Parsed.items.length === 0) {
    return { ok: false, error: 'Could not parse food items from LLM response', telemetry };
  }

  // ── Step 2: DB lookup for each identified food ────────────────────────────
  const lookupInputs: LookupInput[] = v4Parsed.items.map(item => ({
    foodName:  item.food_name,
    unit:      item.unit,
    qualifier: item.qualifier ?? undefined,
    region:    language === 'el' ? 'GR' : 'US',
  }));

  const lookupResults = await lookupFoodBatch(lookupInputs);

  // ── Step 3: Build final ParsedFoodItem[] with deterministic macros ────────
  const finalItems: ParsedFoodItem[] = [];
  const dbMissFallbacks: { index: number; candidate: V4Candidate }[] = [];

  for (let i = 0; i < v4Parsed.items.length; i++) {
    const candidate = v4Parsed.items[i];
    const lookup = lookupResults[i];

    if (lookup) {
      // DB hit — deterministic macros
      telemetry.dbHits++;
      const macros = lookup.macros(candidate.quantity);
      finalItems.push({
        raw_text:       candidate.raw_text,
        food_name:      lookup.food.nameEn,
        name_localized: candidate.name_localized,
        quantity:       candidate.quantity,
        unit:           candidate.unit,
        grams:          lookup.gramsTotal(candidate.quantity),
        calories:       macros.kcal,
        protein_g:      macros.protein,
        carbs_g:        macros.carb,
        fat_g:          macros.fat,
        fiber_g:        macros.fiber ?? 0,
        sugar_g:        Math.round((lookup.food.sugarPer100g ?? 0) * lookup.gramsTotal(candidate.quantity) / 100 * 10) / 10,
        confidence:     candidate.confidence,
        source:         'local_db',
      });
    } else {
      // DB miss — try enrichWithLocalDB first, then LLM macro estimation
      telemetry.dbMisses++;

      const legacyItem: ParsedFoodItem = {
        food_name: candidate.food_name,
        name_localized: candidate.name_localized,
        raw_text: candidate.raw_text,
        quantity: candidate.quantity,
        unit: candidate.unit,
        grams: candidate.quantity * 100, // rough default
        calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
        fiber_g: 0, sugar_g: 0,
        confidence: candidate.confidence * 0.7, // lower confidence for fallback
        source: 'ai_estimate' as const,
      };

      const [enriched] = enrichWithLocalDB([legacyItem]);

      if (enriched.calories > 0) {
        // enrichWithLocalDB found a match in the small static DB
        finalItems.push({ ...enriched, source: 'ai_estimate' });
      } else {
        // No match anywhere — use LLM to estimate macros
        dbMissFallbacks.push({ index: finalItems.length, candidate });
        finalItems.push(legacyItem); // placeholder, will be overwritten
      }
    }
  }

  // ── Step 3b: LLM macro estimation for DB misses (parallel, per-item) ─────
  if (dbMissFallbacks.length > 0) {
    const estimatePromises = dbMissFallbacks.map((f) =>
      estimateMacrosViaLLM([{
        food_name: f.candidate.food_name,
        quantity: f.candidate.quantity,
        unit: f.candidate.unit,
        raw_text: f.candidate.raw_text,
      }]).then((results) => results[0]),
    );

    const estimates = await Promise.all(estimatePromises);

    for (let i = 0; i < dbMissFallbacks.length; i++) {
      const { index, candidate } = dbMissFallbacks[i];
      const est = estimates[i];
      if (est && est.calories > 0) {
        finalItems[index] = {
          raw_text:       candidate.raw_text,
          food_name:      candidate.food_name,
          name_localized: candidate.name_localized,
          quantity:       candidate.quantity,
          unit:           candidate.unit,
          grams:          est.grams,
          calories:       est.calories,
          protein_g:      est.protein_g,
          carbs_g:        est.carbs_g,
          fat_g:          est.fat_g,
          fiber_g:        est.fiber_g,
          sugar_g:        est.sugar_g,
          confidence:     candidate.confidence * 0.7,
          source:         'ai_estimate',
        };
      }
    }
  }

  // ── Step 4: Write agent_runs row (fire-and-forget) ────────────────────────
  db.insert(agentRuns).values({
    traceId:    traceId ?? undefined,
    taskName:   'food_parse',
    provider:   policy.provider,
    model:      policy.model,
    tokensIn:   telemetry.tokensIn,
    tokensOut:  telemetry.tokensOut,
    cacheReadTokens:  telemetry.cacheReadTokens,
    cacheWriteTokens: telemetry.cacheCreationTokens,
    costUsd:    telemetry.costUsd,
    latencyMs:  telemetry.latencyMs,
    rawStatus:  telemetry.rawStatus,
    userId:     opts?.userId ?? undefined,
  }).catch(err => {
    // Non-blocking — never fail the food parse because of telemetry
    console.error('[food-parse v4] Failed to write agent_runs:', err);
  });

  return {
    ok: true,
    output: { items: finalItems },
    telemetry: { ...telemetry, dbHits: telemetry.dbHits, dbMisses: telemetry.dbMisses },
  };
}
