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
import { sql, and, eq, isNull } from 'drizzle-orm';

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
  // Tokenize input: split on spaces, clean, build tsquery
  const tokens = foodName
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
      sql`(name_en ILIKE ${exactishPattern} OR name_en ILIKE ${singularExactishPattern} OR name_en ILIKE ${pluralExactishPattern} OR name_el ILIKE ${exactishPattern})`
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
      sql`canonical_food_key IS NOT NULL AND (name_en ILIKE ${canonPattern} OR name_el ILIKE ${canonPattern})`
    )
    .limit(10);

  // If tsvector returned nothing, fall back to fuzzy ILIKE on name_en + name_el
  if (rows.length === 0) {
    const pattern = `%${tokens.join('%')}%`;
    const fuzzyRows = await db
      .select()
      .from(foods)
      .where(
        sql`(name_en ILIKE ${pattern} OR name_el ILIKE ${pattern})`
      )
      .limit(KEYWORD_LIMIT);
    return mergeUnique(exactishRows, mergeUnique(fuzzyRows, canonicalMatches));
  }

  return mergeUnique(exactishRows, mergeUnique(rows, canonicalMatches));
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
      (c.canonicalFoodKey ? 5 : 0) + // canonical foods have verified conversions
      (c.popularity ?? 0) * 0.01, // popularity is a small tie-breaker
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.map(s => s.food);
}

// ── Unit conversion lookup ────────────────────────────────────────────────────
async function resolveUnit(
  foodId: string,
  unit: string,
  qualifier?: string,
): Promise<{ id: string | null; gramsPerUnit: number } | null> {
  const normalizedUnit = unit.toLowerCase().trim();

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
export async function lookupFood(input: LookupInput): Promise<LookupResult | null> {
  const region = input.region ?? 'GR';
  const hasEmbedding = (input.queryEmbedding?.length ?? 0) === 1024;

  // Stage 1: Parallel dual retrieval (BM25 arm + vector arm simultaneously)
  const [bm25Results, vectorResults] = await Promise.all([
    keywordCandidates(input.foodName),
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

  // Stage 3: metadata boost
  const ranked = metadataBoost(candidates, region, input.foodName);
  if (ranked.length === 0) return null;

  const food = ranked[0];

  // Unit resolution
  const conversion = await resolveUnit(food.id, input.unit, input.qualifier);
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
