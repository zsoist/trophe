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
import { lookupFoodBatch, ragPreSearch, formatRagContext, correctFoodName } from './lookup';
import type { LookupInput } from './lookup';
import { decomposeAndLookup, lookupCachedRecipeAsItem } from './decompose';
import { pick } from '../router';
import { emitGenAISpan, estimateCostUsd } from '../observability/otel';
import { executeAiTask } from '../runtime';
import { invokeStructuredProvider } from '../runtime/providers/structured';
import { foodParseGeminiResponseSchema, foodParseStructuredSchema } from '../schemas/food-parse-structured';
import { macroEstimateGeminiResponseSchema, macroEstimateStructuredSchema } from '../schemas/macro-estimate-structured';

export const FOOD_PARSE_VERSION = 'v4';

// ── Prompt ───────────────────────────────────────────────────────────────────
// v5 prompt adds CoT macro estimation alongside food identification.
// Set FOOD_PARSE_PROMPT_VERSION=v4 to revert to identification-only mode.
const promptVersion = process.env.FOOD_PARSE_PROMPT_VERSION ?? 'v6';
const PROMPT_PATH = join(process.cwd(), `agents/prompts/food-parse.${promptVersion}.md`);
const PROMPT_TEMPLATE = readFileSync(PROMPT_PATH, 'utf-8');
const COT_ENABLED = promptVersion === 'v5' || promptVersion === 'v6';
const PER_100G_ENABLED = promptVersion === 'v6';

// ── V4/V5 LLM output schema ──────────────────────────────────────────────────
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
  // v5 CoT macro estimation fields (present when using v5 prompt)
  estimated_grams?:       number;
  estimated_calories?:    number;
  estimated_protein_g?:   number;
  estimated_carbs_g?:     number;
  estimated_fat_g?:       number;
  nutrition_reasoning?:   string;
  estimation_confidence?: number;
  // v6 per-100g fields (LLM reports per-100g profile, code multiplies)
  per_100g_kcal?:         number;
  per_100g_protein?:      number;
  per_100g_carbs?:        number;
  per_100g_fat?:          number;
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

// ── v5 CoT arbitration ─────────────────────────────────────────────────────
// When the LLM provides CoT macro estimates (v5 prompt), decide whether to
// trust the DB or the LLM. Research (NutriBench ICLR 2025) shows CoT
// estimation beats human dietitians for implicit portions. The DB is still
// authoritative for explicit/measured portions with food-specific conversions.

function hasValidCoTEstimate(c: V4Candidate): boolean {
  return COT_ENABLED &&
    typeof c.estimated_calories === 'number' && c.estimated_calories > 0 &&
    typeof c.estimated_grams === 'number' && c.estimated_grams > 0;
}

/**
 * v6: Check if the LLM provided per-100g nutritional values.
 * When present, we compute totals in code (grams × per_100g / 100) instead
 * of trusting the LLM's multiplication. Research shows LLMs are good at
 * recalling per-100g profiles from training data (USDA) but make arithmetic
 * errors when multiplying by portion size.
 */
function hasValidPer100g(c: V4Candidate): boolean {
  return PER_100G_ENABLED &&
    typeof c.per_100g_kcal === 'number' && c.per_100g_kcal > 0 &&
    typeof c.estimated_grams === 'number' && c.estimated_grams > 0;
}

/**
 * v6: Compute total macros from per-100g values and estimated grams.
 * This is more accurate than the LLM's own multiplication because it
 * eliminates arithmetic errors in the model's chain-of-thought.
 */
function computeFromPer100g(c: V4Candidate): {
  grams: number; calories: number; protein_g: number;
  carbs_g: number; fat_g: number;
} {
  // Clamp portion grams to sane range (10g–15000g).
  // Upper bound supports bulk quantities like "10kg rice" (10000g).
  const g = Math.max(10, Math.min(15000, Math.round(c.estimated_grams!)));
  // Clamp per-100g values to physically possible ranges
  const kcal100 = Math.max(0, Math.min(900, c.per_100g_kcal!));      // pure fat = ~900
  const p100 = Math.max(0, Math.min(85, c.per_100g_protein ?? 0));    // whey isolate ~80-85
  const c100 = Math.max(0, Math.min(100, c.per_100g_carbs ?? 0));     // pure sugar = 100
  const f100 = Math.max(0, Math.min(100, c.per_100g_fat ?? 0));       // pure oil = 100
  return {
    grams: g,
    calories: Math.round(kcal100 * g / 100),
    protein_g: Math.round(p100 * g / 100 * 10) / 10,
    carbs_g: Math.round(c100 * g / 100 * 10) / 10,
    fat_g: Math.round(f100 * g / 100 * 10) / 10,
  };
}

/**
 * v6: Metabolic consistency post-correction.
 * Enforces: calories ≈ protein×4 + carbs×4 + fat×9
 * When the macro-derived energy diverges >20% from stated calories,
 * redistributes macros proportionally to match the stated calories.
 *
 * Also applies sanity bounds:
 * - No food can exceed 9 kcal/g (pure fat is 9 kcal/g)
 * - Protein cannot exceed 90% of grams (even pure protein powder is ~80%)
 * - Fat cannot exceed 100% of grams (pure oil = 100% fat by weight)
 */
