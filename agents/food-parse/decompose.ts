/**
 * agents/food-parse/decompose.ts — Composite dish decomposition pipeline.
 *
 * DietAI24-inspired: LLM decomposes composite dishes into base ingredients,
 * each ingredient is looked up in the foods table for deterministic macros,
 * then results are aggregated and cached in dish_recipes for future use.
 *
 * Flow:
 *   1. Check dish_recipes cache (tsvector match on dish_name)
 *   2. Cache miss → LLM decomposition (DeepSeek, structured output via tool calling)
 *   3. lookupFoodBatch for each ingredient
 *   4. Aggregate macros deterministically
 *   5. Cache result in dish_recipes
 *   6. Return aggregated ParsedFoodItem
 *
 * Called from index.v4.ts when a food lookup returns null (DB miss).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { db } from '../../db/client';
import { sql } from 'drizzle-orm';
import { executeAiTask } from '../runtime';
import { invokeStructuredProvider } from '../runtime/providers/structured';
// Note: invokeTextProvider removed — decompose uses invokeStructuredProvider (DeepSeek) only.
import { lookupFood, COMMON_PIECE_WEIGHTS, correctFoodName } from './lookup';
import type { LookupInput, LookupResult } from './lookup';
import type { ParsedFoodItem } from '../schemas/food-parse';
import { classifyIngredient, getCategoryMacros } from './food-category-defaults';

// ── Zod schema for LLM decomposition output ──────────────────────────────────

const decomposedIngredientSchema = z.object({
  name: z.string().min(1),
  grams: z.number().positive(),
});

const decompositionResultSchema = z.object({
  dish_name: z.string(),
  total_grams: z.number().nonnegative(),
  ingredients: z.array(decomposedIngredientSchema).min(1),
});

/** JSON Schema counterpart for invokeStructuredProvider. */
const DECOMPOSITION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['dish_name', 'total_grams', 'ingredients'],
  additionalProperties: false,
  properties: {
    dish_name: { type: 'string' },
    total_grams: { type: 'number' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'grams'],
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          grams: { type: 'number' },
        },
      },
    },
  },
};

// ── Types ────────────────────────────────────────────────────────────────────

interface DecomposedIngredient {
  name: string;
  grams: number;
}

interface DecompositionResult {
  dish_name: string;
  total_grams: number;
  ingredients: DecomposedIngredient[];
}

interface CachedRecipe {
  id: string;
  dish_name: string;
  dish_name_localized: string | null;
  total_grams: number;
  total_kcal: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number | null;
  ingredients: Array<{ food_id: string | null; food_name: string; grams: number; matched_confidence: number }>;
  source: string;
  confidence: number;
}

interface DecomposeInput {
  foodName: string;
  nameLocalized?: string;
  quantity: number;
  unit: string;
  rawText: string;
  region?: string;
  beforeTransportAttempt?: (endpoint: string) => unknown;
}

const COUNT_UNITS = new Set([
  'piece', 'pieces', 'unit', 'units', 'item', 'items', 'each', 'count',
  'τεμάχιο', 'τεμάχια', 'κομμάτι', 'κομμάτια',
  'unidad', 'unidades',
]);

function isCountUnit(unit: string): boolean {
  return COUNT_UNITS.has(unit.toLowerCase().trim());
}

/**
 * Look up per-piece grams for a food name using the shared COMMON_PIECE_WEIGHTS map.
 * Tries exact key match first, then substring fuzzy match.
 * Returns null if no known piece weight exists.
 */
function getPieceWeight(foodName: string): number | null {
  const key = foodName.toLowerCase().replace(/[^a-z]+/g, '_').replace(/^_|_$/g, '');

  // Exact match
  if (COMMON_PIECE_WEIGHTS[key]) return COMMON_PIECE_WEIGHTS[key];

  // Fuzzy: find the LONGEST matching key (most specific wins)
  let bestMatch: string | null = null;
  let bestWeight: number | null = null;
  for (const [pattern, weight] of Object.entries(COMMON_PIECE_WEIGHTS)) {
    if (key.includes(pattern) || pattern.includes(key)) {
      if (!bestMatch || pattern.length > bestMatch.length) {
        bestMatch = pattern;
        bestWeight = weight;
      }
    }
  }
  return bestWeight;
}

