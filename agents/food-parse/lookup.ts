/**
 * agents/food-parse/lookup.ts — Hybrid food retrieval engine (v2 RRF).
 *
 * DietAI24 2026 paper implementation: LLM identifies, DB supplies macros.
 * Achieves ±1.2% MAPE vs the 19% error rate of LLM-invented macros.
 *
 * Retrieval pipeline (upgraded to parallel RRF in Phase 9/10):
 *
 *   Stage 1 — Parallel dual retrieval
 *     A. BM25/tsvector arm: keyword search on search_text (top KEYWORD_LIMIT)
 *     B. Vector arm: HNSW cosine kNN on embedding (top VECTOR_LIMIT)
 *     Both run simultaneously. Falls back to ILIKE if BM25 returns nothing.
 *
 *   Stage 2 — RRF merge (Reciprocal Rank Fusion, research-optimal 70/30)
 *     score = 0.7 × (1 / (k + vector_rank)) + 0.3 × (1 / (k + bm25_rank))
 *     where k = 60 (standard RRF constant).
 *     This outperforms sequential filtering (old Stage 1→2) for cross-lingual
 *     queries ("φέτα" matching "feta cheese") where BM25 fails but vector succeeds.
 *
 *   Stage 3 — Metadata boost
 *     Boosts by data_quality (lab_verified > label > crowdsourced) + region match.
 *
 * Unit resolution:
 *   food-specific → food-specific no qualifier → universal → universal no qualifier
 *   → default serving grams.
 *
 * Returns:
 *   { food, conversionId, gramsPerUnit, gramsTotal, macros }
 *   OR null if no match found above MIN_SIMILARITY threshold.
 */

import { db } from '../../db/client';
import { foods, type SelectFood } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { foodAliases } from '../../db/schema/food_aliases';
import { sql, and, eq, isNull, inArray } from 'drizzle-orm';

// ── Helpers ───────────────────────────────────────────────────────────────────
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Config ────────────────────────────────────────────────────────────────────
/** Minimum cosine similarity to accept a vector match (0–1). */
const MIN_SIMILARITY    = 0.72;
/** Max BM25/tsvector candidates (keyword arm). 40 ensures regional foods
 *  (seeded after USDA bulk ingest) aren't cut off by heap-scan ordering. */
const KEYWORD_LIMIT     = 40;
/** Max direct HNSW candidates (vector arm). */
const VECTOR_LIMIT      = 20;
/** Standard RRF constant — lower k = top ranks dominate more. */
const RRF_K             = 60;

// ── Types ─────────────────────────────────────────────────────────────────────
export interface LookupInput {
  /** Food name as identified by the LLM (e.g. "greek yogurt", "φέτα"). */
  foodName: string;
  /** Unit string from user input (e.g. "tbsp", "φέτα", "cup"). */
  unit: string;
  /** Optional qualifier to disambiguate unit (e.g. "cooked", "thin"). */
  qualifier?: string;
  /** Preferred region for boosting. Defaults to 'GR' for Kavdas plan. */
  region?: string;
  /** Voyage embedding of the food name. If omitted, skips vector re-rank. */
  queryEmbedding?: number[];
}

export interface LookupResult {
  food: SelectFood;
  conversionId: string | null;
  gramsPerUnit: number;
  /** qty × gramsPerUnit — the deterministic gram count. */
  gramsTotal: (qty: number) => number;
  macros: (qty: number) => {
    kcal:    number;
    protein: number;
    carb:    number;
    fat:     number;
    fiber:   number | null;
  };
}