function applyMetabolicConsistency(item: ParsedFoodItem): ParsedFoodItem {
  // Sanity bound: density
  if (item.grams > 0 && item.calories / item.grams > 9.5) {
    const maxCal = Math.round(item.grams * 9);
    const scale = maxCal / item.calories;
    item.calories = maxCal;
    item.protein_g = Math.round(item.protein_g * scale * 10) / 10;
    item.carbs_g = Math.round(item.carbs_g * scale * 10) / 10;
    item.fat_g = Math.round(item.fat_g * scale * 10) / 10;
  }

  // Metabolic consistency check
  // Use fiber-adjusted Atwater factors: protein 4, available carbs 4, fiber 2, fat 9.
  // Without this adjustment, high-fiber foods (Quest bars with 25g fiber/100g,
  // spinach, lemons) get their macros corrupted because the naive P×4+C×4+F×9
  // overestimates energy from fiber (4 kcal/g assumed vs ~2 kcal/g actual).
  const fiberG = item.fiber_g ?? 0;
  const computedCal = item.protein_g * 4 + (item.carbs_g - fiberG) * 4 + fiberG * 2 + item.fat_g * 9;
  if (computedCal <= 0 || item.calories <= 0) return item;

  const divergence = Math.abs(computedCal - item.calories) / item.calories;

  // If macros and calories diverge by >30%, redistribute macros to match stated calories
  // (Conservative: only correct extreme inconsistencies to avoid overcorrection)
  if (divergence > 0.30) {
    // Keep the ratio between macros the same, scale to match stated calories
    const scaleFactor = item.calories / computedCal;
    item.protein_g = Math.round(item.protein_g * scaleFactor * 10) / 10;
    item.carbs_g = Math.round(item.carbs_g * scaleFactor * 10) / 10;
    item.fat_g = Math.round(item.fat_g * scaleFactor * 10) / 10;
  }

  return item;
}

interface ArbitrationResult {
  source: 'local_db' | 'llm_cot' | 'hybrid';
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: number;
}

/**
 * Arbitrates between DB-computed macros and LLM CoT estimates.
 *
 * Priority:
 *   1. Explicit portion + food-specific conversion → DB wins (deterministic ≥95% accurate)
 *   2. Both estimates agree within 30%             → DB wins (precise per-100g values)
 *   3. Estimates diverge > 30%                     → LLM grams + DB per-100g ratios (best of both)
 *   4. Only one source available                    → use whatever we have
 *
 * Key insight (NutriBench + DietAI24): LLMs are good at portion estimation (grams)
 * but mediocre at macro breakdown. DBs have precise per-100g values but wrong
 * serving sizes. Combining LLM grams with DB per-100g gives the best accuracy.
 */