// ── Prompt ───────────────────────────────────────────────────────────────────

const DECOMPOSE_PROMPT_PATH = join(process.cwd(), 'agents/prompts/food-decompose.md');
let decomposePomptCache: string | null = null;

function getDecomposePrompt(): string {
  if (!decomposePomptCache) {
    decomposePomptCache = readFileSync(DECOMPOSE_PROMPT_PATH, 'utf-8');
  }
  return decomposePomptCache;
}

// ── Cache lookup ─────────────────────────────────────────────────────────────

/**
 * Search dish_recipes by exact normalized identity.
 *
 * A recipe cache is not a general food search index. Partial token matches
 * caused base foods such as rice and tuna to resolve to unrelated composites.
 * Returns null if no match found.
 */
export async function lookupCachedRecipe(dishName: string): Promise<CachedRecipe | null> {
  const normalized = dishName.toLowerCase().trim();

  // First: exact match (cheap). Then: trigram similarity > 0.55 (fuzzy).
  // pg_trgm catches "chicken souvlaki pita" matching cached "souvlaki chicken pita".
  // Length-ratio guard: short inputs must be at least 60% of the dish_name length
  // to prevent "chicken" (7ch) fuzzy-matching "gyros chicken" (13ch) at sim=0.57.
  const results = await db.execute(sql`
    SELECT id, dish_name, dish_name_localized, total_grams, total_kcal,
           total_protein, total_carbs, total_fat, total_fiber,
           ingredients, source, confidence
    FROM dish_recipes
    WHERE lower(dish_name) = ${normalized}
       OR lower(coalesce(dish_name_localized, '')) = ${normalized}
       OR (similarity(lower(dish_name), ${normalized}) > 0.55
           AND length(${normalized}) >= length(dish_name) * 0.6)
    ORDER BY
      CASE WHEN lower(dish_name) = ${normalized}
                OR lower(coalesce(dish_name_localized, '')) = ${normalized}
           THEN 0 ELSE 1 END,
      similarity(lower(dish_name), ${normalized}) DESC,
      use_count DESC
    LIMIT 1
  `) as unknown as { rows: CachedRecipe[] };

  if (results.rows.length === 0) return null;

  // Bump use_count + last_used_at (fire and forget)
  const recipe = results.rows[0];
  db.execute(sql`
    UPDATE dish_recipes
    SET use_count = use_count + 1, last_used_at = NOW()
    WHERE id = ${recipe.id}::uuid
  `).catch(() => { /* non-critical */ });

  return recipe;
}

// ── LLM Decomposition ────────────────────────────────────────────────────────

/**
 * Call LLM to decompose a composite dish into base ingredients.
 * Uses invokeStructuredProvider (DeepSeek tool calling) + Zod validation
 * to eliminate silent-corruption risk from raw JSON.parse.
 */
