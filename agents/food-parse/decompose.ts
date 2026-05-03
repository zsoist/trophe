/**
 * agents/food-parse/decompose.ts — Composite dish decomposition pipeline.
 *
 * DietAI24-inspired: LLM decomposes composite dishes into base ingredients,
 * each ingredient is looked up in the foods table for deterministic macros,
 * then results are aggregated and cached in dish_recipes for future use.
 *
 * Flow:
 *   1. Check dish_recipes cache (tsvector match on dish_name)
 *   2. Cache miss → LLM decomposition (Gemini Flash, ~$0.003/call)
 *   3. lookupFoodBatch for each ingredient
 *   4. Aggregate macros deterministically
 *   5. Cache result in dish_recipes
 *   6. Return aggregated ParsedFoodItem
 *
 * Called from index.v4.ts when a food lookup returns null (DB miss).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { db } from '../../db/client';
import { sql } from 'drizzle-orm';
import { callGeminiMessages } from '../clients/google';
import { pick } from '../router';
import { lookupFood } from './lookup';
import type { LookupInput, LookupResult } from './lookup';
import type { ParsedFoodItem } from '../schemas/food-parse';

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
 * Search dish_recipes by tsvector for a cached decomposition.
 * Returns null if no match found.
 */
export async function lookupCachedRecipe(dishName: string): Promise<CachedRecipe | null> {
  const normalized = dishName.toLowerCase().trim();

  const results = await db.execute(sql`
    SELECT id, dish_name, dish_name_localized, total_grams, total_kcal,
           total_protein, total_carbs, total_fat, total_fiber,
           ingredients, source, confidence
    FROM dish_recipes
    WHERE to_tsvector('simple', dish_name) @@ plainto_tsquery('simple', ${normalized})
    ORDER BY use_count DESC
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
 */
async function llmDecompose(dishName: string, quantity: number, unit: string): Promise<DecompositionResult | null> {
  const policy = pick('food_parse');
  const prompt = `Decompose this dish into base ingredients:\n\nInput: "${dishName}" (${quantity} ${unit})\n\nReturn ONLY valid JSON.`;

  let responseText = '';
  try {
    if (policy.provider === 'google') {
      const result = await callGeminiMessages({
        model: policy.model,
        system: getDecomposePrompt(),
        userMessage: prompt,
        maxTokens: 1024,
        disableThinking: true,
      });
      responseText = result.text;
    } else {
      // Anthropic fallback
      const { callAnthropicMessages } = await import('../clients/anthropic');
      const result = await callAnthropicMessages({
        model: policy.model,
        system: getDecomposePrompt(),
        userMessage: prompt,
        maxTokens: 1024,
        cacheSystem: false,
      });
      responseText = result.text;
    }
  } catch (err) {
    console.warn('[decompose] LLM call failed:', err instanceof Error ? err.message : err);
    return null;
  }

  // Strip markdown fences
  responseText = responseText.replace(/```(?:json)?\s*/g, '').trim();

  try {
    const parsed = JSON.parse(responseText) as DecompositionResult;
    if (!parsed.ingredients || !Array.isArray(parsed.ingredients) || parsed.ingredients.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    console.warn('[decompose] Failed to parse LLM response:', responseText.slice(0, 200));
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
  const cached = await lookupCachedRecipe(input.foodName);
  if (!cached) return null;

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
  const cached = await lookupCachedRecipe(input.foodName);

  if (cached) {
    // Scale macros by quantity (cached is for 1 serving)
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
      sugar_g: 0, // Not stored in recipe cache
      confidence: cached.confidence,
      source: 'local_db',
    };
  }

  // ── Step 2: LLM decomposition ────────────────────────────────────────────
  const decomposition = await llmDecompose(input.foodName, input.quantity, input.unit);
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
      // Ingredient not in DB — use rough estimate (200 kcal/100g average)
      const factor = ing.grams / 100;
      totalKcal += 200 * factor;
      totalProtein += 8 * factor;
      totalCarbs += 25 * factor;
      totalFat += 8 * factor;
      totalFiber += 2 * factor;

      ingredientDetails.push({
        food_id: null,
        food_name: ing.name,
        grams: ing.grams,
        matched_confidence: 0.3,
      });
    }
  }

  // Require at least 50% of ingredients matched for confidence
  const matchRatio = matchedCount / decomposition.ingredients.length;
  if (matchRatio < 0.5) {
    console.warn(`[decompose] Low match ratio (${matchedCount}/${decomposition.ingredients.length}) for "${input.foodName}" — skipping cache`);
    return null;
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
  const confidence = Math.min(0.85, matchRatio * 0.9);

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
    source: 'local_db', // Deterministic from DB ingredients
  };
}