function arbitrateDbVsCoT(
  candidate: V4Candidate,
  dbMacros: { kcal: number; protein: number; carb: number; fat: number; fiber?: number },
  dbGrams: number,
  dbSugarPer100g: number,
  dbConfidence: number,
  isExplicitPortion: boolean,
  hasFoodSpecificConversion: boolean,
  /** Per-100g values from the DB food entry, for hybrid macro computation */
  dbPer100g?: { kcal: number; protein: number; carb: number; fat: number; fiber?: number },
  /** The food entry's own macro_confidence (0-1). When ≥0.85, treat DB macros as authoritative
   *  (label data / verified). This protects branded foods even when the portion confidence is low. */
  dbMacroConfidence?: number,
): ArbitrationResult {
  const cotAvailable = hasValidCoTEstimate(candidate);

  // No CoT → DB is our only source (v4 behavior)
  if (!cotAvailable) {
    return {
      source: 'local_db',
      grams: dbGrams,
      calories: dbMacros.kcal,
      protein_g: dbMacros.protein,
      carbs_g: dbMacros.carb,
      fat_g: dbMacros.fat,
      fiber_g: dbMacros.fiber ?? 0,
      sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
      confidence: dbConfidence,
    };
  }

  // v6: When LLM provides per-100g values, compute totals from those (more accurate)
  const per100gAvailable = hasValidPer100g(candidate);
  const per100gComputed = per100gAvailable ? computeFromPer100g(candidate) : null;

  const llmKcal = per100gComputed?.calories ?? candidate.estimated_calories!;
  const llmGrams = candidate.estimated_grams!;

  // Effective trust level: use the HIGHER of retrieval confidence and food's own macro trust.
  // This protects branded foods (macro_confidence=0.95) even when portion isn't perfectly explicit.
  const effectiveDbTrust = Math.max(dbConfidence, dbMacroConfidence ?? 0.7);

  // Rule 1: Explicit portion + food-specific conversion → trust DB for grams+calories.
  // But v6: if LLM per-100g macro ratios significantly diverge from DB, use LLM's
  // macro distribution (the DB might have imported wrong macro ratios).
  if (isExplicitPortion && hasFoodSpecificConversion) {
    // v6 macro ratio correction for Rule 1 (skip for high-confidence branded DB matches)
    if (per100gAvailable && dbPer100g && dbPer100g.kcal > 0 && effectiveDbTrust < 0.85) {
      const llmP100 = candidate.per_100g_protein ?? 0;
      const llmC100 = candidate.per_100g_carbs ?? 0;
      const llmF100 = candidate.per_100g_fat ?? 0;
      const macroDiv = (a: number, b: number) => Math.abs(a - b) / Math.max(a, b, 0.1);
      if (macroDiv(llmP100, dbPer100g.protein) > 0.30 ||
          macroDiv(llmC100, dbPer100g.carb) > 0.30 ||
          macroDiv(llmF100, dbPer100g.fat) > 0.30) {
        const rawLlmCal = candidate.per_100g_kcal! * dbGrams / 100;
        const calScale = rawLlmCal > 0 ? dbMacros.kcal / rawLlmCal : 1;
        return {
          source: 'hybrid' as const,
          grams: dbGrams,
          calories: dbMacros.kcal,
          protein_g: Math.round(llmP100 * dbGrams / 100 * calScale * 10) / 10,
          carbs_g: Math.round(llmC100 * dbGrams / 100 * calScale * 10) / 10,
          fat_g: Math.round(llmF100 * dbGrams / 100 * calScale * 10) / 10,
          fiber_g: dbMacros.fiber ?? 0,
          sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
          confidence: 0.90,
        };
      }
    }
    return {
      source: 'local_db',
      grams: dbGrams,
      calories: dbMacros.kcal,
      protein_g: dbMacros.protein,
      carbs_g: dbMacros.carb,
      fat_g: dbMacros.fat,
      fiber_g: dbMacros.fiber ?? 0,
      sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
      confidence: 0.95,
    };
  }

  // Compute divergence between DB and LLM calorie estimates
  const center = Math.max((dbMacros.kcal + llmKcal) / 2, 1);
  const divergence = Math.abs(dbMacros.kcal - llmKcal) / center;

  // Rule 2: Estimates agree within 30% → trust DB for calories, but check macro ratios
  if (divergence < 0.30) {
    // Rule 2b (v6): When LLM has per-100g values, compare macro distributions.
    // DB can have correct calories but wrong macro ratios (e.g., halloumi:
    // DB says 21g prot/100g but USDA/actual is 25g). If LLM's per-100g macro
    // ratios diverge >25% from DB's per-100g on ANY individual macro, use
    // the LLM's macro distribution scaled to the DB's calorie total.
    // This gives us: DB's accurate calories + LLM's accurate macro ratios.
    //
    // v7 EXCEPTION: When DB confidence is high (≥0.85), the DB match is strong
    // (branded foods, exact USDA matches). In those cases the DB per-100g values
    // are authoritative (label data) and the LLM's divergence is noise from
    // generic training data. Skip the hybrid override — trust DB macros entirely.
    if (per100gAvailable && dbPer100g && dbPer100g.kcal > 0 && effectiveDbTrust < 0.85) {
      const llmP100 = candidate.per_100g_protein ?? 0;
      const llmC100 = candidate.per_100g_carbs ?? 0;
      const llmF100 = candidate.per_100g_fat ?? 0;
      const dbP100 = dbPer100g.protein;
      const dbC100 = dbPer100g.carb;
      const dbF100 = dbPer100g.fat;

      // Check if any individual macro diverges >25% between LLM and DB per-100g
      const macroDiv = (a: number, b: number) => {
        const mx = Math.max(a, b, 0.1);
        return Math.abs(a - b) / mx;
      };
      const pDiv = macroDiv(llmP100, dbP100);
      const cDiv = macroDiv(llmC100, dbC100);
      const fDiv = macroDiv(llmF100, dbF100);

      if (pDiv > 0.25 || cDiv > 0.25 || fDiv > 0.25) {
        // Use LLM's per-100g macro ratios × DB grams, then scale to match DB calories
        const rawLlmCal = candidate.per_100g_kcal! * dbGrams / 100;
        const calScale = rawLlmCal > 0 ? dbMacros.kcal / rawLlmCal : 1;
        return {
          source: 'hybrid' as const,
          grams: dbGrams,
          calories: dbMacros.kcal, // keep DB calories (they agree with LLM)
          protein_g: Math.round(llmP100 * dbGrams / 100 * calScale * 10) / 10,
          carbs_g: Math.round(llmC100 * dbGrams / 100 * calScale * 10) / 10,
          fat_g: Math.round(llmF100 * dbGrams / 100 * calScale * 10) / 10,
          fiber_g: dbMacros.fiber ?? 0,
          sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
          confidence: Math.min(dbConfidence + 0.05, 0.90), // slightly lower than pure DB agreement
        };
      }
    }

    return {
      source: 'local_db',
      grams: dbGrams,
      calories: dbMacros.kcal,
      protein_g: dbMacros.protein,
      carbs_g: dbMacros.carb,
      fat_g: dbMacros.fat,
      fiber_g: dbMacros.fiber ?? 0,
      sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
      confidence: Math.min(dbConfidence + 0.1, 0.95), // agreement boost
    };
  }

  // Rule 3: Major divergence (>30%) — DB portion is likely wrong.
  // Use LLM's grams estimate + DB's per-100g values = best of both worlds.
  // LLM knows "1 souvlaki pita = 300g", DB knows "chicken per 100g = 31g protein".
  const llmConfidence = candidate.estimation_confidence ?? 0.6;
  const g = Math.round(llmGrams);

  if (llmConfidence >= 0.5) {
    // Hybrid: LLM grams + DB per-100g ratios (when available)
    if (dbPer100g && dbPer100g.kcal > 0) {
      return {
        source: 'llm_cot',
        grams: g,
        calories: Math.round(dbPer100g.kcal * g / 100),
        protein_g: Math.round(dbPer100g.protein * g / 100 * 10) / 10,
        carbs_g: Math.round(dbPer100g.carb * g / 100 * 10) / 10,
        fat_g: Math.round(dbPer100g.fat * g / 100 * 10) / 10,
        fiber_g: Math.round((dbPer100g.fiber ?? 0) * g / 100 * 10) / 10,
        sugar_g: Math.round(dbSugarPer100g * g / 100 * 10) / 10,
        confidence: Math.min(llmConfidence, 0.80),
      };
    }

    // No DB per-100g available — prefer LLM's per-100g computed values, else raw estimates
    const llmMacros = per100gComputed ?? {
      calories: Math.round(llmKcal),
      protein_g: Math.round((candidate.estimated_protein_g ?? 0) * 10) / 10,
      carbs_g: Math.round((candidate.estimated_carbs_g ?? 0) * 10) / 10,
      fat_g: Math.round((candidate.estimated_fat_g ?? 0) * 10) / 10,
    };
    return {
      source: 'llm_cot',
      grams: g,
      calories: llmMacros.calories,
      protein_g: llmMacros.protein_g,
      carbs_g: llmMacros.carbs_g,
      fat_g: llmMacros.fat_g,
      fiber_g: 0,
      sugar_g: 0,
      confidence: Math.min(llmConfidence, 0.75),
    };
  }

  // Both uncertain — weighted blend using DB per-100g at LLM-blended grams
  const w = 0.6;
  const blendedGrams = Math.round(dbGrams * (1 - w) + llmGrams * w);
  if (dbPer100g && dbPer100g.kcal > 0) {
    return {
      source: 'hybrid',
      grams: blendedGrams,
      calories: Math.round(dbPer100g.kcal * blendedGrams / 100),
      protein_g: Math.round(dbPer100g.protein * blendedGrams / 100 * 10) / 10,
      carbs_g: Math.round(dbPer100g.carb * blendedGrams / 100 * 10) / 10,
      fat_g: Math.round(dbPer100g.fat * blendedGrams / 100 * 10) / 10,
      fiber_g: Math.round((dbPer100g.fiber ?? 0) * blendedGrams / 100 * 10) / 10,
      sugar_g: Math.round(dbSugarPer100g * blendedGrams / 100 * 10) / 10,
      confidence: 0.60,
    };
  }

  return {
    source: 'hybrid',
    grams: blendedGrams,
    calories: Math.round(dbMacros.kcal * (1 - w) + llmKcal * w),
    protein_g: Math.round((dbMacros.protein * (1 - w) + (candidate.estimated_protein_g ?? dbMacros.protein) * w) * 10) / 10,
    carbs_g: Math.round((dbMacros.carb * (1 - w) + (candidate.estimated_carbs_g ?? dbMacros.carb) * w) * 10) / 10,
    fat_g: Math.round((dbMacros.fat * (1 - w) + (candidate.estimated_fat_g ?? dbMacros.fat) * w) * 10) / 10,
    fiber_g: dbMacros.fiber ?? 0,
    sugar_g: Math.round(dbSugarPer100g * dbGrams / 100 * 10) / 10,
    confidence: 0.60,
  };
}

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

