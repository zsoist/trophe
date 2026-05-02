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

  // Try plainto_tsquery first (tolerant), fall back to prefix match with ILIKE
  const tsQuery = tokens.map(t => `${t}:*`).join(' & ');

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

  // If tsvector returned nothing, fall back to fuzzy ILIKE on name_en + name_el
  if (rows.length === 0) {
    const pattern = `%${tokens.join('%')}%`;
    return db
      .select()
      .from(foods)
      .where(
        sql`(name_en ILIKE ${pattern} OR name_el ILIKE ${pattern})`
      )
      .limit(KEYWORD_LIMIT);
  }

  return rows;
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
function metadataBoost(candidates: SelectFood[], region: string): SelectFood[] {
  if (candidates.length <= 1) return candidates;

  // Score: quality weight + region match
  const qualityScore = (q: string) => ({ lab_verified: 3, label: 2, crowdsourced: 1, estimated: 0 }[q] ?? 0);
  const scored = candidates.map(c => ({
    food: c,
    score:
      qualityScore(c.dataQuality) +
      (c.region?.includes(region) ? 2 : 0) +
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
  const ranked = metadataBoost(candidates, region);
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