// ── Stage 1: keyword filter ───────────────────────────────────────────────────
async function keywordCandidates(foodName: string): Promise<SelectFood[]> {
  if (!foodName || typeof foodName !== 'string') return [];
  // Tokenize input: split on spaces, clean, build tsquery
  // NFD normalize + strip combining marks converts accented Latin chars to ASCII
  // (café→cafe, plátano→platano) so BM25 matches regardless of accent usage.
  // Greek letters (α-ω, ά-ώ) are preserved as-is since they're in the allowed range.
  const tokens = foodName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritical marks (é→e, ñ→n, etc.)
    .toLowerCase()
    .replace(/[^a-zα-ωά-ώ0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (tokens.length === 0) return [];

  // Singularize tokens for BM25 — 'simple' tsconfig has no stemmer, so
  // "eggs" must become "egg" to match "Egg, whole, raw, fresh".
  const singularTokens = tokens.map(t =>
    t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t
  );

  // Build tsquery with BOTH forms: "egg:* | eggs:*" so we catch singular AND plural
  const tsQuery = tokens.map((t, i) => {
    const s = singularTokens[i];
    return s !== t ? `(${s}:* | ${t}:*)` : `${t}:*`;
  }).join(' & ');

  const rows = await db
    .select()
    .from(foods)
    .where(
      sql`search_text @@ to_tsquery('simple', ${tsQuery})`
    )
    // Order by ts_rank so shorter, more specific names rank above long USDA variants.
    // This prevents heap-scan order from burying regional (HHF/HelTH) foods.
    .orderBy(sql`ts_rank(search_text, to_tsquery('simple', ${tsQuery})) DESC`)
    .limit(KEYWORD_LIMIT);

  const simpleQuery = tokens.join(' ');
  const singularQuery = singularTokens.join(' ');
  const exactishPattern = `${simpleQuery}%`;
  const singularExactishPattern = singularQuery !== simpleQuery ? `${singularQuery}%` : exactishPattern;
  const pluralExactishPattern = tokens.length === 1 ? `${simpleQuery}s%` : exactishPattern;
  const exactishRows = await db
    .select()
    .from(foods)
    .where(
      sql`(name_en ILIKE ${exactishPattern} OR name_en ILIKE ${singularExactishPattern} OR name_en ILIKE ${pluralExactishPattern} OR name_el ILIKE ${exactishPattern} OR name_es ILIKE ${exactishPattern} OR name_fr ILIKE ${exactishPattern} OR name_it ILIKE ${exactishPattern})`
    )
    .limit(10);

  const mergeUnique = (primary: SelectFood[], secondary: SelectFood[]): SelectFood[] => {
    const seen = new Set<string>();
    const merged: SelectFood[] = [];
    for (const food of [...primary, ...secondary]) {
      if (seen.has(food.id)) continue;
      seen.add(food.id);
      merged.push(food);
    }
    return merged;
  };

  // Canonical injection pattern: canonical entries have verified unit conversions
  // and macros, but may rank low in BM25 due to USDA's verbose naming.
  // E.g. "eggs" → "Egg, whole, raw, fresh" ranks #94 in BM25 because
  // "Eggs, Grade A, Large, egg whole" has higher term frequency. Injecting
  // ensures metadataBoost can give canonical entries their +5 advantage.
  const canonPattern = `%${singularTokens.join('%')}%`;
  const canonicalMatches = await db
    .select()
    .from(foods)
    .where(
      sql`canonical_food_key IS NOT NULL AND (name_en ILIKE ${canonPattern} OR name_el ILIKE ${canonPattern} OR name_es ILIKE ${canonPattern} OR name_fr ILIKE ${canonPattern} OR name_it ILIKE ${canonPattern})`
    )
    .limit(10);

  // ── Alias injection: 114 cross-language aliases (Greek, Spanish, English) ──
  // The food_aliases table has a GIN index on to_tsvector('simple', alias),
  // so this uses the same tsquery we already built. "γιαούρτι" matches the
  // alias → joins to food_id → injects Greek Yogurt Full Fat into candidates.
  const aliasHits = await db.execute<{ food_id: string }>(
    sql`
      SELECT DISTINCT fa.food_id
      FROM food_aliases fa
      WHERE to_tsvector('simple', fa.alias) @@ to_tsquery('simple', ${tsQuery})
      LIMIT 10
    `
  );
  let aliasMatches: SelectFood[] = [];
  if (aliasHits.rows.length > 0) {
    const aliasIds = aliasHits.rows.map(r => r.food_id);
    aliasMatches = await db
      .select()
      .from(foods)
      .where(inArray(foods.id, aliasIds));
  }

  // If tsvector returned nothing, fall back to fuzzy ILIKE on name columns + aliases
  if (rows.length === 0) {
    const pattern = `%${tokens.join('%')}%`;
    let fuzzyRows = await db
      .select()
      .from(foods)
      .where(
        sql`(name_en ILIKE ${pattern} OR name_el ILIKE ${pattern} OR name_es ILIKE ${pattern} OR name_fr ILIKE ${pattern} OR name_it ILIKE ${pattern})`
      )
      .limit(KEYWORD_LIMIT);

    // Also check aliases via ILIKE for multi-word terms that don't tokenize well
    const aliasFuzzyHits = await db.execute<{ food_id: string }>(
      sql`
        SELECT DISTINCT fa.food_id
        FROM food_aliases fa
        WHERE fa.alias ILIKE ${pattern}
        LIMIT 10
      `
    );
    let aliasFuzzyFoods: SelectFood[] = [];
    if (aliasFuzzyHits.rows.length > 0) {
      const aliasIds = aliasFuzzyHits.rows.map(r => r.food_id);
      aliasFuzzyFoods = await db
        .select()
        .from(foods)
        .where(inArray(foods.id, aliasIds));
    }

    // Word-boundary post-filter: reject matches where query tokens appear
    // only as substrings of longer words (e.g. "latte" inside "platter").
    // At least one query token (length ≥ 3) must appear as a whole word.
    fuzzyRows = fuzzyRows.filter(food => {
      const name = (food.nameEn ?? '').toLowerCase() + ' ' + (food.nameEl ?? '').toLowerCase() + ' ' + (food.nameEs ?? '').toLowerCase() + ' ' + (food.nameFr ?? '').toLowerCase();
      return tokens.some(token => {
        if (token.length < 3) return false;
        const regex = new RegExp(`\\b${escapeRegex(token)}\\b`, 'i');
        return regex.test(name);
      });
    });

    // Alias-matched foods bypass word-boundary filter (alias text already matched)
    return mergeUnique(aliasMatches, mergeUnique(aliasFuzzyFoods, mergeUnique(exactishRows, mergeUnique(fuzzyRows, canonicalMatches))));
  }

  return mergeUnique(aliasMatches, mergeUnique(exactishRows, mergeUnique(rows, canonicalMatches)));
}

// ── Stage 1B: direct vector arm (HNSW cosine kNN, no pre-filter) ─────────────
/**
 * Query the HNSW index directly — NOT filtered to BM25 candidates.
 * This is the key upgrade: cross-lingual queries ("φέτα" → "feta cheese") where
 * BM25 returns nothing will still find matches via semantic embedding similarity.
 */
async function vectorSearch(
  queryEmbedding: number[],
): Promise<SelectFood[]> {
  if (queryEmbedding.length !== 1024) return [];

  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const rows = await db.execute<SelectFood & { similarity: number }>(
    sql`
      SELECT *, 1 - (embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM foods
      WHERE embedding IS NOT NULL
        AND 1 - (embedding <=> ${vectorLiteral}::vector) >= ${MIN_SIMILARITY}
      ORDER BY embedding <=> ${vectorLiteral}::vector
      LIMIT ${VECTOR_LIMIT}
    `
  );

  return (rows.rows as Array<SelectFood & { similarity: number }>)
    // Strip the `similarity` column — it's only used for the WHERE filter above.
    // Destructured on its own statement so the eslint-disable targets exactly this line.
    .map((row) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { similarity, ...food } = row;
      return food as SelectFood;
    });
}

// ── Stage 2: RRF merge (Reciprocal Rank Fusion 70/30) ────────────────────────
/**
 * Merge vector + BM25 results using RRF.
 *   score = 0.7 × (1 / (k + vector_rank)) + 0.3 × (1 / (k + bm25_rank))
 *
 * Foods appearing in both arms receive both contributions (best case).
 * Foods appearing in only one arm still get their single contribution.
 */
function rrfMerge(
  vectorResults: SelectFood[],
  bm25Results: SelectFood[],
): SelectFood[] {
  const scores = new Map<string, { food: SelectFood; score: number }>();

  // Vector arm — 70% weight
  vectorResults.forEach((food, idx) => {
    const rank = idx + 1;
    scores.set(food.id, { food, score: 0.7 * (1 / (RRF_K + rank)) });
  });

  // BM25 arm — 30% weight (additive for foods in both arms)
  bm25Results.forEach((food, idx) => {
    const rank = idx + 1;
    const contribution = 0.3 * (1 / (RRF_K + rank));
    const existing = scores.get(food.id);
    if (existing) {
      existing.score += contribution;
    } else {
      scores.set(food.id, { food, score: contribution });
    }
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(entry => entry.food);
}

// ── Stage 3: metadata boost ───────────────────────────────────────────────────
function normalizeLexicalName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-zα-ωά-ώ0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function singularize(value: string): string {
  return value
    .split(' ')
    .map((token) => token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token)
    .join(' ');
}

function lexicalIntentScore(candidate: SelectFood, query: string): number {
  const normalizedQuery = normalizeLexicalName(query);
  const normalizedName = normalizeLexicalName(candidate.nameEn);
  if (!normalizedQuery || !normalizedName) return 0;

  const singularQuery = singularize(normalizedQuery);
  const singularName = singularize(normalizedName);
  const queryTokens = singularQuery.split(' ').filter(Boolean);
  const nameTokens = singularName.split(' ').filter(Boolean);

  let score = 0;
  if (singularName === singularQuery) score += 12;
  if (nameTokens[0] === queryTokens[0]) score += 3;
  if (singularName.startsWith(`${singularQuery} `)) score += 2;
  if (queryTokens.every((token) => nameTokens.includes(token))) score += 2;

  // Generic one-food queries should not resolve to mixtures, desserts, baby foods,
  // or processed variants just because they share the token.
  if (queryTokens.length === 1 && nameTokens.length > 3) score -= 2;
  if (queryTokens.length === 1 && /babyfood|cereal|dessert|doughnut|donut|cookies|candies|beverages/.test(singularName)) {
    score -= 4;
  }
  if (queryTokens.length === 1 && /mcmuffin|sandwich|burger|burrito|pizza|breakfast/.test(singularName)) {
    score -= 12;
  }
  if (queryTokens.length === 1 && /dehydrated|powder|dried/.test(singularName) && !/dehydrated|powder|dried/.test(singularQuery)) {
    score -= 5;
  }
  // "egg" → "egg whole" not "egg white"; "milk" → whole milk not "milk fat"
  // Penalize sub-component / processed variants when query is a plain food noun.
  if (queryTokens.length <= 2 && /\bwhite\b|\byolk\b|\bsubstitute\b|\bshell\b|\bsolid\b/.test(singularName) && !/\bwhite\b|\byolk\b|\bsubstitute\b|\bshell\b|\bsolid\b/.test(singularQuery)) {
    score -= 3;
  }

  return score;
}

/**
 * Conditional canonical boost: only award the +5 ranking bonus to canonical
 * foods whose name (or canonical_food_key tokens) shares at least one
 * meaningful token with the query.
 *
 * Prevents false-positive boosts like plantain_fried winning for "fries" query,
 * while preserving the boost for true matches like egg_chicken_whole_raw for "egg".
 */
function canonicalRelevanceBoost(food: SelectFood, query: string): number {
  const queryNormalized = singularize(normalizeLexicalName(query));
  const queryTokens = queryNormalized.split(/\s+/).filter(t => t.length >= 3);
  if (queryTokens.length === 0) return 5; // very short query, give benefit of doubt

  const nameNormalized = singularize(normalizeLexicalName(food.nameEn));
  const nameTokens = nameNormalized.split(/\s+/);

  // Also check canonical_food_key tokens (e.g. "egg_chicken_whole_raw" → ["egg","chicken","whole","raw"])
  const keyTokens = (food.canonicalFoodKey ?? '').split(/[_-]+/).filter(t => t.length >= 3);
  const allFoodTokens = [...nameTokens, ...keyTokens];

  // Exact token match only (not prefix) — prevents "frie" (from "fries")
  // matching "fried" in "Plantains, green, fried"
  const overlap = queryTokens.some(qt =>
    allFoodTokens.some(ft => ft === qt),
  );

  return overlap ? 5 : 0;
}

function metadataBoost(candidates: SelectFood[], region: string, query: string): SelectFood[] {
  if (candidates.length <= 1) return candidates;

  // Score: quality weight + region match
  const qualityScore = (q: string) => ({ lab_verified: 3, label: 2, crowdsourced: 1, estimated: 0 }[q] ?? 0);
  const scored = candidates.map(c => ({
    food: c,
    score:
      lexicalIntentScore(c, query) +
      qualityScore(c.dataQuality) +
      (c.region?.includes(region) ? 2 : 0) +
      (c.canonicalFoodKey ? canonicalRelevanceBoost(c, query) : 0) +
      (c.popularity ?? 0) * 0.01, // popularity is a small tie-breaker
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.food);
}

// ── Unit conversion lookup ────────────────────────────────────────────────────
// Synonym map: LLM may emit any of these for countable items.
// Normalize to 'piece' which matches food_unit_conversions rows.
const UNIT_SYNONYMS: Record<string, string> = {
  unit: 'piece', units: 'piece', each: 'piece', item: 'piece', items: 'piece',
  count: 'piece', whole: 'piece', pieces: 'piece', pcs: 'piece', strip: 'piece', strips: 'piece',
  // Spanish
  unidad: 'piece', unidades: 'piece',
  // Greek
  'τεμάχιο': 'piece', 'τεμάχια': 'piece', 'κομμάτι': 'piece', 'κομμάτια': 'piece',
  gram: 'g', grams: 'g', gr: 'g', 'γρ': 'g',
  milliliter: 'ml', milliliters: 'ml', millilitre: 'ml', millilitres: 'ml',
  centiliter: 'cl', centiliters: 'cl', centilitre: 'cl', centilitres: 'cl',
  deciliter: 'dl', deciliters: 'dl', decilitre: 'dl', decilitres: 'dl',
  liter: 'l', liters: 'l', litre: 'l', litres: 'l',
  'fluid ounce': 'fl oz', 'fluid ounces': 'fl oz', 'fl. oz.': 'fl oz', 'fl oz': 'fl oz',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kilos: 'kg', 'κιλό': 'kg', 'κιλά': 'kg',
  tablespoon: 'tbsp', tablespoons: 'tbsp', spoon: 'tbsp', 'κουταλιά': 'tbsp', 'κουταλιές': 'tbsp', 'κ.σ.': 'tbsp',
  teaspoon: 'tsp', teaspoons: 'tsp', 'κουταλάκι': 'tsp', 'κουταλάκια': 'tsp', 'κ.γ.': 'tsp',
  'φλιτζάνι': 'cup', 'φλιτζάνια': 'cup', 'φλ': 'cup', taza: 'cup', tazas: 'cup',
  'ποτήρι': 'glass', 'ποτήρια': 'glass', vaso: 'glass', vasos: 'glass', glass: 'cup', glasses: 'cup',
  'χούφτα': 'handful', 'χούφτες': 'handful', 'puñado': 'handful', 'puñados': 'handful',
  'παλάμη': 'palm', 'παλάμες': 'palm',
  'μερίδα': 'serving', 'μερίδες': 'serving', porción: 'serving', porciones: 'serving',
  'μπολ': 'bowl', 'μπωλ': 'bowl', bowls: 'bowl',
  'πιάτο': 'plate', 'πιάτα': 'plate', plato: 'plate', platos: 'plate',
  'φέτα': 'slice', 'φέτες': 'slice', rebanada: 'slice', rebanadas: 'slice',
  'λίγο': 'some', 'λίγη': 'some', 'un poco': 'some',
  lata: 'can', latas: 'can', 'κουτί': 'can', 'κουτιά': 'can',
  filete: 'fillet', filetes: 'fillet',
  // French
  'cuillère à soupe': 'tbsp', 'cuillères à soupe': 'tbsp', 'c.à.s.': 'tbsp', 'cas': 'tbsp',
  'cuillère à café': 'tsp', 'cuillères à café': 'tsp', 'c.à.c.': 'tsp', 'cac': 'tsp',
  'verre': 'glass', 'verres': 'glass',
  'tasse': 'cup', 'tasses': 'cup',
  'bol': 'bowl', 'bols': 'bowl',
  'tranche': 'slice', 'tranches': 'slice',
  'poignée': 'handful', 'poignées': 'handful',
  'morceau': 'piece', 'morceaux': 'piece',
  'portion': 'serving', 'portions': 'serving',
  'assiette': 'plate', 'assiettes': 'plate',
  'boîte': 'can', 'boîtes': 'can',
  'filet': 'fillet', 'filets': 'fillet',
};

// Beverage detection: canonical keys containing these tokens indicate liquid foods
// where "piece" should resolve to a liquid container unit (can > bottle > glass > cup).
const BEVERAGE_KEY_TOKENS = [
  'cola', 'soda', 'beer', 'juice', 'latte', 'coffee', 'tea', 'water',
  'gatorade', 'pepsi', 'sprite', 'fanta', 'milk', 'energy_drink', 'cappuccino',
];
const LIQUID_UNIT_PRIORITY = ['can', 'bottle', 'glass', 'cup', 'serving'];

function isBeverageByKey(canonicalFoodKey: string | null | undefined): boolean {
  if (!canonicalFoodKey) return false;
  const key = canonicalFoodKey.toLowerCase();
  return BEVERAGE_KEY_TOKENS.some(token => key.includes(token));
}

/**
 * Conservative portion defaults for calorie-dense foods when the user provides
 * a vague unit ("serving", "portion", "some", "a little", "handful").
 *
 * Fat MAPE was 81% because "1 serving tahini" fell through to the universal
 * 100g default. A tablespoon of tahini (≈595 kcal/100g) is 83 kcal; 100g is
 * 595 kcal — a 7× overestimate. These conservative defaults set sensible
 * priors pending clarification.
 *
 * Evidence:
 *   - USDA Household Portion Sizes (FNDDS 2019-2020)
 *   - WHO portion guidance: oils ≤2 tbsp/day, nuts ~30g/day
 */
const VAGUE_PORTION_UNITS = new Set(['serving', 'portion', 'some', 'a little', 'a bit']);

export function conservativeDenseFoodServing(
  unit: string,
  foodIdentity: string | null | undefined,
): number | null {
  const key = foodIdentity?.toLowerCase().replace(/[^a-z]+/g, '_') ?? '';
  if (!VAGUE_PORTION_UNITS.has(unit)) return null;

  // Tier 1: Spreads/nut butters → 32g (2 tablespoons)
  // MUST come before pure-fat check because "peanut_butter" contains "butter"
  if (/(^|_)(peanut_butter|almond_butter|nutella|cream_cheese|mayonnaise|mayo|hummus|guacamole|jam|jelly|tahini|sour_cream|aioli)(_|$)/.test(key)) return 32;

  // Tier 2: Pure fats/oils → 14g (1 tablespoon)
  if (/(^|_)(oil|olive_oil|coconut_oil|butter|ghee|lard|shortening|margarine)(_|$)/.test(key)) return 14;

  // Tier 2b: Syrups/honey → 32g (2 tablespoons) — dense but sweeter, higher typical portion
  if (/(^|_)(honey|maple_syrup|syrup|agave|molasses)(_|$)/.test(key)) return 32;

  // Tier 3: Nuts/seeds → 30g (small handful, WHO daily guidance)
  if (/(^|_)(nut|seed|almond|walnut|cashew|pistachio|macadamia|pecan|hazelnut|peanut|sunflower|pumpkin_seed|chia|flax)(_|$)/.test(key)) return 30;

  // Tier 4: Cheese → 30g (1 oz, standard serving)
  if (/(^|_)(cheese|feta|cheddar|gouda|parmesan|mozzarella|brie|camembert|graviera|halloumi|manchego)(_|$)/.test(key)) return 30;

  // Tier 5: Cream/heavy liquids → 30ml (~30g)
  if (/(^|_)(cream|heavy_cream|whipping_cream|half_and_half|coconut_cream)(_|$)/.test(key)) return 30;

  return null;
}

/**
 * Evidence-based piece weights for common items where "1 piece" has a well-known
 * physical mass. These catch cases where the food exists in the DB but has no
 * food-specific `food_unit_conversions` row for "piece".
 *
 * Without this, "1 croissant" → piece → universal default → 100g.
 * Actual croissant: 60g (USDA FNDDS). Error: +67%.
 *
 * Sources: USDA FNDDS 2019-2020, BEDCA (Spain), British Nutrition Foundation.
 */
export const COMMON_PIECE_WEIGHTS: Record<string, number> = {
  // Bakery
  croissant: 60, muffin: 115, bagel: 105, cookie: 35, donut: 65,
  scone: 75, breadstick: 25, dinner_roll: 35, biscuit: 60,
  waffle: 75, pancake: 40, crepe: 60, brownie: 55,
  cupcake: 65, cinnamon_roll: 85, danish: 70, eclair: 60,

  // Bread (per slice)
  bread: 30, toast: 30, toast_with_butter: 44, bread_slice: 30, whole_wheat_bread: 30,
  white_bread: 25, sourdough: 35, rye_bread: 32,

  // Wraps/flatbreads
  pita: 60, tortilla: 45, naan: 90, lavash: 55, wrap: 65,
  arepa: 120, pupusa: 130,

  // Pastry (Greek/Mediterranean)
  spanakopita: 130, tiropita: 100, baklava: 80, galaktoboureko: 120,
  loukoumades: 20, bougatsa: 120,

  // Eggs
  egg: 50, egg_fried: 46, egg_boiled: 50, egg_scrambled: 61,

  // Fruits (medium)
  apple: 180, banana: 120, orange: 130, pear: 180,
  peach: 150, plum: 66, kiwi: 75, mandarin: 80,
  fig: 50, date: 8, prune: 10,

  // Fast food items (standard piece)
  nugget: 17, chicken_nugget: 17, wing: 34, drumstick: 75,
  empanada: 100, spring_roll: 65, samosa: 80,
  taco: 75, burrito: 200, quesadilla: 180,
  cheeseburger: 150, hamburger: 150,

  // Sandwiches (assembled weight)
  turkey_sandwich: 190, blt_sandwich: 170, blt: 170,
  club_sandwich: 220, grilled_cheese: 140,

  // Pizza (per slice)
  pepperoni_pizza: 110, pizza_slice: 110, pizza: 110,

  // Latin American composites
  chicken_fajitas: 280, chicken_fajita: 280,
  changua: 350, changua_bogotana: 350,

  // Seafood (per piece, gutted/cleaned)
  shrimp: 15, prawn: 15, mussel: 10, oyster: 50,
  sardine: 25, sardines: 25, anchovy: 8, anchovy_fillet: 4,
  calamari_ring: 12, squid_ring: 12,
  crab_cake: 60, fish_stick: 28, fish_finger: 28,

  // Dolmades / stuffed items
  dolmades: 35, dolma: 35, stuffed_grape_leaf: 35,
  dolmadakia: 35, ntolmadakia: 35,

  // Greek bakery & sweets
  koulouri: 70, koulouri_thessalonikis: 70,
  koulouria: 25, koulourakio: 25, koulouraki: 25, koulouria_voutyrou: 25,
  pasteli: 30, paximadi: 40, rusks: 40,
  melomakarono: 50, kourabiedes: 35, diples: 40,
  tsoureki: 80, vasilopita: 100, christopsomo: 90,
  revani: 80, halva: 40, loukoumi: 8,

  // Greek savory — composite wraps/plates (longer keys MUST precede shorter)
  souvlaki_pork_pita: 250, souvlaki_chicken_pita: 280, souvlaki_pita: 280,
  gyros_chicken_pita: 300, gyros_pork_pita: 300, chicken_gyros_pita: 300,
  gyros_pita: 300,
  souvlaki: 150, gyros: 280, gyro: 280,
  soutzoukaki: 60, keftedes: 30, keftedakia: 20,
  bifteki: 120, pastitsio: 250, mousaka: 250, moussaka: 250,

  // Meat pieces
  lamb_chop: 80, pork_chop: 150, chicken_thigh: 110,
  chicken_breast: 170, steak: 200, meatball: 30,
  souvlaki_stick: 100, kebab: 100,

  // Latin American
  bocadillo_guayaba: 40, bocadillo: 40,
  buñuelo: 35, churro: 40, alfajor: 55,
  tamal: 120, tamale: 120,

  // Sushi
  sushi: 30, nigiri: 30, maki: 25, sashimi: 25,

  // Supplements (per scoop/serving)
  whey_protein: 30, whey_protein_powder: 30, protein_powder: 30,
  casein_protein_powder: 33, mass_gainer: 150, mass_gainer_powder: 150,
  pre_workout_powder: 15, pre_workout: 15,

  // Miscellaneous
  rice_cake: 9, protein_bar: 60, granola_bar: 35,
  falafel: 25, croquette: 30, arancini: 80,
};

async function resolveUnit(
  foodId: string,
  unit: string,
  qualifier?: string,
  canonicalFoodKey?: string | null,
): Promise<{ id: string | null; gramsPerUnit: number } | null> {
  const raw = unit.toLowerCase().trim();
  const normalizedUnit = UNIT_SYNONYMS[raw] ?? raw;

  // Explicit metric mass is authoritative and must never fall back to a food's
  // default serving. Otherwise "100 g" can become 100 default servings.
  if (normalizedUnit === 'g') return { id: null, gramsPerUnit: 1 };
  if (normalizedUnit === 'kg') return { id: null, gramsPerUnit: 1_000 };
  if (normalizedUnit === '100g') return { id: null, gramsPerUnit: 100 };

  // Metric volume → grams (density ≈1 for water-based beverages/liquids)
  if (normalizedUnit === 'ml') return { id: null, gramsPerUnit: 1 };
  if (normalizedUnit === 'cl') return { id: null, gramsPerUnit: 10 };
  if (normalizedUnit === 'dl') return { id: null, gramsPerUnit: 100 };
  if (normalizedUnit === 'l') return { id: null, gramsPerUnit: 1_000 };
  if (normalizedUnit === 'fl oz' || normalizedUnit === 'floz') return { id: null, gramsPerUnit: 30 };

  // Standard pours for alcohol: a "glass" of wine is 150ml (not the 240ml water
  // cup that the generic glass→cup synonym implies); champagne flute 125ml;
  // spirits shot 45ml. Checked before DB conversions because USDA wine rows
  // carry no glass-unit conversion and would fall through to 100g default.
  const keyOrName = (canonicalFoodKey ?? '').toLowerCase();
  if (normalizedUnit === 'glass' || normalizedUnit === 'cup') {
    if (/\bwine\b|vino|κρασί/.test(keyOrName) && !/vinegar/.test(keyOrName)) {
      return { id: null, gramsPerUnit: 150 };
    }
    if (/champagne|prosecco|cava\b/.test(keyOrName)) return { id: null, gramsPerUnit: 125 };
  }
  if ((normalizedUnit === 'shot' || normalizedUnit === 'piece') &&
      /whisky|whiskey|vodka|tequila|rum\b|gin\b|brandy|cognac|liqueur/.test(keyOrName)) {
    return { id: null, gramsPerUnit: 45 };
  }

  const denseFoodServing = conservativeDenseFoodServing(normalizedUnit, canonicalFoodKey);
  if (denseFoodServing !== null) return { id: null, gramsPerUnit: denseFoodServing };

  // 1. Food-specific conversion (highest priority)
  const specific = await db
    .select()
    .from(foodUnitConversions)
    .where(
      and(
        eq(foodUnitConversions.foodId, foodId),
        eq(foodUnitConversions.unit, normalizedUnit),
        qualifier
          ? eq(foodUnitConversions.qualifier, qualifier)
          : isNull(foodUnitConversions.qualifier),
      )
    )
    .limit(1);

  if (specific.length > 0) {
    return { id: specific[0].id, gramsPerUnit: specific[0].gramsPerUnit };
  }

  // 1b. Beverage override: when LLM emits "piece" for a liquid food,
  // prefer the best liquid container unit (can > bottle > glass > cup).
  // This fixes "1 coca cola can" → piece=80g fallback bug.
  if (normalizedUnit === 'piece' && isBeverageByKey(canonicalFoodKey)) {
    for (const liquidUnit of LIQUID_UNIT_PRIORITY) {
      const liquidConversion = await db
        .select()
        .from(foodUnitConversions)
        .where(
          and(
            eq(foodUnitConversions.foodId, foodId),
            eq(foodUnitConversions.unit, liquidUnit),
            isNull(foodUnitConversions.qualifier),
          )
        )
        .limit(1);

      if (liquidConversion.length > 0) {
        return { id: liquidConversion[0].id, gramsPerUnit: liquidConversion[0].gramsPerUnit };
      }
    }
  }

  // 2. Food-specific without qualifier
  if (qualifier) {
    const specificNoQual = await db
      .select()
      .from(foodUnitConversions)
      .where(
        and(
          eq(foodUnitConversions.foodId, foodId),
          eq(foodUnitConversions.unit, normalizedUnit),
        )
      )
      .limit(1);

    if (specificNoQual.length > 0) {
      return { id: specificNoQual[0].id, gramsPerUnit: specificNoQual[0].gramsPerUnit };
    }
  }

  // 3. Food default serving when the requested unit matches the food's own
  // canonical serving unit. This keeps curated HHF/Kavdas defaults such as
  // feta slice = 30g and spanakopita piece = 130g ahead of generic universal
  // portion rows like slice/piece.
  const defaultServing = await db
    .select({
      id: foods.id,
      defaultServingGrams: foods.defaultServingGrams,
      defaultServingUnit: foods.defaultServingUnit,
    })
    .from(foods)
    .where(eq(foods.id, foodId))
    .limit(1);

  if (
    defaultServing.length > 0 &&
    defaultServing[0].defaultServingGrams &&
    defaultServing[0].defaultServingUnit?.toLowerCase().trim() === normalizedUnit
  ) {
    return { id: null, gramsPerUnit: defaultServing[0].defaultServingGrams };
  }

  // 3b. Bakery/common piece weights — when user says "1 croissant" (unit=piece)
  // and no food-specific conversion row exists, use evidence-based piece weights
  // instead of falling through to the 100g universal default.
  // Sources: USDA FNDDS 2019-2020, British Nutrition Foundation portion guide.
  if (normalizedUnit === 'piece') {
    const bakeryWeight = COMMON_PIECE_WEIGHTS[canonicalFoodKey?.toLowerCase().replace(/[^a-z]+/g, '_') ?? ''];
    if (bakeryWeight) return { id: null, gramsPerUnit: bakeryWeight };

    // Fuzzy match: check if any key token appears in the canonical food key
    const ck = canonicalFoodKey?.toLowerCase() ?? '';
    for (const [pattern, weight] of Object.entries(COMMON_PIECE_WEIGHTS)) {
      if (ck.includes(pattern) || pattern.includes(ck.replace(/[^a-z]/g, ''))) {
        return { id: null, gramsPerUnit: weight };
      }
    }
  }

  // 4. Universal fallback (food_id IS NULL)
  const universal = await db
    .select()
    .from(foodUnitConversions)
    .where(
      and(
        isNull(foodUnitConversions.foodId),
        eq(foodUnitConversions.unit, normalizedUnit),
        qualifier
          ? eq(foodUnitConversions.qualifier, qualifier)
          : isNull(foodUnitConversions.qualifier),
      )
    )
    .limit(1);

  if (universal.length > 0) {
    return { id: universal[0].id, gramsPerUnit: universal[0].gramsPerUnit };
  }

  // 5. Universal without qualifier
  if (qualifier) {
    const universalNoQual = await db
      .select()
      .from(foodUnitConversions)
      .where(
        and(
          isNull(foodUnitConversions.foodId),
          eq(foodUnitConversions.unit, normalizedUnit),
        )
      )
      .limit(1);

    if (universalNoQual.length > 0) {
      return { id: universalNoQual[0].id, gramsPerUnit: universalNoQual[0].gramsPerUnit };
    }
  }

  // 6. Last resort: use the food's default serving even if the unit differs.
  if (defaultServing.length > 0 && defaultServing[0].defaultServingGrams) {
    return { id: null, gramsPerUnit: defaultServing[0].defaultServingGrams };
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Look up a food by name + unit and return deterministic macro data.
 *
 * @param input - Food name, unit, optional qualifier and region
 * @returns LookupResult with food row + computed macros, or null if not found
 */
/**
 * Food name corrections for common LLM confusions.
 * The LLM sometimes outputs the wrong canonical English name
 * (e.g. "banana" for "plátano maduro" which should be "plantain").
 * These overrides fix the search query before BM25/vector lookup.
 */
const FOOD_NAME_CORRECTIONS: Record<string, string> = {
  // ── Plantain ↔ banana disambiguation ──
  'fried ripe plantain': 'plantains yellow ripe fried',
  'ripe fried plantain': 'plantains yellow ripe fried',
  'ripe plantain': 'plantain yellow',
  'fried plantain': 'plantains yellow ripe fried',
  'green plantain': 'plantain green',
  'green fried plantain': 'plantains green fried',
  'fried green plantain': 'plantains green fried',
  'patacon': 'plantains green fried',
  'patacón': 'plantains green fried',
  'tostón': 'plantains green fried',
  'toston': 'plantains green fried',
  'plátano verde frito': 'plantains green fried',
  'platano verde frito': 'plantains green fried',
  'platano': 'plantain',
  'platano maduro': 'plantains yellow ripe fried',
  'plátano maduro': 'plantains yellow ripe fried',
  'plátano maduro frito': 'plantains yellow ripe fried',
  'platano maduro frito': 'plantains yellow ripe fried',
  'maduro frito': 'plantains yellow ripe fried',
  'maduros fritos': 'plantains yellow ripe fried',
  'maduros': 'plantains yellow ripe fried',
  'platano frito': 'plantains yellow fried',
  'tajadas': 'plantains yellow ripe fried',
  'tajadas de maduro': 'plantains yellow ripe fried',

  // ── Beans & legumes ──
  'green bean': 'beans snap green',
  'beans': 'beans kidney',
  'frijoles': 'black beans cooked',
  'fríjoles': 'black beans cooked',
  'frijol': 'beans kidney',
  'frijoles negros': 'beans black',
  'black beans': 'beans black',
  'lentils': 'lentils cooked',
  'lentejas': 'lentils cooked',
  'chickpeas': 'chickpeas cooked',
  'garbanzos': 'chickpeas cooked',

  // ── Nuts & seeds ──
  'peanut butter': 'peanut butter',
  'peanut': 'peanuts',
  'mani': 'peanuts',
  'almonds': 'almonds raw',
  'almendras': 'almonds raw',
  'walnuts': 'walnuts raw',
  'nueces': 'walnuts raw',

  // ── Eggs ──
  'fried egg': 'egg fried',
  'fried eggs': 'egg fried',
  'scrambled egg': 'egg whole cooked scrambled',
  'scrambled eggs': 'egg whole cooked scrambled',
  'boiled egg': 'egg whole cooked hard-boiled',
  'hard boiled egg': 'egg whole cooked hard-boiled',
  'huevo frito': 'egg fried',
  'huevo revuelto': 'egg whole cooked scrambled',
  'huevo': 'egg whole raw',

  // ── Dairy ──
  'whole milk': 'milk whole',
  'leche': 'milk whole',
  'leche entera': 'milk whole',
  'queso': 'cheese white fresh',
  'queso blanco': 'cheese white fresh',
  'yogurt': 'greek yogurt',
  'yogur': 'greek yogurt',
  'γιαούρτι': 'strained yogurt',
  'γιαουρτι': 'strained yogurt',
  'halloumi': 'halloumi cheese',

  // ── Grains & cereals ──
  'oatmeal': 'cereals oats regular quick instant cooked water',
  'oats': 'cereals oats regular quick instant',
  'oatmeal cooked': 'cereals oats regular quick instant cooked water',
  'porridge': 'cereals oats regular quick instant cooked water',
  'avena': 'cereals oats regular quick instant cooked water',
  'avena cocida': 'cereals oats regular quick instant cooked water',
  'rice': 'rice white cooked',
  'arroz': 'rice white cooked',
  'arroz blanco': 'rice white cooked',
  'brown rice': 'rice brown cooked',
  'arroz integral': 'rice brown cooked',
  'pasta': 'pasta cooked enriched',
  'pasta cooked': 'pasta cooked enriched',
  'plain pasta': 'pasta cooked enriched',
  'plain pasta cooked': 'pasta cooked enriched',
  'spaghetti': 'pasta cooked enriched',
  'spaghetti cooked': 'pasta cooked enriched',
  'barilla spaghetti': 'barilla spaghetti cooked',
  'barilla spaghetti cooked': 'barilla spaghetti cooked',
  'fideos': 'pasta cooked enriched',
  'bread': 'bread whole wheat',
  'toast with butter': 'toast with butter',
  'toast butter': 'toast with butter',
  'tostada con mantequilla': 'toast with butter',
  'τοστ με βούτυρο': 'toast with butter',
  'τοστ βούτυρο': 'toast with butter',
  'pan': 'bread white',
  'pan blanco': 'bread white',
  'pan integral': 'bread whole wheat',
  'tortilla': 'tortilla corn',

  // ── Protein ──
  'protein shake': 'protein powder whey',
  'whey protein': 'whey protein powder',
  'whey protein powder': 'whey protein powder',
  'protein powder': 'whey protein powder',
  'proteina': 'whey protein powder',
  'proteina en polvo': 'whey protein powder',
  'casein': 'casein protein powder',
  'casein protein': 'casein protein powder',
  'caseina': 'casein protein powder',
  'creatine': 'creatine monohydrate',
  'creatina': 'creatine monohydrate',
  'creatine monohydrate': 'creatine monohydrate',
  'bcaa': 'bcaa powder',
  'bcaas': 'bcaa powder',
  'collagen': 'collagen peptides',
  'collagen peptides': 'collagen peptides',
  'colageno': 'collagen peptides',
  'colágeno': 'collagen peptides',
  'mass gainer': 'mass gainer powder',
  'pre workout': 'pre workout powder',
  'pre-workout': 'pre workout powder',
  'bacon': 'pork cured bacon',
  'chicken': 'chicken breast grilled',
  'pollo': 'chicken breast grilled',
  'pechuga': 'chicken breast grilled',
  'pechuga de pollo': 'chicken breast grilled',
  'ground beef': 'ground beef 80 lean 20 fat cooked pan-browned',
  'carne molida': 'ground beef 80 lean 20 fat cooked pan-browned',
  'κιμάς': 'beef ground 85% lean raw',
  'κιμάς μοσχαρίσιος': 'beef ground 85% lean raw',
  'κιμας μοσχαρισιος': 'ground veal cooked',
  'κιμας': 'ground beef 80 lean 20 fat cooked pan-browned',
  'carne de res': 'beef steak grilled',
  'steak': 'beef steak grilled',
  'carne': 'beef steak grilled',
  'carne asada': 'carne asada grilled beef',
  'carne a la plancha': 'carne asada grilled beef',

  // ── Dairy extras ──
  'cottage cheese': 'cottage cheese creamed milkfat',
  'requesón': 'cottage cheese creamed milkfat',
  'requeson': 'cottage cheese creamed milkfat',

  // ── Fish & seafood ──
  'salmon fillet': 'fish salmon atlantic',
  'salmon': 'fish salmon atlantic farmed',
  'tuna': 'fish tuna light canned',
  'tuna canned': 'fish tuna light canned',
  'tuna steak': 'fish tuna yellowfin',
  'atun': 'fish tuna light canned',
  'shrimp': 'shrimp cooked',
  'camarones': 'shrimp cooked',
  'sardines': 'sardines in oil',
  'sardinas': 'sardines in oil',
  'octopus': 'octopus',
  'pulpo': 'octopus',
  'χταπόδι': 'octopus',
  'χταποδι': 'octopus',
  'χταπόδι ξιδάτο': 'octopus',
  'χταποδι ξιδατο': 'octopus',
  'octopus vinegar': 'octopus',
  'marinated octopus': 'octopus',

  // ── Vegetables ──
  'salad': 'side salad',
  'ensalada': 'side salad',
  'broccoli': 'broccoli raw',
  'brocoli': 'broccoli raw',
  'spinach': 'spinach raw',
  'espinaca': 'spinach raw',
  'tomato': 'tomatoes raw',
  'tomate': 'tomatoes raw',
  'potato': 'potato boiled',
  'papa': 'potato boiled',
  'sweet potato': 'sweet potato baked',

  // ── Fruits ──
  'apple': 'apple raw',
  'manzana': 'apple raw',
  'banana': 'banana raw',
  'orange': 'orange raw',
  'naranja': 'orange raw',
  'avocado': 'avocado raw',
  'aguacate': 'avocado raw',
  'mango': 'mango raw',

  // ── Greek food (code-switch) ──
  'γαλακτομπούρεκο': 'galaktoboureko',
  'μπακλαβάς': 'baklava',
  'μπακλαβας': 'baklava',
  'σουβλάκι': 'souvlaki chicken pita',
  'σουβλακι': 'souvlaki chicken pita',
  'γύρος': 'gyros pork',
  'γυρος': 'gyros pork',
  'μουσακάς': 'moussaka',
  'μουσακας': 'moussaka',
  'παστίτσιο': 'pastitsio',
  'παστιτσιο': 'pastitsio',
  'σπανακόπιτα': 'spanakopita',
  'σπανακοπιτα': 'spanakopita',
  'τυρόπιτα': 'tiropita',
  'τυροπιτα': 'tiropita',
  'πίτα': 'tiropita',
  'πιτα': 'tiropita',
  'φασολάδα': 'fasolada bean soup',
  'φασολαδα': 'fasolada bean soup',
  'φακές': 'lentil soup fakes',
  'φακες': 'lentil soup fakes',
  'ρεβιθόσουπα': 'chickpea revithosoupa',
  'ρεβιθοσουπα': 'chickpea revithosoupa',
  'χωριάτικη': 'horiatiki village salad',
  'χωριατικη': 'horiatiki village salad',
  'ντολμαδάκια': 'dolmades stuffed grape leaves',
  'ντολμαδακια': 'dolmades stuffed grape leaves',
  'λουκουμάδες': 'loukoumades',
  'λουκουμαδες': 'loukoumades',
  'κουλούρι': 'koulouri thessalonikis',
  'κουλουρι': 'koulouri thessalonikis',
  'κουλούρι θεσσαλονίκης': 'koulouri thessalonikis',
  'κουλουρι θεσσαλονικης': 'koulouri thessalonikis',
  'κουλουράκια': 'koulouria butter cookies',
  'κουλουρακια': 'koulouria butter cookies',
  'κουλουράκια βουτύρου': 'koulouria butter cookies',
  'κουλουρακια βουτυρου': 'koulouria butter cookies',
  'μπουγάτσα': 'bougatsa cream',
  'μπουγατσα': 'bougatsa cream',
  'παστέλι': 'pasteli sesame honey bar',
  'παστελι': 'pasteli sesame honey bar',
  'κρουασάν': 'croissant butter',
  'κρουασαν': 'croissant butter',
  'κρουασάν σοκολάτα': 'croissant chocolate',
  'κρουασαν σοκολατα': 'croissant chocolate',
  'σαρδέλες': 'sardines',
  'σαρδελες': 'sardines',
  'σαρδέλες ψητές': 'sardines grilled',
  'σαρδελες ψητες': 'sardines grilled',
  'αρνί': 'lamb',
  'αρνι': 'lamb',
  'αρνί ψητό': 'lamb roasted',
  'αρνι ψητο': 'lamb roasted',
  'σουτζουκάκια': 'soutzoukakia smyrna meatballs',
  'σουτζουκακια': 'soutzoukakia smyrna meatballs',
  'κεφτέδες': 'keftedes greek meatballs',
  'κεφτεδες': 'keftedes greek meatballs',
  'γίγαντες πλακί': 'gigantes plaki baked beans',
  'γιγαντες πλακι': 'gigantes plaki baked beans',
  'μπιφτέκι': 'bifteki greek burger',
  'μπιφτεκι': 'bifteki greek burger',
  'ρεβίθια': 'chickpeas cooked',
  'ρεβιθια': 'chickpeas cooked',

  // ── Bakery (common names → DB entries) ──
  'croissant': 'croissant butter',
  'pan dulce': 'sweet bread',
  'bagel': 'bagel plain',
  'muffin': 'muffin blueberry',
  'donut': 'doughnut cake type',
  'doughnut': 'doughnut cake type',

  // ── Colombian / Latin food ──
  'arepa': 'arepa corn',
  'empanada': 'empanada',
  'bandeja paisa': 'bandeja paisa',
  'sancocho': 'sancocho',
  'ajiaco': 'ajiaco',
  'tamal': 'tamale',
  'tamales': 'tamale',
  'pupusa': 'pupusa',
  'burrito': 'burrito bean and cheese',
  'taco': 'taco ground beef',
  'quesadilla': 'quesadilla cheese',
  'nachos': 'nachos with cheese',

  // ── Restaurant shorthand ──
  'big mac': 'Big Mac',
  'mcchicken': 'McChicken',
  'egg mcmuffin': 'Egg McMuffin',
  'whopper': 'Whopper',
  'crunchwrap': 'Crunchwrap Supreme',
  'baconator': 'Baconator',
  'chicken sandwich chick-fil-a': 'Chick-fil-A Chicken Sandwich',
  'orange chicken': 'Orange Chicken',
  'hamburguesa corral': 'Corral Burger',
  'todoterreno': 'Todoterreno Burger',
  'pollo frisby': 'Frisby Fried Chicken Breast',
  'mcnuggets': 'Chicken McNuggets',
  'nuggets': 'Chicken McNuggets',
  'french fries': 'french fries',
  'papas fritas': 'french fries',

  // ── Branded corrections ──
  'nutella biscuit': 'nutella biscuit cookie',
  'nutella biscuits': 'nutella biscuit cookie',
  'oreo': 'oreo cookie',
  'oreos': 'oreo cookie',
  'atun van camps': 'tuna canned in water',
  'lata de atun': 'tuna canned in water',
  'bocadillo de guayaba': 'guava paste bocadillo',

  // ── Beverages ──
  'coffee': 'coffee brewed',
  'cafe': 'coffee brewed',
  'café': 'coffee brewed',
  'cafe con leche': 'cafe con leche',
  'café con leche': 'cafe con leche',
  'coffee with milk': 'cafe con leche',
  'latte': 'cafe con leche',
  'cappuccino': 'cappuccino',
  'tea': 'tea brewed',
  'te': 'tea brewed',
  'té': 'tea brewed',
  'juice': 'orange juice',
  'jugo': 'orange juice',
  'jugo de naranja': 'orange juice',
  'water': 'water',
  'agua': 'water',
  'agua de panela': 'agua de panela',

  // ── Colombian composite exact matches ──
  'arepa con queso': 'arepa with cheese',
  'arepa de huevo': 'arepa de huevo',
  'arepa de choclo': 'arepa de choclo',
  'huevos pericos': 'scrambled eggs with tomato and onion',
  'huevos revueltos': 'scrambled eggs',
  'huevos fritos': 'fried eggs',
  'caldo de costilla': 'caldo de costilla',
  'calentado': 'calentado',
  'changua': 'changua',

  // ── Additional Spanish name corrections (non-duplicates) ──
  'huevos': 'eggs',

  // ── Multi-word Greek composites (LLM extraction gives these) ──
  'μπουγάτσα κρέμα': 'bougatsa cream',
  'μπουγατσα κρεμα': 'bougatsa cream',
  'γαρίδες σαγανάκι': 'shrimp saganaki',
  'γαριδες σαγανακι': 'shrimp saganaki',
  'χόρτα βραστά': 'boiled greens horta',
  'χορτα βραστα': 'boiled greens horta',
  'χόρτα βραστά με λαδολέμονο': 'horta with ladolemono',
  'χορτα βραστα με λαδολεμονο': 'horta with ladolemono',
  'σουτζουκάκια με ρύζι': 'soutzoukakia with rice',
  'σουτζουκακια με ρυζι': 'soutzoukakia with rice',
  'καλαμάρι τηγανητό': 'fried calamari',
  'καλαμαρι τηγανητο': 'fried calamari',
  'τσουρέκι φέτα': 'tsoureki slice',
  'τσουρεκι φετα': 'tsoureki slice',
  'γιαούρτι 10%': 'strained yogurt 10%',
  'γιαουρτι 10%': 'strained yogurt 10%',
  'γιαούρτι 2%': 'greek yogurt low fat',
  'γιαουρτι 2%': 'greek yogurt low fat',
  'σουβλάκι χοιρινό': 'souvlaki pork pita',
  'σουβλακι χοιρινο': 'souvlaki pork pita',
  'σουβλάκι κοτόπουλο': 'souvlaki chicken pita',
  'σουβλακι κοτοπουλο': 'souvlaki chicken pita',
  'σουβλάκι κοτόπουλο χωρίς πίτα': 'souvlaki chicken skewer',
  'γύρο κοτόπουλο': 'chicken gyros pita',
  'γυρο κοτοπουλο': 'chicken gyros pita',
  'γύρο κοτόπουλο απ\' όλα': 'chicken gyros pita',
  'γυρο κοτοπουλο απ\' ολα': 'chicken gyros pita',
  'φακές μερίδα': 'lentil soup fakes',
  'φακες μεριδα': 'lentil soup fakes',
  'κιμά μοσχαρίσιο': 'ground veal cooked',
  'κιμας μοσχαρισιο': 'ground veal cooked',

  // ── Multi-word Colombian composites ──
  'changua bogotana': 'changua bogotana',
  'lechona tolimense': 'lechona tolimense',
  'sopa de lentejas': 'lentil soup',
  'sopa de lentejas con platano': 'lentil soup plantain',
  'sudado de pescado': 'fish stew sudado',
  'pollo asado': 'chicken roasted',
  'pan de bono': 'pan de bono',

  // ── Multi-word English composites (map to recipe names) ──
  'greek yogurt plain': 'greek yogurt plain',
  'greek yogurt 10% fat': 'strained yogurt 10%',
  'greek yogurt 10%': 'strained yogurt 10%',
  'yogurt 10%': 'strained yogurt 10%',
  'full fat greek yogurt': 'strained yogurt 10%',
  'sweet potato baked': 'sweet potato baked',
  'tuna in water': 'tuna canned in water',
  'turkey sandwich': 'turkey sandwich',
  'wheat bread': 'bread whole wheat',
  'blt': 'blt sandwich',
  'blt sandwich': 'blt sandwich',
  'cheeseburger': 'cheeseburger',
  'pepperoni pizza': 'pepperoni pizza',
  'mushroom risotto': 'mushroom risotto',
  'fish and chips': 'fish and chips',
  'chicken fajita': 'chicken fajitas',
  'chicken fajitas': 'chicken fajitas',
  'beef burrito': 'beef burrito',
  'grilled salmon with steamed broccoli': 'grilled salmon with steamed broccoli',
  'grilled salmon with broccoli': 'grilled salmon with steamed broccoli',
  'salmon with broccoli': 'grilled salmon with steamed broccoli',
  'halloumi and salad': 'halloumi and salad',
  'halloumi salad': 'halloumi salad',
  'χαλούμι σαλάτα': 'halloumi salad',
  'χαλουμι σαλατα': 'halloumi salad',
  'yogurt with honey': 'yogurt with honey',
  'γιαούρτι με μέλι': 'yogurt with honey',
  'γιαουρτι με μελι': 'yogurt with honey',
  // FAGE branded entries — force exact DB match
  'fage total 2% με μέλι': 'fage total 2 greek yogurt with honey',
  'fage total 2% me meli': 'fage total 2 greek yogurt with honey',
  'fage total 2% with honey': 'fage total 2 greek yogurt with honey',
  'fage total 2% yogurt with honey': 'fage total 2 greek yogurt with honey',
  'fage total 2 with honey': 'fage total 2 greek yogurt with honey',
  'fage yogurt with honey': 'fage total 2 greek yogurt with honey',
  'fage with honey': 'fage total 2 greek yogurt with honey',
  'fage 2%': 'fage total 2 greek yogurt with honey',
  'fage': 'fage total 2 greek yogurt with honey',
  // FAGE WITHOUT honey — LLM sometimes drops "με μέλι" from extraction
  'fage total 2% greek yogurt': 'fage total 2 greek yogurt with honey',
  'fage total 2 greek yogurt': 'fage total 2 greek yogurt with honey',
  'fage total 2%': 'fage total 2 greek yogurt with honey',
  'fage greek yogurt': 'fage total 2 greek yogurt with honey',
  'frijoles and rice': 'frijoles and rice',
  'frijoles con arroz': 'frijoles and rice',
  'frijoles rice': 'frijoles and rice',
  'arroz con frijoles': 'frijoles and rice',
  'souvlaki': 'souvlaki pork pita',
  'σουβλάκι χοιρινό πίτα': 'souvlaki pork pita',
  'σουβλακι χοιρινο πιτα': 'souvlaki pork pita',
  'σουβλάκι χοιρινό με πίτα': 'souvlaki pork pita',
  'σουβλακι χοιρινο με πιτα': 'souvlaki pork pita',
  'σουβλάκι κοτόπουλο πίτα': 'souvlaki chicken pita',
  'σουβλακι κοτοπουλο πιτα': 'souvlaki chicken pita',
  'σουβλάκι κοτόπουλο με πίτα': 'souvlaki chicken pita',
  'γύρο χοιρινό': 'gyros pork pita',
  'γυρο χοιρινο': 'gyros pork pita',
  'γύρο χοιρινό πίτα': 'gyros pork pita',
  'empanadas guacamole': 'empanadas with guacamole',
  'empanadas with guacamole': 'empanadas with guacamole',
  'empanadas con guacamole': 'empanadas with guacamole',

  // ── French ──
  'poulet': 'chicken breast',
  'poulet grillé': 'chicken breast grilled',
  'poulet rôti': 'chicken roasted',
  'blanc de poulet': 'chicken breast',
  'cuisse de poulet': 'chicken thigh',
  'riz': 'rice white',
  'riz blanc': 'rice white',
  'riz complet': 'rice brown',
  'riz basmati': 'rice basmati',
  'pain': 'bread white',
  'pain blanc': 'bread white',
  'pain complet': 'bread whole wheat',
  'pain de mie': 'bread white sandwich',
  'baguette': 'bread french baguette',
  'pain au chocolat': 'chocolate croissant',
  'brioche': 'brioche bread',
  'fromage': 'cheese',
  'fromage blanc': 'fromage blanc',
  'fromage de chèvre': 'goat cheese',
  'camembert': 'camembert cheese',
  'brie': 'brie cheese',
  'comté': 'comte cheese',
  'emmental': 'emmental cheese',
  'gruyère': 'gruyere cheese',
  'oeuf': 'egg whole raw',
  'oeuf dur': 'egg hard boiled',
  'oeuf au plat': 'egg fried',
  'oeufs brouillés': 'eggs scrambled',
  'lait': 'milk whole',
  'lait entier': 'milk whole',
  'lait demi-écrémé': 'milk 2%',
  'lait écrémé': 'milk skim',
  'beurre': 'butter unsalted',
  'beurre doux': 'butter unsalted',
  'crème fraîche': 'sour cream',
  'yaourt': 'yogurt plain',
  'yaourt nature': 'yogurt plain',
  'yaourt grec': 'strained yogurt 10%',
  'boeuf': 'beef',
  'steak haché': 'ground beef',
  'entrecôte': 'beef ribeye steak',
  'filet de boeuf': 'beef tenderloin',
  'porc': 'pork',
  'côte de porc': 'pork chop',
  'jambon': 'ham',
  'jambon blanc': 'ham deli',
  'jambon cru': 'prosciutto',
  'saucisson': 'salami',
  'saumon': 'salmon atlantic',
  'saumon fumé': 'salmon chinook smoked',
  'saumon fume': 'salmon chinook smoked',
  'smoked salmon': 'salmon chinook smoked',
  'thon': 'tuna',
  'cabillaud': 'cod atlantic',
  'crevettes': 'shrimp',
  'moules': 'mussels',
  'pomme de terre': 'potato',
  'pommes de terre': 'potato',
  'frites': 'french fries',
  'purée': 'mashed potato',
  'haricots verts': 'green beans',
  'petits pois': 'peas green',
  'courgette': 'zucchini',
  'aubergine': 'eggplant',
  'poivron': 'bell pepper',
  'carotte': 'carrot',
  'carottes': 'carrot',
  'tomates': 'tomato',
  'oignon': 'onion',
  'ail': 'garlic',
  'pomme': 'apple',
  'poire': 'pear',
  'banane': 'banana',
  'fraise': 'strawberry',
  'fraises': 'strawberry',
  'raisin': 'grape',
  'raisins': 'grape',
  'huile d\'olive': 'olive oil',
  'huile de tournesol': 'sunflower oil',
  'pâtes': 'pasta',
  'nouilles': 'noodles',
  'lentilles': 'lentils',
  'pois chiches': 'chickpeas',
  'amandes': 'almonds',
  'noix': 'walnuts',
  'noisettes': 'hazelnuts',
  'tartine': 'baguette',
  'tartine beurrée': 'bread with butter',
  // Triage 2026-06-11: failing-case corrections (workflow-verified)
  'pupusa de queso': 'pupusas con queso',
  'pupusa with cheese': 'pupusas con queso',
  'pierogi': 'dumpling potato cheese filled',
  'pierogi ruskie': 'dumpling potato cheese filled',
  'granola': 'granola homemade',
  'café au lait': 'coffee with milk',
  'thé': 'tea brewed',
  'jus d\'orange': 'orange juice',
  'vin rouge': 'wine table red',
  'vin blanc': 'wine table white',
  'red wine': 'wine table red',
  'white wine': 'wine table white',
  'limonade': 'lemonade flavor drink prepared with water',
  'lemonade': 'lemonade flavor drink prepared with water',
  'bière': 'beer',
  'biere': 'beer',
  'café crème': 'cafe creme',
  'cafe creme': 'cafe creme',
  'jus d\'orange pressé': 'orange juice fresh squeezed',
  'jus de pomme': 'apple juice',
  'jus de fruits': 'fruit juice',
  'smoothie banane-fraise': 'banana strawberry smoothie',
  'smoothie banane fraise': 'banana strawberry smoothie',
  'eau': 'water',
  // French composite dishes
  'croque-monsieur': 'croque monsieur',
  'croque monsieur': 'croque monsieur',
  'quiche lorraine': 'quiche lorraine',
  'quiche': 'quiche lorraine',
  'ratatouille': 'ratatouille',
  'gratin dauphinois': 'potato gratin',
  'soupe à l\'oignon': 'french onion soup',
  'salade niçoise': 'salad nicoise',
  'salade nicoise': 'salad nicoise',
  'crêpe': 'crepe',
  'crêpe complète': 'crepe ham cheese egg',
  'galette': 'buckwheat crepe',
  'galette complète': 'buckwheat crepe ham cheese egg',
  'cassoulet': 'cassoulet',
  'pot-au-feu': 'pot au feu',
  'blanquette de veau': 'veal blanquette',
  'boeuf bourguignon': 'beef bourguignon',
  'coq au vin': 'coq au vin',
  'tartiflette': 'tartiflette',
  'bouillabaisse': 'bouillabaisse',
  'steak-frites': 'steak with french fries',
  'steak frites': 'steak with french fries',
  'crème brûlée': 'creme brulee',
  'mousse au chocolat': 'chocolate mousse',
  'tarte aux pommes': 'apple tart',
  'éclair au chocolat': 'chocolate eclair',
  'mille-feuille': 'mille feuille',

  // ── Italian food (CREA DB) ──
  'prosciutto': 'prosciutto crudo',
  'prosciutto crudo': 'prosciutto crudo DOP di Parma',
  'prosciutto cotto': 'prosciutto cotto',
  'mortadella': 'mortadella Bologna',
  'parmigiano': 'Parmigiano Reggiano DOP',
  'parmigiano reggiano': 'Parmigiano Reggiano DOP',
  'grana padano': 'Grana Padano DOP',
  'mozzarella': 'mozzarella di vacca',
  'mozzarella di bufala': 'mozzarella di bufala',
  'burrata': 'mozzarella di bufala',
  'ricotta': 'ricotta di vacca',
  'mascarpone': 'mascarpone',
  'gorgonzola': 'gorgonzola',
  'pecorino': 'pecorino',
  'fontina': 'fontina',
  'taleggio': 'taleggio',
  'risotto': 'riso brillato cotto',
  'gnocchi': 'gnocchi di patate cotti',
  'tortellini': 'tortellini freschi cotti',
  'ravioli': 'ravioli cotti',
  'polenta': 'polenta cotta',
  'focaccia': 'pizza bianca',
  'grissini': 'grissini',
  'panettone': 'panettone',
  'tiramisu': 'mascarpone',
  'tiramisù': 'mascarpone',
  'bresaola': 'bresaola della Valtellina',
  'speck': 'speck Alto Adige',
  'salame': 'salame Milano',
  'pancetta': 'pancetta tesa',
  'coppa': 'coppa',
  'salsiccia': 'salsiccia di suino fresca',
  'cotechino': 'cotechino Modena cotto',
  'pesto': 'pesto alla genovese',
  'ragù': 'ragù alla bolognese',
  'ragu': 'ragù alla bolognese',
  'carbonara': 'pasta alla carbonara',
  'amatriciana': 'pasta alla amatriciana',
  'cacio e pepe': 'pasta cacio e pepe',
  'arancini': 'riso brillato cotto',
  'bruschetta': 'pane bianco',
  'minestrone': 'minestrone cotto',
  'ribollita': 'minestrone cotto',
  'ossobuco': 'vitello filetto crudo',
  'saltimbocca': 'vitello filetto crudo',
  'carpaccio': 'bovino adulto filetto crudo',
  'vitello tonnato': 'vitello filetto crudo',
  'panna cotta': 'panna da cucina',
  'cannoli': 'cannoli alla crema',
  'gelato': 'gelato confezionato vaniglia',
  'espresso': 'caffè tostato',
  'cappuccino italiano': 'caffè tostato',
  'prosecco': 'spumante',
  'limoncello': 'liquori da dessert',
  'grappa': 'grappa',
  'acciuga': 'acciuga o alice',
  'sardina': 'sardine',
  'tonno': 'tonno',
  'orata': 'orata filetti',
  'branzino': 'spigola',
  'spigola': 'spigola',
  'calamari': 'calamaro',
  'polpo': 'polpo',
  'vongole': 'vongola',
  'cozze': 'cozza o mitilo',
};

export function correctFoodName(name: string): string {
  if (!name || typeof name !== 'string') return name ?? '';
  const lower = name.toLowerCase().trim();
  // Exact match first — safest path
  if (FOOD_NAME_CORRECTIONS[lower]) return FOOD_NAME_CORRECTIONS[lower];

  // For multi-word inputs (2-4 words), try progressively shorter prefixes.
  // Handles code-switch like "σουβλάκι χοιρινό" where "σουβλάκι" is in the map.
  // Only activates for non-ASCII first tokens to avoid corrupting English phrases.
  const tokens = lower.split(/\s+/);
  if (tokens.length >= 2 && tokens.length <= 4 && /[\u0370-\u03ff\u0400-\u04ff\u00c0-\u024f\u1e00-\u1eff]/.test(tokens[0])) {
    for (let len = tokens.length - 1; len >= 1; len--) {
      const prefix = tokens.slice(0, len).join(' ');
      if (FOOD_NAME_CORRECTIONS[prefix]) return FOOD_NAME_CORRECTIONS[prefix];
    }
  }

  return name;
}

export async function lookupFood(input: LookupInput): Promise<LookupResult | null> {
  const region = input.region ?? 'GR';
  const hasEmbedding = (input.queryEmbedding?.length ?? 0) === 1024;
  const correctedFoodName = correctFoodName(input.foodName);
  const correctedUnit = correctedFoodName.toLowerCase().includes('protein powder') &&
    ['cup', 'serving', 'glass'].includes(input.unit.toLowerCase().trim())
    ? 'scoop'
    : correctedFoodName.toLowerCase().includes('feta') &&
      ['serving', 'piece'].includes(input.unit.toLowerCase().trim())
      ? 'slice'
      : input.unit;

  // Stage 1: Parallel dual retrieval (BM25 arm + vector arm simultaneously)
  const [bm25Results, vectorResults] = await Promise.all([
    keywordCandidates(correctedFoodName),
    hasEmbedding ? vectorSearch(input.queryEmbedding!) : Promise.resolve([] as SelectFood[]),
  ]);

  if (bm25Results.length === 0 && vectorResults.length === 0) return null;

  // Stage 2: RRF merge — cross-lingual queries benefit here:
  // if BM25 returns nothing for "φέτα", vector arm still finds "feta cheese"
  let candidates: SelectFood[];
  if (hasEmbedding) {
    candidates = rrfMerge(vectorResults, bm25Results);
  } else {
    // No embedding provided — use BM25 results directly
    candidates = bm25Results;
  }

  if (candidates.length === 0) return null;

  // Stage 3: metadata boost (use corrected name for scoring)
  const ranked = metadataBoost(candidates, region, correctedFoodName);
  if (ranked.length === 0) return null;

  const food = ranked[0];
  const normalizedQuery = normalizeLexicalName(correctedFoodName);
  const normalizedTopName = normalizeLexicalName(food.nameEn);

  // ── Weak-match rejection gate ──────────────────────────────────────────────
  // If the top result shares zero meaningful tokens with the query, it's likely
  // a false match from semantic similarity (e.g. "tahini" matching "sesame seeds").
  // Reject and let the pipeline fall through to decompose/LLM fallback.
  const queryTokens = normalizedQuery.split(' ').filter(t => t.length >= 3);
  const topNameTokens = normalizedTopName.split(' ').filter(t => t.length >= 3);
  const sharedTokens = queryTokens.filter(qt =>
    topNameTokens.some(nt => nt === qt || nt.startsWith(qt) || qt.startsWith(nt))
  );
  // Reject when: multi-token query has zero overlap with top name, AND
  // no exact/prefix match, AND no canonical key match
  if (
    queryTokens.length >= 2 &&
    sharedTokens.length === 0 &&
    !food.canonicalFoodKey?.toLowerCase().split(/[_-]+/).some(t => queryTokens.includes(t))
  ) {
    return null;
  }

  // Existing fast-food single-token rejection
  if (
    normalizedQuery.split(' ').length === 1 &&
    /mcmuffin|sandwich|burger|burrito|pizza|breakfast/.test(normalizedTopName) &&
    !/mcmuffin|sandwich|burger|burrito|pizza|breakfast/.test(normalizedQuery)
  ) {
    return null;
  }

  // Unit resolution (pass canonicalFoodKey for beverage override logic)
  const conversion = await resolveUnit(
    food.id,
    correctedUnit,
    input.qualifier,
    food.canonicalFoodKey || food.nameEn,
  );
  const gramsPerUnit = conversion?.gramsPerUnit ?? food.defaultServingGrams ?? 100;

  return {
    food,
    conversionId:  conversion?.id ?? null,
    gramsPerUnit,
    gramsTotal: (qty: number) => qty * gramsPerUnit,
    macros: (qty: number) => {
      const grams = qty * gramsPerUnit;
      const factor = grams / 100;
      return {
        kcal:    Math.round(food.kcalPer100g    * factor * 10) / 10,
        protein: Math.round(food.proteinPer100g * factor * 10) / 10,
        carb:    Math.round(food.carbPer100g    * factor * 10) / 10,
        fat:     Math.round(food.fatPer100g     * factor * 10) / 10,
        fiber:   food.fiberPer100g != null
          ? Math.round(food.fiberPer100g * factor * 10) / 10
          : null,
      };
    },
  };
}

/**
 * Batch lookup — resolve multiple items from a parsed meal.
 * Runs sequentially to avoid hammering the DB (kNN per item).
 */
export async function lookupFoodBatch(
  items: LookupInput[],
): Promise<Array<LookupResult | null>> {
  const results: Array<LookupResult | null> = [];
  for (const item of items) {
    results.push(await lookupFood(item));
  }
  return results;
}

// ── RAG pre-search: lightweight DB context for LLM prompt ──────────────────
//
// Before the LLM call, do a quick BM25 search and return top-3 matches
// with per-100g macros. Injected into the user message so the LLM has
// reference anchors instead of guessing blind.
// DietAI24 showed 63% MAE reduction with this pattern.

export interface RagMatch {
  name: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function ragPreSearch(foodText: string, limit = 3): Promise<RagMatch[]> {
  if (!foodText || foodText.length < 2) return [];

  try {
    const corrected = correctFoodName(foodText);
    let candidates = await keywordCandidates(corrected);
    if (candidates.length === 0) return [];

    // Exclude specialty preparations the user didn't ask for — a RAG line like
    // "Salmon, sockeye, smoked (Alaska Native), 345 kcal" (dried fish) steers
    // the LLM to adopt it verbatim for ordinary "smoked salmon".
    const specialty = /(alaska native|dried|dehydrated|powder|concentrate|freeze.?dried|canned)/i;
    const queryMentions = (w: string) => corrected.toLowerCase().includes(w);
    const filtered = candidates.filter(f => {
      const m = (f.nameEn ?? '').match(specialty);
      return !m || queryMentions(m[0].toLowerCase().split(' ')[0]);
    });
    if (filtered.length > 0) candidates = filtered;

    return candidates.slice(0, limit).map(f => ({
      name: f.nameEn ?? 'unknown',
      kcal: f.kcalPer100g ?? 0,
      protein: f.proteinPer100g ?? 0,
      carbs: f.carbPer100g ?? 0,
      fat: f.fatPer100g ?? 0,
    }));
  } catch {
    return []; // non-critical — LLM works without it
  }
}

export function formatRagContext(matches: RagMatch[]): string {
  if (matches.length === 0) return '';
  const lines = matches.map(m =>
    `  - ${m.name}: ${m.kcal} kcal, ${m.protein}g protein, ${m.carbs}g carbs, ${m.fat}g fat (per 100g)`
  );
  return `\n\nREFERENCE DATA from our nutrition database (per 100g):\n${lines.join('\n')}\nUse these as anchors when estimating. If a reference closely matches the food, prefer its values.`;
}