// ── Food type classification ─────────────────────────────────────────────────
export type FoodType = 'base' | 'composite' | 'branded' | 'beverage';

const COMPOSITE_CONNECTORS = /\b(with|and|con|y|e|más|med|met|με|και|served\s+with|topped\s+with|stuffed\s+with)\b/i;
const COMPOSITE_INDICATORS = /\b(sandwich|wrap|bowl|plate|platter|combo|burrito|taco|pizza|quesadilla|salad|stew|soup|curry|risotto|pasta\s+\w+|rice\s+\w+|bandeja|arepa\s+con|empanada\s+de|souvlaki\s+pita|gyros\s+pita)\b/i;
const BRANDED_TOKENS = /\b(mcdonald|starbucks|subway|burger\s*king|wendy|chipotle|taco\s*bell|kfc|dunkin|pizza\s*hut|domino|panda\s*express|chick[\s-]*fil|big\s*mac|whopper|mcnugget|frappuccino|mcflurry)\b/i;
const BEVERAGE_TOKENS = /\b(juice|smoothie|coffee|espresso|latte|cappuccino|americano|tea|milk|chocolate\s*milk|water|soda|beer|wine|cocktail|shake|frappé|frappe|milkshake|χυμός|καφέ|τσάι|γάλα|jugo|café|cerveza|vino|refresco)\b/i;

/**
 * Heuristic food type classifier.
 * - 'composite': Multi-ingredient dishes that should be decomposed, not looked up as a single food
 * - 'branded': Fast-food / branded items (may need special handling)
 * - 'beverage': Drinks (usually base items but benefit from liquid-serving defaults)
 * - 'base': Everything else — single ingredients or simple foods
 *
 * The key insight: "yogurt with honey and walnuts" is composite (3 ingredients),
 * while "Greek yogurt" is base (adjective + food). We distinguish by checking for
 * CONNECTORS between food-like words, not just multi-word names.
 */
export function classifyFoodType(foodName: string): FoodType {
  const name = foodName.toLowerCase().trim();

  // Branded check first — overrides everything
  if (BRANDED_TOKENS.test(name)) return 'branded';

  // Beverage check
  if (BEVERAGE_TOKENS.test(name)) return 'beverage';

  // Composite indicators — known multi-ingredient dish patterns
  if (COMPOSITE_INDICATORS.test(name)) return 'composite';

  // Connector-based composite detection:
  // "chicken with rice" → composite, "chicken breast" → base
  if (COMPOSITE_CONNECTORS.test(name)) {
    // But "chicken and rice" is composite while "salt and pepper" is arguably base.
    // Split on connector, check if both sides have 1+ meaningful food word.
    const parts = name.split(COMPOSITE_CONNECTORS).filter(p => p.trim().length >= 3);
    if (parts.length >= 2) return 'composite';
  }

  return 'base';
}

const CLEARLY_NON_FOOD_PATTERNS = [
  /<\s*script\b/i,
  /\b(drop|alter|truncate|delete)\s+table\b/i,
  /\b(gasoline|petrol|diesel|bleach|detergent)\b/i,
  /\bunicorn\b/i,
  /\bdragon\s+(sauce|steak|meat)\b/i,
];

