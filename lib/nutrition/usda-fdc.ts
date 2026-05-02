/**
 * lib/nutrition/usda-fdc.ts — USDA FoodData Central API client.
 *
 * Typed, rate-aware, on-disk cached. Used by ingest scripts and
 * future food-matching pipelines to fetch real macro data from
 * the authoritative US food database.
 *
 * API docs: https://fdc.nal.usda.gov/api-guide
 * Rate limits: 1,000 requests/hour per IP, 10,000/day per key.
 * Cache: .cache/usda-fdc/<fdcId>.json — 30-day TTL.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface USDAFoodNutrient {
  nutrientId: number;
  nutrientName: string;
  nutrientNumber: string;
  unitName: string;
  value: number;
}

export interface USDAFoodSearchResult {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  ingredients?: string;
  foodNutrients: USDAFoodNutrient[];
  foodMeasures?: Array<{
    disseminationText: string;
    gramWeight: number;
    measureUnitName: string;
    rank: number;
  }>;
}

export interface USDAFoodDetail {
  fdcId: number;
  description: string;
  dataType: string;
  foodClass: string;
  foodNutrients: Array<{
    nutrient: {
      id: number;
      number: string;
      name: string;
      unitName: string;
    };
    amount?: number;
  }>;
  foodPortions?: Array<{
    id: number;
    gramWeight: number;
    amount: number;
    measureUnit?: { name: string; abbreviation: string };
    modifier?: string;
    portionDescription?: string;
    sequenceNumber?: number;
  }>;
}

export interface Macros {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
}

export interface ServingInfo {
  unit: string;
  grams: number;
  source: string;
}

// ── USDA nutrient number → macro mapping ────────────────────────────────────
// These are standard USDA nutrient numbers used across all FDC datasets.
const NUTRIENT_MAP: Record<string, keyof Macros> = {
  '208': 'calories',     // Energy (kcal)
  '203': 'protein_g',    // Protein
  '205': 'carbs_g',      // Carbohydrate, by difference
  '204': 'fat_g',        // Total lipid (fat)
  '291': 'fiber_g',      // Fiber, total dietary
  '269': 'sugar_g',      // Sugars, total
};

// ── Data type preference (USDA documents this hierarchy) ────────────────────
const DATA_TYPE_RANK: Record<string, number> = {
  'Foundation':         1,
  'SR Legacy':          2,
  'Survey (FNDDS)':     3,
  'Branded':            4,
  'Experimental':       5,
};

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'https://api.nal.usda.gov/fdc/v1';
const CACHE_DIR = join(process.cwd(), '.cache', 'usda-fdc');
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getApiKey(): string {
  const key = process.env.USDA_FDC_API_KEY;
  if (!key) {
    throw new Error(
      '[usda-fdc] USDA_FDC_API_KEY not set. Get a free key at https://fdc.nal.usda.gov/api-key-signup'
    );
  }
  return key;
}

// ── Cache helpers ───────────────────────────────────────────────────────────

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function getCached<T>(key: string): T | null {
  const path = join(CACHE_DIR, `${key}.json`);
  if (!existsSync(path)) return null;

  const stat = statSync(path);
  if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function setCache(key: string, data: unknown): void {
  ensureCacheDir();
  writeFileSync(join(CACHE_DIR, `${key}.json`), JSON.stringify(data, null, 2));
}

// ── Rate limiting (simple token bucket) ─────────────────────────────────────
let lastRequestMs = 0;
const MIN_INTERVAL_MS = 100; // max 10 req/s to stay well under 1000/hour

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL_MS - (now - lastRequestMs));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  lastRequestMs = Date.now();

  const res = await fetch(url);
  if (res.status === 429) {
    throw new Error('[usda-fdc] Rate limited (HTTP 429). Wait and retry.');
  }
  if (!res.ok) {
    throw new Error(`[usda-fdc] HTTP ${res.status}: ${await res.text()}`);
  }
  return res;
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Search USDA FDC for foods by name.
 * Results are sorted by data type preference (Foundation > SR Legacy > ...).
 */
export async function searchFood(
  query: string,
  limit: number = 10,
): Promise<USDAFoodSearchResult[]> {
  const cacheKey = `search_${query.replace(/[^a-z0-9]/gi, '_')}_${limit}`;
  const cached = getCached<USDAFoodSearchResult[]>(cacheKey);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = `${API_BASE}/foods/search?query=${encodeURIComponent(query)}&pageSize=${limit}&api_key=${apiKey}`;
  const res = await rateLimitedFetch(url);
  const data = await res.json() as { foods: USDAFoodSearchResult[] };

  // Sort by data type preference
  const sorted = data.foods.sort((a, b) => {
    const rankA = DATA_TYPE_RANK[a.dataType] ?? 99;
    const rankB = DATA_TYPE_RANK[b.dataType] ?? 99;
    return rankA - rankB;
  });

  setCache(cacheKey, sorted);
  return sorted;
}

/**
 * Get detailed food info by FDC ID (includes portions).
 */
export async function getFoodByFdcId(fdcId: number): Promise<USDAFoodDetail | null> {
  const cacheKey = `detail_${fdcId}`;
  const cached = getCached<USDAFoodDetail>(cacheKey);
  if (cached) return cached;

  const apiKey = getApiKey();
  const url = `${API_BASE}/food/${fdcId}?api_key=${apiKey}`;

  try {
    const res = await rateLimitedFetch(url);
    const data = await res.json() as USDAFoodDetail;
    setCache(cacheKey, data);
    return data;
  } catch {
    return null;
  }
}

/**
 * Extract macros per 100g from a food detail response.
 */
export function getMacrosFromFood(food: USDAFoodDetail): Macros {
  const macros: Macros = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: null,
    sugar_g: null,
  };

  for (const fn of food.foodNutrients) {
    const key = NUTRIENT_MAP[fn.nutrient.number];
    if (key && fn.amount != null) {
      (macros as unknown as Record<string, number | null>)[key] = fn.amount;
    }
  }

  return macros;
}

/**
 * Extract macros from a search result (uses the flattened nutrient format).
 */
export function getMacrosFromSearchResult(food: USDAFoodSearchResult): Macros {
  const macros: Macros = {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    fiber_g: null,
    sugar_g: null,
  };

  for (const fn of food.foodNutrients) {
    const key = NUTRIENT_MAP[fn.nutrientNumber];
    if (key && fn.value != null) {
      (macros as unknown as Record<string, number | null>)[key] = fn.value;
    }
  }

  return macros;
}

/**
 * Extract serving/portion sizes from a food detail response.
 */
export function getServingsFromFood(food: USDAFoodDetail): ServingInfo[] {
  if (!food.foodPortions?.length) return [];

  return food.foodPortions
    .filter(p => p.gramWeight > 0)
    .map(p => ({
      unit: p.portionDescription
        ?? p.measureUnit?.name
        ?? p.modifier
        ?? `${p.amount} serving`,
      grams: p.gramWeight,
      source: `USDA FDC ${food.fdcId}`,
    }));
}

/**
 * Data type rank for sorting/preference decisions.
 */
export function getDataTypeRank(dataType: string): number {
  return DATA_TYPE_RANK[dataType] ?? 99;
}
