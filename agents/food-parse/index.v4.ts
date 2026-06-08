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
import type { FoodParseInput, FoodParseOutput, ParsedFoodItem } from '../schemas/food-parse';
import { enrichWithLocalDB } from './enrich';
import { lookupFoodBatch } from './lookup';
import type { LookupInput } from './lookup';
import { decomposeAndLookup, lookupCachedRecipeAsItem } from './decompose';
import { pick } from '../router';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';
import { executeAiTask } from '../runtime';
import { invokeGeminiStructured } from '../runtime/providers/structured';
import { foodParseGeminiResponseSchema, foodParseStructuredSchema } from '../schemas/food-parse-structured';
import { macroEstimateGeminiResponseSchema, macroEstimateStructuredSchema } from '../schemas/macro-estimate-structured';

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
  food_state?:    string;
  portion_explicit?: boolean;
  confidence:    number;
  recognized:    boolean;
}

interface V4LLMOutput {
  items: V4Candidate[];
  needs_clarification: boolean;
  clarification_question: string | null;
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

const AMBIGUOUS_PORTION_UNITS = new Set(['serving', 'portion', 'bowl', 'plate', 'dish', 'some']);

export function requiresPortionClarification(items: V4Candidate[]): boolean {
  return items.some((item) =>
    item.portion_explicit === false &&
    AMBIGUOUS_PORTION_UNITS.has(item.unit.toLowerCase().trim())
  );
}

function clarificationQuestion(language: string): string {
  if (language === 'el') return 'Πόση ποσότητα έφαγες; Μπορείς να δώσεις γραμμάρια ή ένα μετρήσιμο μέγεθος μερίδας;';
  if (language === 'es') return '¿Qué cantidad comiste? Indica gramos o un tamaño de porción medible.';
  return 'How much did you eat? Please provide grams or a measurable portion size.';
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
    const generation = await executeAiTask({
      task: 'food_parse',
      prompt: userMessage,
      systemPrompt: MACRO_ESTIMATE_PROMPT,
      context: { metadata: { operation: 'macro-estimate' } },
      invoke: ({ policy: selected, signal }) => invokeGeminiStructured({
        policy: selected,
        signal,
        system: MACRO_ESTIMATE_PROMPT,
        prompt: userMessage,
        responseSchema: macroEstimateGeminiResponseSchema,
        validator: macroEstimateStructuredSchema,
      }),
    });
    const estimates = generation.output.estimates;

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

  // ── Step 1: LLM identifies foods (no macro numbers) ──────────────────────
  let llmResult: {
    output: V4LLMOutput;
    usage: {
      input_tokens: number;
      output_tokens: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    latencyMs: number;
    rawStatus: number;
    rawError?: string;
  };
  let traceId: string | null = null;

  try {
    const generation = await executeAiTask({
      task: 'food_parse',
      prompt: userMessage,
      systemPrompt: PROMPT_TEMPLATE,
      context: { userId: opts?.userId, metadata: { version: 'v4', ...opts?.metadata } },
      invoke: ({ policy: selected, signal }) => invokeGeminiStructured({
        policy: selected,
        signal,
        system: PROMPT_TEMPLATE,
        prompt: userMessage,
        responseSchema: foodParseGeminiResponseSchema,
        validator: foodParseStructuredSchema,
      }),
    });
    traceId = generation.generationId;
    llmResult = {
      output: generation.output,
      usage: {
        input_tokens: generation.usage.inputTokens,
        output_tokens: generation.usage.outputTokens,
        cache_read_input_tokens: generation.usage.cacheReadTokens,
        cache_creation_input_tokens: generation.usage.cacheWriteTokens,
      },
      latencyMs: generation.latencyMs,
      rawStatus: generation.rawStatus,
    };
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

  if (llmResult.rawStatus === 0 || !llmResult.output) {
    return { ok: false, error: llmResult.rawError || 'Empty LLM response', telemetry };
  }

  let v4Parsed: V4LLMOutput | null = llmResult.output;
  if (!v4Parsed) {
    try {
      const repair = await executeAiTask({
        task: 'food_parse',
        prompt: `${userMessage}\n\nYour previous response was invalid. Return only valid JSON matching the required schema.`,
        systemPrompt: PROMPT_TEMPLATE,
        context: { userId: opts?.userId, metadata: { version: 'v4', operation: 'schema-repair', ...opts?.metadata } },
        invoke: ({ policy: selected, signal }) => invokeGeminiStructured({
          policy: selected,
          signal,
          system: PROMPT_TEMPLATE,
          prompt: `${userMessage}\n\nReturn only valid JSON matching the required schema.`,
          responseSchema: foodParseGeminiResponseSchema,
          validator: foodParseStructuredSchema,
        }),
      });
      v4Parsed = repair.output;
    } catch {
      // The normal safe failure below preserves the original telemetry.
    }
  }
  if (!v4Parsed || v4Parsed.items.length === 0) {
    return { ok: false, error: 'Could not parse food items from LLM response', telemetry };
  }

  // ── Step 2: Check dish_recipes cache (cheap, no LLM) ──────────────────────
  // Composite dishes (souvlaki with pita, arepa con queso) should match
  // dish_recipes BEFORE the foods table to avoid partial matches.
  // This is a single DB query per item — no LLM cost.
  const recipeResults: Array<ParsedFoodItem | null> = [];
  for (const item of v4Parsed.items) {
    const explicitMassUnit = ['g', 'gram', 'grams', 'gr', 'γρ', 'kg', 'kilogram', 'kilograms']
      .includes(item.unit.toLowerCase().trim());
    if (explicitMassUnit) {
      recipeResults.push(null);
      continue;
    }
    const cached = await lookupCachedRecipeAsItem({
      foodName: item.food_name,
      nameLocalized: item.name_localized,
      quantity: item.quantity,
      unit: item.unit,
      rawText: item.raw_text,
      region: language === 'el' ? 'GR' : language === 'es' ? 'CO' : 'US',
    });
    recipeResults.push(cached);
  }

  // Only look up items that didn't hit the recipe cache (saves DB queries)
  const nonCachedIndices: number[] = [];
  const lookupInputs: LookupInput[] = [];
  for (let i = 0; i < v4Parsed.items.length; i++) {
    if (recipeResults[i] !== null) continue; // recipe cache hit, skip
    nonCachedIndices.push(i);
    lookupInputs.push({
      foodName:  v4Parsed.items[i].food_name,
      unit:      v4Parsed.items[i].unit,
      qualifier: v4Parsed.items[i].qualifier ?? undefined,
      region:    language === 'el' ? 'GR' : 'US',
    });
  }

  const lookupResults = await lookupFoodBatch(lookupInputs);

  // Re-expand results to match original item indices
  const expandedLookupResults: Array<Awaited<ReturnType<typeof lookupFoodBatch>>[number] | null> = v4Parsed.items.map(() => null);
  for (let j = 0; j < nonCachedIndices.length; j++) {
    expandedLookupResults[nonCachedIndices[j]] = lookupResults[j] ?? null;
  }

  // ── Step 3: Build final ParsedFoodItem[] with deterministic macros ────────
  const finalItems: ParsedFoodItem[] = [];
  const dbMissFallbacks: { index: number; candidate: V4Candidate }[] = [];

  for (let i = 0; i < v4Parsed.items.length; i++) {
    const candidate = v4Parsed.items[i];
    const recipeHit = recipeResults[i];
    const lookup = expandedLookupResults[i];

    // Priority 1: dish_recipes cache hit (composite dish with pre-computed macros)
    if (recipeHit) {
      telemetry.dbHits++;
      finalItems.push(recipeHit);
      continue;
    }

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
        food_state:     candidate.food_state as ParsedFoodItem['food_state'],
        portion_explicit: candidate.portion_explicit,
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
        food_state: candidate.food_state as ParsedFoodItem['food_state'],
        portion_explicit: candidate.portion_explicit,
      };

      const [enriched] = enrichWithLocalDB([legacyItem]);

      if (enriched.calories > 0) {
        // enrichWithLocalDB found a match in the small static DB
        finalItems.push({ ...enriched, source: 'ai_estimate' });
      } else {
        // Try composite dish decomposition before raw LLM estimation
        // (DietAI24 pattern: decompose → lookup ingredients → aggregate)
        const decomposed = await decomposeAndLookup({
          foodName: candidate.food_name,
          nameLocalized: candidate.name_localized,
          quantity: candidate.quantity,
          unit: candidate.unit,
          rawText: candidate.raw_text,
          region: language === 'el' ? 'GR' : language === 'es' ? 'CO' : 'US',
        });

        if (decomposed) {
          finalItems.push(decomposed);
        } else {
          // No match anywhere — use LLM to estimate macros
          dbMissFallbacks.push({ index: finalItems.length, candidate });
          finalItems.push(legacyItem); // placeholder, will be overwritten
        }
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
          food_state:     candidate.food_state as ParsedFoodItem['food_state'],
          portion_explicit: candidate.portion_explicit,
        };
      }
    }
  }