async function llmDecompose(
  dishName: string,
  unit: string,
  beforeTransportAttempt?: (endpoint: string) => unknown,
): Promise<DecompositionResult | null> {
  // Cache decompositions per unit. The caller applies quantity after
  // aggregation; including it here would scale the result twice.
  const prompt = `Decompose one unit of this dish into base ingredients:\n\nInput: "${dishName}" (1 ${unit})`;

  try {
    const generation = await executeAiTask({
      task: 'food_parse',
      prompt,
      systemPrompt: getDecomposePrompt(),
      context: { metadata: { operation: 'dish-decompose' } },
      invoke: ({ policy: selected, signal }) => invokeStructuredProvider({
        policy: selected,
        signal,
        system: getDecomposePrompt(),
        prompt,
        schema: DECOMPOSITION_JSON_SCHEMA,
        validator: decompositionResultSchema,
        toolName: 'submit_decomposition',
        toolDescription: 'Submit dish decomposition into base ingredients with gram weights',
        strict: true,
        maxTokens: 1024,
        beforeTransportAttempt,
      }),
    });
    return generation.output;
  } catch (err) {
    // Zod validation error or provider failure — treat as decomposition miss
    console.warn('[decompose] LLM structured call failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ── Cache write ──────────────────────────────────────────────────────────────

async function cacheRecipe(
  dishName: string,
  dishNameLocalized: string | undefined,
  region: string,
  totalGrams: number,
  totals: { kcal: number; protein: number; carbs: number; fat: number; fiber: number },
  ingredients: Array<{ food_id: string | null; food_name: string; grams: number; matched_confidence: number }>,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO dish_recipes (dish_name, dish_name_localized, lang, region,
        total_grams, total_kcal, total_protein, total_carbs, total_fat, total_fiber,
        ingredients, source, confidence)
      VALUES (
        ${dishName.toLowerCase().trim()},
        ${dishNameLocalized ?? null},
        'en',
        ARRAY[${region}]::text[],
        ${totalGrams},
        ${totals.kcal},
        ${totals.protein},
        ${totals.carbs},
        ${totals.fat},
        ${totals.fiber},
        ${JSON.stringify(ingredients)}::jsonb,
        'llm_decomp',
        0.75
      )
      ON CONFLICT (dish_name, lang) DO NOTHING
    `);
  } catch (err) {
    // Non-critical — cache miss is OK, just means next call will re-decompose
    console.warn('[decompose] Cache write failed:', err instanceof Error ? err.message : err);
  }
}

// ── Cache-only lookup (no LLM) ──────────────────────────────────────────────

/**
 * Check ONLY the dish_recipes cache for a pre-computed decomposition.
 * Returns a ParsedFoodItem if found, null otherwise.
 * This is cheap (single DB query) and safe to call for every item in the pipeline.
 * Does NOT trigger LLM decomposition — use decomposeAndLookup for that.
 */
export async function lookupCachedRecipeAsItem(input: DecomposeInput): Promise<ParsedFoodItem | null> {
  // Apply FOOD_NAME_CORRECTIONS to catch Greek/Spanish → English dish names
  // before trigram matching. e.g. "σουβλάκι χοιρινό πίτα" → "souvlaki pork pita"
  const correctedName = correctFoodName(input.foodName);
  const cached = await lookupCachedRecipe(correctedName);
  // If correction didn't help, also try the original + localized name
  const finalCached = cached
    ?? (correctedName !== input.foodName ? await lookupCachedRecipe(input.foodName) : null)
    ?? (input.nameLocalized ? await lookupCachedRecipe(input.nameLocalized) : null);
  if (!finalCached) return null;

  // Count-unit scaling: "6 empanadas" should be 6 × per-piece weight, not 6 × full serving.
  // If we know the piece weight, scale by (pieceWeight / cachedTotalGrams) per unit.
  // If we don't know the piece weight, fall through to null (decompose will handle it).
  if (isCountUnit(input.unit)) {
    const pieceWeight = getPieceWeight(input.foodName);
    if (!pieceWeight) return null; // Unknown piece weight — can't safely scale

    const perPieceScale = pieceWeight / (finalCached.total_grams || 1);
    const totalScale = perPieceScale * input.quantity;
    return {
      raw_text: input.rawText,
      food_name: finalCached.dish_name,
      name_localized: finalCached.dish_name_localized ?? input.nameLocalized ?? input.foodName,
      quantity: input.quantity,
      unit: input.unit,
      grams: Math.round(pieceWeight * input.quantity),
      calories: Math.round(finalCached.total_kcal * totalScale * 10) / 10,
      protein_g: Math.round(finalCached.total_protein * totalScale * 10) / 10,
      carbs_g: Math.round(finalCached.total_carbs * totalScale * 10) / 10,
      fat_g: Math.round(finalCached.total_fat * totalScale * 10) / 10,
      fiber_g: Math.round((finalCached.total_fiber ?? 0) * totalScale * 10) / 10,
      sugar_g: 0,
      confidence: finalCached.confidence * 0.85, // slightly lower confidence for piece-weight scaling
      source: 'local_db',
    };
  }

  const scale = input.quantity;
  return {
    raw_text: input.rawText,
    food_name: finalCached.dish_name,
    name_localized: finalCached.dish_name_localized ?? input.nameLocalized ?? input.foodName,
    quantity: input.quantity,
    unit: input.unit,
    grams: Math.round(finalCached.total_grams * scale),
    calories: Math.round(finalCached.total_kcal * scale * 10) / 10,
    protein_g: Math.round(finalCached.total_protein * scale * 10) / 10,
    carbs_g: Math.round(finalCached.total_carbs * scale * 10) / 10,
    fat_g: Math.round(finalCached.total_fat * scale * 10) / 10,
    fiber_g: Math.round((finalCached.total_fiber ?? 0) * scale * 10) / 10,
    sugar_g: 0,
    confidence: finalCached.confidence,
    source: 'local_db',
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Attempt to decompose a composite dish into base ingredients with deterministic macros.
 *
 * Returns a single ParsedFoodItem with aggregated macros if successful, or null
 * if decomposition fails (caller should fall back to LLM macro estimation).
 */
export async function decomposeAndLookup(input: DecomposeInput): Promise<ParsedFoodItem | null> {
  const region = input.region ?? 'US';

  // ── Step 1: Check cache ──────────────────────────────────────────────────
  // Apply name corrections for cross-language recipe matching
  const correctedName = correctFoodName(input.foodName);
  const cached = await lookupCachedRecipe(correctedName)
    ?? (correctedName !== input.foodName ? await lookupCachedRecipe(input.foodName) : null)
    ?? (input.nameLocalized ? await lookupCachedRecipe(input.nameLocalized) : null);

  if (cached) {
    // Count-unit: scale by known piece weight if available
    if (isCountUnit(input.unit)) {
      const pieceWeight = getPieceWeight(input.foodName);
      if (pieceWeight) {
        const perPieceScale = pieceWeight / (cached.total_grams || 1);
        const totalScale = perPieceScale * input.quantity;
        return {
          raw_text: input.rawText,
          food_name: cached.dish_name,
          name_localized: cached.dish_name_localized ?? input.nameLocalized ?? input.foodName,
          quantity: input.quantity,
          unit: input.unit,
          grams: Math.round(pieceWeight * input.quantity),
          calories: Math.round(cached.total_kcal * totalScale * 10) / 10,
          protein_g: Math.round(cached.total_protein * totalScale * 10) / 10,
          carbs_g: Math.round(cached.total_carbs * totalScale * 10) / 10,
          fat_g: Math.round(cached.total_fat * totalScale * 10) / 10,
          fiber_g: Math.round((cached.total_fiber ?? 0) * totalScale * 10) / 10,
          sugar_g: 0,
          confidence: cached.confidence * 0.85,
          source: 'local_db',
        };
      }
      // Unknown piece weight — fall through to LLM decomposition
    } else {
      // Normal serving-based scaling
      const scale = input.quantity;
      return {
        raw_text: input.rawText,
        food_name: cached.dish_name,
        name_localized: cached.dish_name_localized ?? input.nameLocalized ?? input.foodName,
        quantity: input.quantity,
        unit: input.unit,
        grams: Math.round(cached.total_grams * scale),
        calories: Math.round(cached.total_kcal * scale * 10) / 10,
        protein_g: Math.round(cached.total_protein * scale * 10) / 10,
        carbs_g: Math.round(cached.total_carbs * scale * 10) / 10,
        fat_g: Math.round(cached.total_fat * scale * 10) / 10,
        fiber_g: Math.round((cached.total_fiber ?? 0) * scale * 10) / 10,
        sugar_g: 0,
        confidence: cached.confidence,
        source: 'local_db',
      };
    }
  }

  // ── Step 2: LLM decomposition ────────────────────────────────────────────
  const decomposition = await llmDecompose(
    input.foodName,
    input.unit,
    input.beforeTransportAttempt,
  );
  if (!decomposition) return null;

  // ── Step 3: Lookup each ingredient in foods table ────────────────────────
  const lookupInputs: LookupInput[] = decomposition.ingredients.map(ing => ({
    foodName: ing.name,
    unit: 'g',
    region,
  }));

  const lookupResults: Array<LookupResult | null> = [];
  for (const li of lookupInputs) {
    lookupResults.push(await lookupFood(li));
  }

  // ── Step 4: Aggregate macros deterministically ───────────────────────────
  let totalKcal = 0, totalProtein = 0, totalCarbs = 0, totalFat = 0, totalFiber = 0;
  let totalGrams = 0;
  let matchedCount = 0;
  const ingredientDetails: Array<{ food_id: string | null; food_name: string; grams: number; matched_confidence: number }> = [];

  for (let i = 0; i < decomposition.ingredients.length; i++) {
    const ing = decomposition.ingredients[i];
    const lookup = lookupResults[i];

    totalGrams += ing.grams;

    if (lookup) {
      // Deterministic: grams × nutrient_per_100g / 100
      const factor = ing.grams / 100;
      totalKcal += lookup.food.kcalPer100g * factor;
      totalProtein += lookup.food.proteinPer100g * factor;
      totalCarbs += lookup.food.carbPer100g * factor;
      totalFat += lookup.food.fatPer100g * factor;
      totalFiber += (lookup.food.fiberPer100g ?? 0) * factor;
      matchedCount++;

      ingredientDetails.push({
        food_id: lookup.food.id,
        food_name: lookup.food.nameEn,
        grams: ing.grams,
        matched_confidence: 0.9,
      });
    } else {
      // No DB match — use category-aware defaults instead of discarding
      const category = classifyIngredient(ing.name);
      const defaults = getCategoryMacros(ing.name);
      const factor = ing.grams / 100;
      totalKcal += defaults.kcal * factor;
      totalProtein += defaults.protein * factor;
      totalCarbs += defaults.carbs * factor;
      totalFat += defaults.fat * factor;
      totalFiber += defaults.fiber * factor;

      ingredientDetails.push({
        food_id: null,
        food_name: ing.name,
        grams: ing.grams,
        matched_confidence: 0.3,
        estimation_source: 'category_default',
        category,
      } as typeof ingredientDetails[number]);
    }
  }

  const matchRatio = matchedCount / decomposition.ingredients.length;

  // If too few matched, the decomposition is unreliable.
  // 0.35 threshold: allows 2/5 or 3/7 ingredients matched (partial but usable).
  // Between 0.35-0.5: accept but with reduced confidence (set below).
  if (matchRatio < 0.35) {
    console.warn(`[decompose] Low match ratio (${matchedCount}/${decomposition.ingredients.length}) for "${input.foodName}" — using governed fallback`);
    return null;
  }

  // Log which ingredients used category defaults
  if (matchRatio < 1) {
    const fallbackNames = ingredientDetails
      .filter(d => d.food_id === null)
      .map(d => d.food_name);
    console.warn(`[decompose] Partial match (${matchedCount}/${decomposition.ingredients.length}) for "${input.foodName}" — category defaults used for: ${fallbackNames.join(', ')}`);
  }

  // Round totals
  const totals = {
    kcal: Math.round(totalKcal * 10) / 10,
    protein: Math.round(totalProtein * 10) / 10,
    carbs: Math.round(totalCarbs * 10) / 10,
    fat: Math.round(totalFat * 10) / 10,
    fiber: Math.round(totalFiber * 10) / 10,
  };

  // ── Step 5: Cache the decomposition ──────────────────────────────────────
  cacheRecipe(
    input.foodName,
    input.nameLocalized,
    region,
    totalGrams,
    totals,
    ingredientDetails,
  ).catch(() => { /* non-critical */ });

  // ── Step 6: Return aggregated item ───────────────────────────────────────
  const scale = input.quantity;
  // Full match: 0.85, partial match (≥0.5): 0.65, low-partial (0.35-0.5): 0.45
  const confidence = matchRatio === 1
    ? 0.85
    : matchRatio >= 0.5
      ? Math.min(0.65, matchRatio * 0.75)
      : 0.45; // 0.35-0.5 range: accept with low confidence

  return {
    raw_text: input.rawText,
    food_name: input.foodName,
    name_localized: input.nameLocalized ?? input.foodName,
    quantity: input.quantity,
    unit: input.unit,
    grams: Math.round(totalGrams * scale),
    calories: Math.round(totals.kcal * scale * 10) / 10,
    protein_g: Math.round(totals.protein * scale * 10) / 10,
    carbs_g: Math.round(totals.carbs * scale * 10) / 10,
    fat_g: Math.round(totals.fat * scale * 10) / 10,
    fiber_g: Math.round(totals.fiber * scale * 10) / 10,
    sugar_g: 0,
    confidence,
    source: matchRatio === 1 ? 'local_db' : 'local_db+category_default',
  };
}