export function shouldRejectAsNonFood(text: string): boolean {
  const normalized = text.trim();
  if (CLEARLY_NON_FOOD_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (/^asdf[a-z]*$/i.test(normalized)) return true;
  if (/^-\s*\d/.test(normalized)) return true;
  if (/^\d{5,}\s+calories?\s+worth\b/i.test(normalized)) return true;
  return normalized.length === 1;
}

/**
 * Detect vague / underspecified inputs that need clarification.
 * These are inputs that name a meal occasion or category rather than a specific food:
 * "lunch", "σνακ" (snack), "dinner", "ate some food", "something sweet".
 * They are NOT non-food (user is talking about food), but we can't parse macros.
 */
const VAGUE_MEAL_WORDS = new Set([
  // English
  'breakfast', 'lunch', 'dinner', 'supper', 'snack', 'meal', 'food',
  'brunch', 'dessert', 'appetizer', 'starter', 'entree', 'side',
  // Greek
  'σνακ', 'γεύμα', 'μεσημεριανό', 'βραδινό', 'πρωινό', 'δείπνο',
  'πρόγευμα', 'κολατσιό', 'επιδόρπιο',
  // Spanish
  'almuerzo', 'cena', 'desayuno', 'merienda', 'comida', 'postre',
  'aperitivo', 'tentempié',
]);

const VAGUE_PHRASES = [
  /^(ate|had|eaten?|comí|me\s+comí|έφαγα)\s+(something|a\s+little|a\s+bit|some)/i,
  /^(a\s+little\s+bit\s+of|some)\s+(something|food)/i,
  /^something\s+(sweet|salty|savory|light|heavy|small|quick)/i,
  /^(κάτι|algo)\s+/i,
];

const VAGUE_MODIFIERS = new Set([
  'a', 'an', 'my', 'the', 'some', 'un', 'una', 'el', 'la', 'mi', 'tu',
  'ένα', 'μία', 'το', 'η', 'ο', 'μου', 'light', 'quick', 'small', 'big',
  'heavy', 'late', 'early',
]);

/** Stop-words and vague adjectives that don't indicate specific food */
const VAGUE_FILLER = new Set([
  'and', 'with', 'for', 'of', 'or', 'at', 'bit',
  'y', 'con', 'para', 'de', 'o', 'en',
  'και', 'με', 'για', 'ή',
  'something', 'food', 'stuff', 'things',
  'sweet', 'salty', 'savory', 'light', 'heavy', 'small', 'quick', 'nice', 'good',
  'dulce', 'salado', 'rico', 'ligero', 'pesado', 'rápido', 'bueno',
  'γλυκό', 'αλμυρό', 'ελαφρύ', 'βαρύ', 'νόστιμο',
]);

export function shouldRequestClarification(text: string): boolean {
  const normalized = text.trim().toLowerCase();
  const words = normalized.split(/\s+/);

  // Single vague word: "lunch", "σνακ", "dinner"
  if (words.length === 1 && VAGUE_MEAL_WORDS.has(normalized)) return true;

  // Two-word vague: "my lunch", "a snack", "el almuerzo"
  // Only if the non-vague word is a modifier (not a food word like "meat", "salad")
  if (words.length === 2 && words.some(w => VAGUE_MEAL_WORDS.has(w)) &&
      words.some(w => VAGUE_MODIFIERS.has(w))) return true;

  // Vague phrase patterns — only vague if no specific food words follow the prefix
  for (const pattern of VAGUE_PHRASES) {
    const match = normalized.match(pattern);
    if (match) {
      const remainder = normalized.slice(match[0].length).trim();
      if (!remainder) return true;
      // Filter out modifiers, meal words, and vague fillers
      const substantive = remainder.split(/\s+/).filter(w =>
        !VAGUE_MODIFIERS.has(w) && !VAGUE_MEAL_WORDS.has(w) && !VAGUE_FILLER.has(w)
      );
      // No substantive words after vague prefix → truly vague
      if (substantive.length === 0) return true;
      // Specific food words follow → not vague (e.g. "had some frijoles and rice")
      return false;
    }
  }

  return false;
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
      invoke: ({ policy: selected, signal }) => invokeStructuredProvider({
        policy: selected,
        signal,
        system: MACRO_ESTIMATE_PROMPT,
        prompt: userMessage,
        schema: macroEstimateGeminiResponseSchema,
        validator: macroEstimateStructuredSchema,
        toolName: 'submit_macro_estimates',
        toolDescription: 'Submit conservative macro estimates for food items',
        strict: false,
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

  if (shouldRejectAsNonFood(sanitizedText)) {
    return {
      ok: true,
      output: {
        items: [],
        needs_clarification: true,
        clarification_question: clarificationQuestion(language),
      },
      telemetry: emptyTelemetry,
    };
  }

  // ── Zero-quantity detection ─────────────────────────────────────────────────
  // "0 eggs", "0 cups of rice" → return ok with 0 macros instead of failing
  const zeroQuantityMatch = sanitizedText.match(/^0+(?:\s+|\s*x\s*)/i);
  if (zeroQuantityMatch && sanitizedText.length < 60) {
    return {
      ok: true,
      output: {
        items: [],
        needs_clarification: false,
        clarification_question: null,
      },
      telemetry: emptyTelemetry,
    };
  }

  // ── Vague / underspecified input detection ──────────────────────────────────
  // Single-word meal names ("lunch", "σνακ", "dinner") or short vague phrases
  // ("ate some food", "something sweet") → ask for clarification
  if (shouldRequestClarification(sanitizedText)) {
    return {
      ok: true,
      output: {
        items: [],
        needs_clarification: true,
        clarification_question: clarificationQuestion(language),
      },
      telemetry: emptyTelemetry,
    };
  }

  // ── Step 0: RAG pre-search — give the LLM DB reference data ───────────────
  // Only inject RAG for simple (non-composite) inputs.
  // Composite/multi-item inputs get confused when RAG returns a single-ingredient match.
  const looksComposite = /[,;+]|( and | with | con | και | y | met )/.test(sanitizedText.toLowerCase());
  const ragMatches = looksComposite ? [] : await ragPreSearch(sanitizedText);
  const ragContext = formatRagContext(ragMatches);

  const userMessage = `Parse this food input (language: ${language}):\n\n"${sanitizedText}"${ragContext}`;

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
      invoke: ({ policy: selected, signal }) => invokeStructuredProvider({
        policy: selected,
        signal,
        system: PROMPT_TEMPLATE,
        prompt: userMessage,
        schema: foodParseGeminiResponseSchema,
        validator: foodParseStructuredSchema,
        toolName: 'submit_food_parse',
        toolDescription: 'Submit parsed food items and clarification state',
        strict: false,
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
        invoke: ({ policy: selected, signal }) => invokeStructuredProvider({
          policy: selected,
          signal,
          system: PROMPT_TEMPLATE,
          prompt: `${userMessage}\n\nReturn only valid JSON matching the required schema.`,
          schema: foodParseGeminiResponseSchema,
          validator: foodParseStructuredSchema,
          toolName: 'submit_food_parse',
          toolDescription: 'Submit parsed food items and clarification state',
          strict: false,
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

  // ── Step 1a2: Single-word input override ──────────────────────────────────
  // When the user types a single word like "chicken", the LLM sometimes
  // over-interprets it as a composite dish (e.g. "gyros chicken").
  // If a FOOD_NAME_CORRECTIONS entry exists for the raw input word,
  // override the LLM's food_name to use the corrected form. This ensures
  // "chicken" → "chicken breast grilled" rather than "gyros chicken".
  const rawTokens = sanitizedText.trim().split(/\s+/).filter(Boolean);
  if (rawTokens.length === 1 && v4Parsed.items.length === 1) {
    const singleWord = rawTokens[0].toLowerCase();
    const corrected = correctFoodName(singleWord);
    if (corrected !== singleWord) {
      v4Parsed.items[0].food_name = corrected;
    }
  }

  // ── Step 1b: Adversarial repetition detection ─────────────────────────────
  // "bread bread bread bread..." is a single food repeated, NOT n servings.
  // Detect dominant-word repetition in the raw USER input (NOT userMessage which
  // includes prompt prefix + RAG context that dilute the word frequency).
  const inputWords = sanitizedText.toLowerCase().replace(/[^a-zα-ωά-ώ\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (inputWords.length >= 5) {
    const wordFreq = new Map<string, number>();
    for (const w of inputWords) wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    const dominant = [...wordFreq.entries()].sort((a, b) => b[1] - a[1])[0];
    // If one word makes up ≥70% of the input and appears ≥5 times → repetition spam
    if (dominant && dominant[1] >= 5 && dominant[1] / inputWords.length >= 0.7) {
      // Override to single item with quantity=1 and flag clarification.
      // Use 'piece' (not 'serving') so COMMON_PIECE_WEIGHTS resolves to a
      // sensible single-unit weight (bread=30g, egg=50g) instead of the
      // universal 100g fallback that 'serving' triggers.
      // Clear LLM gram/calorie estimates so Rule 3 doesn't use the inflated values.
      v4Parsed.items = [{
        ...v4Parsed.items[0],
        food_name: dominant[0],
        quantity: 1,
        unit: 'piece',
        portion_explicit: false,
        estimated_grams: undefined,
        estimated_calories: undefined,
        estimated_protein_g: undefined,
        estimated_carbs_g: undefined,
        estimated_fat_g: undefined,
        per_100g_kcal: undefined,
        per_100g_protein: undefined,
        per_100g_carbs: undefined,
        per_100g_fat: undefined,
        estimation_confidence: undefined,
      }];
      v4Parsed.needs_clarification = true;
      v4Parsed.clarification_question = `Did you mean 1 ${dominant[0]} or ${dominant[1]}?`;
    }
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

  // ── Step 2b: Classify food types and route composites to decompose ────────
  // Composites that miss recipe cache should skip single-food DB lookup and go
  // directly to decomposeAndLookup — prevents "chicken souvlaki pita" matching "chicken".
  const foodTypes = v4Parsed.items.map(item => classifyFoodType(item.food_name));
  const compositeDecompResults: Array<ParsedFoodItem | null> = v4Parsed.items.map(() => null);
  const regionCode = language === 'el' ? 'GR' : language === 'es' ? 'CO' : 'US';

  for (let i = 0; i < v4Parsed.items.length; i++) {
    if (recipeResults[i] !== null) continue; // already resolved via recipe cache
    if (foodTypes[i] !== 'composite') continue; // only route composites

    const item = v4Parsed.items[i];
    const decomposed = await decomposeAndLookup({
      foodName: item.food_name,
      nameLocalized: item.name_localized,
      quantity: item.quantity,
      unit: item.unit,
      rawText: item.raw_text,
      region: regionCode,
    });
    compositeDecompResults[i] = decomposed; // null means decompose failed → fall through to lookup
  }

  // Look up all items that didn't hit the recipe cache.
  // We ALSO look up composites because a direct DB match (e.g. branded "FAGE Total 2%
  // Greek Yogurt with Honey") should override decomposition into generic components.
  // The priority logic in Step 3 prefers direct DB matches over decomposition results.
  const nonCachedIndices: number[] = [];
  const lookupInputs: LookupInput[] = [];
  for (let i = 0; i < v4Parsed.items.length; i++) {
    if (recipeResults[i] !== null) continue; // recipe cache hit, skip
    nonCachedIndices.push(i);
    lookupInputs.push({
      foodName:  v4Parsed.items[i].food_name,
      unit:      v4Parsed.items[i].unit,
      qualifier: v4Parsed.items[i].qualifier ?? undefined,
      region:    regionCode,
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
    const compositeHit = compositeDecompResults[i];
    const lookup = expandedLookupResults[i];

    // Priority 1: dish_recipes cache hit (composite dish with pre-computed macros)
    // v5/v6: Check CoT estimate before blindly trusting cached portion data.
    // For recipes (multi-ingredient), use LLM CoT macros when divergent —
    // scaling recipe macros proportionally breaks because the per-100g profile
    // changes with ingredient composition (60g bread ≠ 300g full wrap).
    // v6: prefer per-100g computed values over raw LLM totals.
    if (recipeHit) {
      telemetry.dbHits++;
      if (hasValidCoTEstimate(candidate)) {
        const dbKcal = recipeHit.calories;
        // v6: compute calories from per-100g if available, else use raw LLM estimate
        const per100gComputed = hasValidPer100g(candidate) ? computeFromPer100g(candidate) : null;
        const llmKcal = per100gComputed?.calories ?? candidate.estimated_calories!;
        const center = Math.max((dbKcal + llmKcal) / 2, 1);
        const divergence = Math.abs(dbKcal - llmKcal) / center;

        if (divergence > 0.30 && (candidate.estimation_confidence ?? 0.5) >= 0.5) {
          const macros = per100gComputed ?? {
            grams: Math.round(candidate.estimated_grams!),
            calories: Math.round(candidate.estimated_calories!),
            protein_g: Math.round((candidate.estimated_protein_g ?? recipeHit.protein_g) * 10) / 10,
            carbs_g: Math.round((candidate.estimated_carbs_g ?? recipeHit.carbs_g) * 10) / 10,
            fat_g: Math.round((candidate.estimated_fat_g ?? recipeHit.fat_g) * 10) / 10,
          };
          finalItems.push({
            ...recipeHit,
            grams:      macros.grams,
            calories:   macros.calories,
            protein_g:  macros.protein_g,
            carbs_g:    macros.carbs_g,
            fat_g:      macros.fat_g,
            confidence: Math.min(candidate.estimation_confidence ?? 0.6, 0.75),
            source:     'llm_cot',
          });
          continue;
        }
      }
      finalItems.push(recipeHit);
      continue;
    }

    // Priority 1b: composite decomposition hit (classified as composite, decomposed successfully)
    // v5/v6: Same CoT arbitration — prefer per-100g computed values for composites
    // v7 EXCEPTION: When a direct DB lookup also exists (branded foods like "FAGE Total 2%
    // with honey"), prefer the direct match — decomposition splits branded items into
    // generic components and loses the accurate label data.
    if (compositeHit && !lookup) {
      telemetry.dbHits++;
      if (hasValidCoTEstimate(candidate)) {
        const dbKcal = compositeHit.calories;
        const per100gComputed = hasValidPer100g(candidate) ? computeFromPer100g(candidate) : null;
        const llmKcal = per100gComputed?.calories ?? candidate.estimated_calories!;
        const center = Math.max((dbKcal + llmKcal) / 2, 1);
        const divergence = Math.abs(dbKcal - llmKcal) / center;

        if (divergence > 0.30 && (candidate.estimation_confidence ?? 0.5) >= 0.5) {
          const macros = per100gComputed ?? {
            grams: Math.round(candidate.estimated_grams!),
            calories: Math.round(candidate.estimated_calories!),
            protein_g: Math.round((candidate.estimated_protein_g ?? compositeHit.protein_g) * 10) / 10,
            carbs_g: Math.round((candidate.estimated_carbs_g ?? compositeHit.carbs_g) * 10) / 10,
            fat_g: Math.round((candidate.estimated_fat_g ?? compositeHit.fat_g) * 10) / 10,
          };
          finalItems.push({
            ...compositeHit,
            grams:      macros.grams,
            calories:   macros.calories,
            protein_g:  macros.protein_g,
            carbs_g:    macros.carbs_g,
            fat_g:      macros.fat_g,
            confidence: Math.min(candidate.estimation_confidence ?? 0.6, 0.75),
            source:     'llm_cot',
          });
          continue;
        }
      }
      finalItems.push(compositeHit);
      continue;
    }

    if (lookup) {
      // DB hit — arbitrate between DB macros and LLM CoT estimate (v5)
      telemetry.dbHits++;
      const macros = lookup.macros(candidate.quantity);
      const isExplicitPortion = candidate.portion_explicit === true;
      const hasFoodSpecificConversion = lookup.conversionId !== null;

      // Calibrated confidence by source chain (baseline for arbitration):
      let calibratedConfidence: number;
      if (isExplicitPortion && hasFoodSpecificConversion) calibratedConfidence = 0.95;
      else if (isExplicitPortion) calibratedConfidence = 0.85;
      else if (hasFoodSpecificConversion) calibratedConfidence = 0.75;
      else calibratedConfidence = 0.55;

      // v5: Arbitrate between DB and LLM CoT estimates
      const arb = arbitrateDbVsCoT(
        candidate,
        { ...macros, fiber: macros.fiber ?? 0 },
        lookup.gramsTotal(candidate.quantity),
        lookup.food.sugarPer100g ?? 0,
        calibratedConfidence,
        isExplicitPortion,
        hasFoodSpecificConversion,
        // Pass DB per-100g values so Rule 3 can use LLM grams + DB ratios
        {
          kcal: lookup.food.kcalPer100g,
          protein: lookup.food.proteinPer100g,
          carb: lookup.food.carbPer100g,
          fat: lookup.food.fatPer100g,
          fiber: lookup.food.fiberPer100g ?? undefined,
        },
        // Pass the food's own macro_confidence so branded foods (0.95) skip hybrid override
        lookup.food.macroConfidence,
      );

      finalItems.push({
        raw_text:       candidate.raw_text,
        food_name:      lookup.food.nameEn,
        name_localized: candidate.name_localized,
        quantity:       candidate.quantity,
        unit:           candidate.unit,
        grams:          arb.grams,
        calories:       arb.calories,
        protein_g:      arb.protein_g,
        carbs_g:        arb.carbs_g,
        fat_g:          arb.fat_g,
        fiber_g:        arb.fiber_g,
        sugar_g:        arb.sugar_g,
        confidence:     arb.confidence,
        source:         arb.source,
        food_state:     candidate.food_state as ParsedFoodItem['food_state'],
        portion_explicit: candidate.portion_explicit,
      });
    } else {
      // DB miss — v5 CoT estimate takes priority, then legacy fallback chain
      telemetry.dbMisses++;

      // v5/v6: If CoT estimate is available, use it directly (no need for legacy chain)
      // v6: prefer per-100g computed values — eliminates LLM multiplication errors
      if (hasValidCoTEstimate(candidate)) {
        const per100gComputed = hasValidPer100g(candidate) ? computeFromPer100g(candidate) : null;
        finalItems.push({
          raw_text:       candidate.raw_text,
          food_name:      candidate.food_name,
          name_localized: candidate.name_localized,
          quantity:       candidate.quantity,
          unit:           candidate.unit,
          grams:          per100gComputed?.grams ?? Math.round(candidate.estimated_grams!),
          calories:       per100gComputed?.calories ?? Math.round(candidate.estimated_calories!),
          protein_g:      per100gComputed?.protein_g ?? Math.round((candidate.estimated_protein_g ?? 0) * 10) / 10,
          carbs_g:        per100gComputed?.carbs_g ?? Math.round((candidate.estimated_carbs_g ?? 0) * 10) / 10,
          fat_g:          per100gComputed?.fat_g ?? Math.round((candidate.estimated_fat_g ?? 0) * 10) / 10,
          fiber_g:        0,
          sugar_g:        0,
          confidence:     Math.min(candidate.estimation_confidence ?? 0.6, 0.70),
          source:         'llm_cot',
          food_state:     candidate.food_state as ParsedFoodItem['food_state'],
          portion_explicit: candidate.portion_explicit,
        });
        continue;
      }

      // Legacy fallback chain (v4 behavior when no CoT available)
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
    item.grams > 15_000 ||
    item.calories < 0 ||
    item.calories > 15_000 ||
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

  // ── Step 3c: Metabolic consistency (BEFORE plausibility cap) ──────────────
  // Enforce: calories ≈ protein×4 + carbs×4 + fat×9
  // Runs BEFORE the meal-level plausibility cap to avoid double-correction:
  // if we cap first (scaling macros proportionally with rounding), then
  // metabolic consistency sees rounding-induced divergence and re-scales.
  for (let i = 0; i < finalItems.length; i++) {
    finalItems[i] = applyMetabolicConsistency(finalItems[i]);
  }

  // ── Step 4: Meal-level plausibility pass ──────────────────────────────────
  // If total meal kcal is implausibly high AND most items have implicit portions,
  // it's likely over-portioned (e.g. "yogurt honey walnuts" → 3 full servings
  // instead of 1 bowl). Scale down proportionally.
  const totalMealKcal = finalItems.reduce((sum, item) => sum + item.calories, 0);
  const implicitItems = finalItems.filter(item => item.portion_explicit === false);
  const MEAL_KCAL_CAP = 1500;
  const SINGLE_ITEM_KCAL_CAP = 1200;

  let plausibilityFlag = false;

  if (totalMealKcal > MEAL_KCAL_CAP && implicitItems.length >= 3) {
    // 3+ implicit-portion items totaling > 1500 kcal — scale down
    const scaleFactor = MEAL_KCAL_CAP / totalMealKcal;
    for (const item of finalItems) {
      if (item.portion_explicit === false) {
        item.grams = Math.round(item.grams * scaleFactor);
        item.calories = Math.round(item.calories * scaleFactor * 10) / 10;
        item.protein_g = Math.round(item.protein_g * scaleFactor * 10) / 10;
        item.carbs_g = Math.round(item.carbs_g * scaleFactor * 10) / 10;
        item.fat_g = Math.round(item.fat_g * scaleFactor * 10) / 10;
        item.fiber_g = Math.round(item.fiber_g * scaleFactor * 10) / 10;
        item.sugar_g = Math.round(item.sugar_g * scaleFactor * 10) / 10;
        item.confidence = Math.min(item.confidence, 0.55);
      }
    }
    plausibilityFlag = true;
  } else {
    // Check individual items: single item > 1200 kcal with implicit portion
    for (const item of finalItems) {
      if (item.portion_explicit === false && item.calories > SINGLE_ITEM_KCAL_CAP) {
        plausibilityFlag = true;
        item.confidence = Math.min(item.confidence, 0.45);
      }
    }
  }

  const deterministicClarification = requiresPortionClarification(v4Parsed.items) || plausibilityFlag;
  if (deterministicClarification) {
    for (const item of finalItems) {
      if (item.portion_explicit === false) item.confidence = Math.min(item.confidence, 0.65);
    }
  }

  // ── Step 5: Range-based portions for implicit items ─────────────────────
  // When portion_explicit=false, add a {min, center, max} calorie range
  // to give the UI a spread for the user to refine.
  for (const item of finalItems) {
    if (item.portion_explicit === false) {
      item.calories_range = {
        min: Math.round(item.calories * 0.7 * 10) / 10,
        center: item.calories,
        max: Math.round(item.calories * 1.4 * 10) / 10,
      };
    }
  }

  // (Metabolic consistency already applied in Step 3c — before plausibility cap)

  // ── Step 6: Build warnings ──────────────────────────────────────────────
  const warnings: string[] = [];
  const anyImplicit = finalItems.some(item => item.portion_explicit === false);
  const recalcTotalKcal = finalItems.reduce((sum, item) => sum + item.calories, 0);
  const totalGrams = finalItems.reduce((sum, item) => sum + (item.grams ?? 0), 0);

  // Flag absurd quantities — likely a joke, typo, or bulk entry
  // Two tiers: >5kg always absurd, >2kg with implicit portions is suspicious
  const absurdQuantity = totalGrams > 5000 ||
    (totalGrams > 2000 && anyImplicit) ||
    (recalcTotalKcal > 2500 && anyImplicit);
  if (absurdQuantity) {
    warnings.push(`Unusually large quantity (${Math.round(totalGrams)}g / ${Math.round(recalcTotalKcal)} kcal) — please confirm`);
  }

  if (anyImplicit) {
    warnings.push('Portions estimated — confirm before saving');
  }
  if (recalcTotalKcal > 1500 && anyImplicit) {
    warnings.push(`High-calorie meal detected (${Math.round(recalcTotalKcal)} kcal) — portions may be overestimated`);
  }

  return {
    ok: true,
    output: {
      items: finalItems,
      needs_clarification: llmResult.output.needs_clarification || deterministicClarification || absurdQuantity,
      clarification_question: llmResult.output.clarification_question ??
        (deterministicClarification ? clarificationQuestion(language) : null),
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    telemetry: { ...telemetry, dbHits: telemetry.dbHits, dbMisses: telemetry.dbMisses },
  };
}