  // Safety barrier: reject physically implausible results instead of exposing
  // silently corrupted nutrition values. These bounds are intentionally broad
  // enough for large meals while catching unit explosions and malformed data.
  const unsafeItem = finalItems.find((item) =>
    !Number.isFinite(item.grams) ||
    !Number.isFinite(item.calories) ||
    item.grams <= 0 ||
    item.grams > 10_000 ||
    item.calories < 0 ||
    item.calories > 10_000 ||
    item.protein_g < 0 ||
    item.carbs_g < 0 ||
    item.fat_g < 0 ||
    item.protein_g + item.carbs_g + item.fat_g > item.grams * 1.15
  );
  if (unsafeItem) {
    return {
      ok: false,
      error: 'Nutrition result failed plausibility validation',
      telemetry,
    };
  }

  const deterministicClarification = requiresPortionClarification(v4Parsed.items);
  if (deterministicClarification) {
    for (const item of finalItems) {
      if (item.portion_explicit === false) item.confidence = Math.min(item.confidence, 0.65);
    }
  }

  return {
    ok: true,
    output: {
      items: finalItems,
      needs_clarification: llmResult.output.needs_clarification || deterministicClarification,
      clarification_question: llmResult.output.clarification_question ??
        (deterministicClarification ? clarificationQuestion(language) : null),
    },
    telemetry: { ...telemetry, dbHits: telemetry.dbHits, dbMisses: telemetry.dbMisses },
  };
}
