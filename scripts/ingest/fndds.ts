/**
 * scripts/ingest/fndds.ts — USDA FNDDS (Survey) composite dishes ingest.
 *
 * Pulls ~5,400 "foods as consumed" from FDC API — composite dishes like
 * "Pasta, cooked, with tomato sauce and meatballs" that map directly to
 * how users describe meals.
 *
 * Idempotent: uses ON CONFLICT DO NOTHING on (source, source_id).
 * Resumable: tracks last offset in /tmp/fndds-ingest-checkpoint.json.
 *
 * Also ingests portion/measure data (foodMeasures) as food_unit_conversions.
 *
 * Usage:
 *   npx tsx scripts/ingest/fndds.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';

// ── Config ─────────────────────────────────────────────────────────────────
const FDC_API_KEY = process.env.USDA_API_KEY || process.env.FDC_API_KEY || 'DEMO_KEY';
const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';
const PAGE_SIZE = 200;
const CHECKPOINT = '/tmp/fndds-ingest-checkpoint.json';

const NUTRIENT_IDS = {
  kcal: 1008,
  protein: 1003,
  carb: 1005,
  fat: 1004,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
} as const;

interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  foodCode?: number;
  foodCategory?: { description: string };
  foodNutrients?: Array<{ nutrientId: number; value: number }>;
  foodMeasures?: Array<{
    disseminationText?: string;
    gramWeight?: number;
    modifier?: string;
    rank?: number;
  }>;
}

function getNutrient(food: FdcFood, id: number): number | null {
  const n = food.foodNutrients?.find((fn) => fn.nutrientId === id);
  return n ? n.value : null;
}

// ── Dedup filter: skip foods that are too similar to existing USDA entries ──
// FNDDS names are like "Chicken breast, roasted" which may overlap with
// SR Legacy "Chicken, broilers or fryers, breast, meat only, cooked, roasted".
// We rely on ON CONFLICT DO NOTHING by sourceId, but also skip very generic
// single-ingredient names that are already well-covered.
const SKIP_PATTERNS = [
  /^Water,/i,
  /^Baby food/i,
  /^Babyfood/i,
  /^Infant formula/i,
];

function shouldSkip(description: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(description));
}

function normalizeRow(food: FdcFood) {
  if (shouldSkip(food.description)) return null;

  const kcal = getNutrient(food, NUTRIENT_IDS.kcal);
  const protein = getNutrient(food, NUTRIENT_IDS.protein);
  const carb = getNutrient(food, NUTRIENT_IDS.carb);
  const fat = getNutrient(food, NUTRIENT_IDS.fat);

  if (kcal == null || protein == null || carb == null || fat == null) return null;

  // Sanity: skip if macros don't roughly add up (protein+carb+fat > kcal/3)
  const macroKcal = protein * 4 + carb * 4 + fat * 9;
  if (macroKcal > kcal * 1.5 && kcal > 10) return null;

  // Extract default serving from foodMeasures
  const defaultMeasure = food.foodMeasures?.find(
    (m) => m.disseminationText?.toLowerCase().includes('quantity not specified')
  );
  const defaultGrams = defaultMeasure?.gramWeight ?? 100;

  return {
    source: 'usda' as const,
    sourceId: String(food.fdcId),
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
    dataQuality: 'lab_verified' as const,
    nameEn: food.description.trim(),
    brand: null,
    barcode: null,
    region: ['US'],
    kcalPer100g: kcal,
    proteinPer100g: protein,
    carbPer100g: carb,
    fatPer100g: fat,
    fiberPer100g: getNutrient(food, NUTRIENT_IDS.fiber),
    sugarPer100g: getNutrient(food, NUTRIENT_IDS.sugar),
    sodiumMg: getNutrient(food, NUTRIENT_IDS.sodium),
    micronutrients: null,
    defaultServingGrams: defaultGrams,
    defaultServingUnit: defaultGrams === 100 ? '100g' : 'serving',
    popularity: 0,
  };
}

// ── Extract unit conversions from foodMeasures ──────────────────────────────
interface UnitConversion {
  unit: string;
  grams: number;
}

const UNIT_MAP: Record<string, string> = {
  cup: 'cup',
  'fl oz': 'fl_oz',
  tablespoon: 'tablespoon',
  teaspoon: 'teaspoon',
  piece: 'piece',
  slice: 'slice',
  oz: 'oz',
  serving: 'serving',
  container: 'container',
  can: 'can',
  bottle: 'bottle',
  packet: 'packet',
  bar: 'bar',
  patty: 'patty',
  link: 'link',
  strip: 'strip',
  wing: 'wing',
  leg: 'leg',
  thigh: 'thigh',
  breast: 'breast',
  drumstick: 'drumstick',
  fillet: 'fillet',
};

function extractUnits(food: FdcFood): UnitConversion[] {
  if (!food.foodMeasures) return [];
  const units: UnitConversion[] = [];

  for (const m of food.foodMeasures) {
    if (!m.gramWeight || m.gramWeight <= 0) continue;
    const text = (m.disseminationText ?? '').toLowerCase();
    if (text.includes('quantity not specified')) continue;

    // Try to extract a known unit from the measure text
    for (const [keyword, unitName] of Object.entries(UNIT_MAP)) {
      if (text.includes(keyword)) {
        // Extract multiplier (e.g., "1 cup" vs "0.5 cup")
        const numMatch = text.match(/^([\d.]+)\s/);
        const multiplier = numMatch ? parseFloat(numMatch[1]) : 1;
        if (multiplier > 0) {
          units.push({
            unit: unitName,
            grams: Math.round(m.gramWeight / multiplier),
          });
        }
        break;
      }
    }
  }

  // Deduplicate by unit name (keep first)
  const seen = new Set<string>();
  return units.filter((u) => {
    if (seen.has(u.unit)) return false;
    seen.add(u.unit);
    return true;
  });
}

// ── Checkpoint helpers ──────────────────────────────────────────────────────
interface Checkpoint {
  pageNumber: number;
  totalInserted: number;
  totalUnits: number;
}

function loadCheckpoint(): Checkpoint | null {
  try {
    return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf-8'));
  } catch {
    return null;
  }
}

function saveCheckpoint(cp: Checkpoint) {
  fs.writeFileSync(CHECKPOINT, JSON.stringify(cp));
}

function clearCheckpoint() {
  try {
    fs.unlinkSync(CHECKPOINT);
  } catch {}
}

// ── FDC API fetcher ─────────────────────────────────────────────────────────
async function fetchPage(pageNumber: number): Promise<{ foods: FdcFood[]; totalHits: number }> {
  const url =
    `${FDC_BASE}/foods/search?` +
    new URLSearchParams({
      query: '*',
      dataType: 'Survey (FNDDS)',
      pageSize: String(PAGE_SIZE),
      pageNumber: String(pageNumber),
      api_key: FDC_API_KEY,
      nutrients: Object.values(NUTRIENT_IDS).join(','),
    });

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FDC API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { foods: data.foods ?? [], totalHits: data.totalHits ?? 0 };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required. See .env.local.example.');

  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  const checkpoint = loadCheckpoint();
  let pageNumber = checkpoint?.pageNumber ?? 1;
  let totalInserted = checkpoint?.totalInserted ?? 0;
  let totalUnits = checkpoint?.totalUnits ?? 0;
  let totalPages = 1;

  console.log(
    `[fndds] Starting FNDDS ingest. Key: ${FDC_API_KEY === 'DEMO_KEY' ? '⚠️  DEMO_KEY (rate-limited)' : '✅ custom'}`
  );
  if (checkpoint) {
    console.log(`[fndds] Resuming from page ${checkpoint.pageNumber}, ${totalInserted} already inserted`);
  }

  do {
    try {
      const { foods: fdcFoods, totalHits } = await fetchPage(pageNumber);
      totalPages = Math.ceil(totalHits / PAGE_SIZE);

      if (fdcFoods.length === 0) break;

      // Normalize and insert foods
      const rows = fdcFoods.map((f) => normalizeRow(f)).filter(Boolean) as NonNullable<
        ReturnType<typeof normalizeRow>
      >[];

      if (rows.length > 0) {
        const inserted = await db
          .insert(foods)
          .values(rows as typeof foods.$inferInsert[])
          .onConflictDoNothing()
          .returning({ id: foods.id, sourceId: foods.sourceId });

        totalInserted += inserted.length;

        // Insert unit conversions for newly inserted foods
        const insertedMap = new Map(inserted.map((r) => [r.sourceId, r.id]));

        for (const fdcFood of fdcFoods) {
          const foodId = insertedMap.get(String(fdcFood.fdcId));
          if (!foodId) continue;

          const units = extractUnits(fdcFood);
          if (units.length === 0) continue;

          const unitRows = units.map((u) => ({
            foodId,
            unit: u.unit,
            gramsPer_unit: u.grams,
            source: 'usda_fndds',
          }));

          try {
            await db
              .insert(foodUnitConversions)
              .values(
                unitRows.map((u) => ({
                  foodId: u.foodId,
                  unit: u.unit,
                  gramsPerUnit: u.gramsPer_unit,
                  source: u.source,
                }))
              )
              .onConflictDoNothing();
            totalUnits += unitRows.length;
          } catch {
            // Unit conversion insert can fail on schema mismatch — non-fatal
          }
        }
      }

      const skipped = fdcFoods.length - rows.length;
      console.log(
        `[fndds]   page ${pageNumber}/${totalPages} → ${rows.length} foods (${skipped} skipped). Total: ${totalInserted} foods, ${totalUnits} units`
      );

      saveCheckpoint({ pageNumber: pageNumber + 1, totalInserted, totalUnits });
      pageNumber++;

      // Rate limiting
      if (FDC_API_KEY === 'DEMO_KEY') await sleep(1100);
      else await sleep(100);
    } catch (err) {
      console.error(`[fndds] Error on page ${pageNumber}:`, err);
      console.error(`[fndds] Checkpoint saved. Re-run to resume.`);
      await pool.end();
      process.exit(1);
    }
  } while (pageNumber <= totalPages);

  clearCheckpoint();
  console.log(`\n[fndds] ✅ Done. ${totalInserted} foods, ${totalUnits} unit conversions inserted.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
