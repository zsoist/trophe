/**
 * Raw↔cooked yield factors + household-portion heuristics.
 *
 * Frontier-research artifact (docs/benchmark/frontier-research-2026-06-13.md):
 * primary sources are the USDA Table of Cooking Yields for Meat & Poultry (2012),
 * the FAO/Bognár weight-yield + retention tables, and the Precision Nutrition
 * hand-portion system. Macros are ~conserved when cooking (retention 0.90–1.00,
 * default 1.0); the dominant correction is the WEIGHT yield, plus explicit
 * fat-uptake for fried/breaded foods.
 *
 * NOTE (regression-aware): this module is intentionally standalone. A prior
 * "aggressive hidden-fat prompt" regressed fat-MAPE and was reverted, and the
 * food-parse pipeline already runs Atwater reconciliation + plausibility caps.
 * So wiring these factors into the live pipeline MUST pass the benchmark A/B
 * gate (run v2/v3 before+after, keep only on improvement) — do not enable blind.
 * Today this powers DB seeding (raw entry → cooked portion) and is the reference
 * for Michael's portion heuristics.
 */

export type YieldCategory =
  | 'meat_red' | 'meat_poultry' | 'fish_seafood' | 'egg'
  | 'grain_rice' | 'grain_pasta' | 'legume_dry' | 'vegetable';

/** Cooking method affects yield more than the food for meats. */
export type CookMethod = 'roast' | 'grill' | 'fry' | 'braise' | 'boil' | 'steam' | 'bake' | 'default';

/**
 * cooked_weight = raw_weight × factor.  (>1 means the food absorbs water.)
 * For dry grains/legumes the factor is the dry→cooked multiplier.
 */
export const YIELD_FACTORS: Record<YieldCategory, Partial<Record<CookMethod, number>> & { default: number }> = {
  // Meat: roast/grill/fry ~0.70–0.75; braise/boil ~0.62–0.65 (USDA 2012 + FAO).
  meat_red:     { roast: 0.75, grill: 0.70, fry: 0.72, braise: 0.63, boil: 0.60, default: 0.72 },
  meat_poultry: { roast: 0.78, grill: 0.75, fry: 0.74, braise: 0.68, boil: 0.65, default: 0.75 },
  // Fish: fried/steamed ~0.80; whole boiled lower (we model edible-fillet here).
  fish_seafood: { fry: 0.80, steam: 0.80, bake: 0.78, boil: 0.77, default: 0.80 },
  egg:          { fry: 0.90, boil: 1.0, default: 0.90 },
  // Dry → cooked multipliers (absorb water).
  grain_rice:   { boil: 3.0, default: 3.0 },
  grain_pasta:  { boil: 2.5, default: 2.5 },
  legume_dry:   { boil: 2.6, default: 2.6 },
  // Vegetables mostly 0.85–0.99 (carrot 0.94, spinach 0.95); caramelized onion much lower.
  vegetable:    { boil: 0.92, steam: 0.88, roast: 0.80, default: 0.90 },
};

/** Fat picked up by frying/breading, in grams per 100g RAW food (FAO). Additive, not a multiplier. */
export const FRY_FAT_UPTAKE_PER_100G: Partial<Record<YieldCategory, number>> = {
  meat_red: 3, meat_poultry: 4, fish_seafood: 6, vegetable: 5,
};

/** Convert a raw weight to its cooked weight (or dry grain/legume to cooked). */
export function rawToCooked(rawGrams: number, category: YieldCategory, method: CookMethod = 'default'): number {
  const table = YIELD_FACTORS[category];
  const factor = table[method] ?? table.default;
  return Math.round(rawGrams * factor);
}

/** Convert a cooked weight back to raw (e.g. coach prescribed "180g cooked", DB is raw). */
export function cookedToRaw(cookedGrams: number, category: YieldCategory, method: CookMethod = 'default'): number {
  const table = YIELD_FACTORS[category];
  const factor = table[method] ?? table.default;
  return factor > 0 ? Math.round(cookedGrams / factor) : cookedGrams;
}

// ── Household / hand portions ────────────────────────────────────────────────
// Precision Nutrition hand method + Michael's Greek coaching heuristics.
// confidence is LOW for hand portions (±~50% on grams) — carry it through so the
// pipeline can widen its range / ask for clarification rather than overcommit.

export interface PortionEstimate { grams: number; confidence: number; note?: string; }

/**
 * Resolve a vague household portion to grams. `category` (when known) sharpens
 * the estimate; otherwise a generic value is returned. Greek/Spanish synonyms
 * map to the same buckets.
 */
export function resolveHouseholdPortion(term: string, category?: YieldCategory): PortionEstimate | null {
  const t = term.trim().toLowerCase();
  // palm of protein ≈ 85–115g cooked meat (~20–30g protein)
  if (/(palm|παλάμη|palma)/.test(t)) {
    if (category === 'meat_red' || category === 'meat_poultry' || category === 'fish_seafood') {
      return { grams: 100, confidence: 0.5, note: 'palm ≈ 100g cooked protein' };
    }
    return { grams: 100, confidence: 0.4, note: 'palm portion' };
  }
  // 1 fruit = fits in palm ≈ 60 kcal (Michael). banana = 2, melon ≈ 4, 2 kiwis = 1.
  if (/(fruit|φρούτο|fruta)/.test(t)) {
    return { grams: 120, confidence: 0.45, note: '1 fruit ≈ palm ≈ 60 kcal' };
  }
  // cupped hand of carbs ≈ ½–⅔ cup cooked grain (~20–30g carb)
  if (/(cupped hand|handful of rice|cupped)/.test(t)) {
    return { grams: 75, confidence: 0.45, note: 'cupped hand ≈ ½–⅔ cup cooked grain' };
  }
  // thumb of fat ≈ 1 tbsp / small handful nuts (~7–12g fat)
  if (/(thumb|αντίχειρας)/.test(t)) {
    return { grams: 15, confidence: 0.5, note: 'thumb ≈ 1 tbsp fat' };
  }
  // fist of vegetables ≈ 1 cup (~80–100g)
  if (/(fist|γροθιά|puño)/.test(t)) {
    return { grams: 90, confidence: 0.5, note: 'fist ≈ 1 cup veg' };
  }
  // generic handful (nuts/seeds/snacks) ≈ 30g
  if (/(handful|χούφτα|puñado)/.test(t)) {
    return { grams: 30, confidence: 0.4, note: 'handful ≈ 30g' };
  }
  // "a couple" ≈ 2 pieces — caller multiplies by piece weight; signal count only
  if (/(a couple|couple of|καμπόσα|un par)/.test(t)) {
    return { grams: 0, confidence: 0.4, note: 'a couple ≈ 2 pieces (×piece weight)' };
  }
  return null;
}

/** Standard single-portion gram defaults (USDA), for common foods lacking a DB conversion. */
export const STANDARD_PORTION_GRAMS: Record<string, number> = {
  'rice cooked cup': 200, 'pasta cooked cup': 140, 'bread slice': 27,
  'egg large': 50, 'chicken breast raw': 174, 'apple medium': 182,
  'banana medium': 118, 'fruit medium': 150,
};
