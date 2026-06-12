/**
 * scripts/ingest/fndds.ts — USDA FNDDS (Survey) composite dishes ingest.
 *
 * Reads ~5,400 "foods as consumed" from the FDC bulk JSON download.
 * These are composite dishes like "Pasta with tomato sauce and meatballs"
 * that map directly to how users describe meals.
 *
 * Data source: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip
 * Download and extract to data/fndds/surveyDownload.json before running.
 *
 * Idempotent: ON CONFLICT DO NOTHING on (source, source_id).
 * Also ingests portion data as food_unit_conversions.
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
import * as fs from 'fs';
import * as path from 'path';

const DATA_PATH = process.env.FNDDS_JSON
  || path.join(process.cwd(), 'data', 'fndds', 'surveyDownload.json');

const BATCH_SIZE = 100;

const NUTRIENT_IDS = {
  kcal: 1008,
  protein: 1003,
  carb: 1005,
  fat: 1004,
  fiber: 1079,
  sugar: 2000,
  sodium: 1093,
} as const;

interface SurveyFood {
  fdcId: number;
  description: string;
  foodCode?: number;
  foodNutrients: Array<{
    nutrient: { id: number };
    amount: number;
  }>;
  foodPortions?: Array<{
    portionDescription?: string;
    gramWeight?: number;
    modifier?: string;
  }>;
  wweiaFoodCategory?: { wweiaFoodCategoryDescription: string };
}

function getNutrient(food: SurveyFood, id: number): number | null {
  const n = food.foodNutrients?.find((fn) => fn.nutrient?.id === id);
  return n ? n.amount : null;
}

const SKIP_PATTERNS = [
  /^Water,/i,
  /^Baby food/i,
  /^Babyfood/i,
  /^Infant formula/i,
  /^Human milk/i,
  /^Milk, human/i,
];

function shouldSkip(description: string): boolean {
  return SKIP_PATTERNS.some((p) => p.test(description));
}

function normalizeRow(food: SurveyFood) {
  if (shouldSkip(food.description)) return null;

  const kcal = getNutrient(food, NUTRIENT_IDS.kcal);
  const protein = getNutrient(food, NUTRIENT_IDS.protein);
  const carb = getNutrient(food, NUTRIENT_IDS.carb);
  const fat = getNutrient(food, NUTRIENT_IDS.fat);

  if (kcal == null || protein == null || carb == null || fat == null) return null;

  const defaultPortion = food.foodPortions?.find(
    (p) => p.portionDescription?.toLowerCase().includes('quantity not specified')
  );
  const defaultGrams = defaultPortion?.gramWeight || 100;

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
    defaultServingGrams: defaultGrams > 0 ? defaultGrams : 100,
    defaultServingUnit: defaultGrams > 0 && defaultGrams !== 100 ? 'serving' : '100g',
    popularity: 0,
  };
}

// ── Extract unit conversions from portions ──────────────────────────────────
const UNIT_MAP: Record<string, string> = {
  cup: 'cup', 'fl oz': 'fl_oz', tablespoon: 'tablespoon',
  teaspoon: 'teaspoon', piece: 'piece', slice: 'slice',
  oz: 'oz', serving: 'serving', container: 'container',
  can: 'can', bottle: 'bottle', packet: 'packet', bar: 'bar',
  patty: 'patty', link: 'link', strip: 'strip', wing: 'wing',
  leg: 'leg', thigh: 'thigh', breast: 'breast', fillet: 'fillet',
  drumstick: 'drumstick', scoop: 'scoop', bowl: 'bowl',
};

interface UnitConversion { unit: string; grams: number }

function extractUnits(food: SurveyFood): UnitConversion[] {
  if (!food.foodPortions) return [];
  const units: UnitConversion[] = [];

  for (const p of food.foodPortions) {
    if (!p.gramWeight || p.gramWeight <= 0) continue;
    const text = (p.portionDescription ?? '').toLowerCase();
    if (text.includes('quantity not specified')) continue;

    for (const [keyword, unitName] of Object.entries(UNIT_MAP)) {
      if (text.includes(keyword)) {
        const numMatch = text.match(/^([\d.]+)\s/);
        const multiplier = numMatch ? parseFloat(numMatch[1]) : 1;
        if (multiplier > 0) {
          units.push({ unit: unitName, grams: Math.round(p.gramWeight / multiplier) });
        }
        break;
      }
    }
  }

  const seen = new Set<string>();
  return units.filter((u) => {
    if (seen.has(u.unit)) return false;
    seen.add(u.unit);
    return true;
  });
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required.');

  if (!fs.existsSync(DATA_PATH)) {
    console.error(`[fndds] Data file not found: ${DATA_PATH}`);
    console.error('[fndds] Download from: https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_survey_food_json_2024-10-31.zip');
    console.error('[fndds] Extract to data/fndds/surveyDownload.json');
    process.exit(1);
  }

  console.log(`[fndds] Loading ${DATA_PATH}...`);
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  const surveyFoods: SurveyFood[] = raw.SurveyFoods;
  console.log(`[fndds] ${surveyFoods.length} foods loaded from bulk JSON`);

  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  let totalInserted = 0;
  let totalUnits = 0;
  let totalSkipped = 0;

  // Process in batches
  for (let i = 0; i < surveyFoods.length; i += BATCH_SIZE) {
    const batch = surveyFoods.slice(i, i + BATCH_SIZE);
    const rows = batch.map((f) => normalizeRow(f)).filter(Boolean) as NonNullable<ReturnType<typeof normalizeRow>>[];
    totalSkipped += batch.length - rows.length;

    if (rows.length > 0) {
      const inserted = await db
        .insert(foods)
        .values(rows as typeof foods.$inferInsert[])
        .onConflictDoNothing()
        .returning({ id: foods.id, sourceId: foods.sourceId });

      totalInserted += inserted.length;

      // Insert unit conversions for newly inserted foods
      const insertedMap = new Map(inserted.map((r) => [r.sourceId, r.id]));

      for (const sf of batch) {
        const foodId = insertedMap.get(String(sf.fdcId));
        if (!foodId) continue;

        const units = extractUnits(sf);
        if (units.length === 0) continue;

        try {
          await db
            .insert(foodUnitConversions)
            .values(units.map((u) => ({
              foodId,
              unit: u.unit,
              gramsPerUnit: u.grams,
              source: 'usda_fndds',
            })))
            .onConflictDoNothing();
          totalUnits += units.length;
        } catch {
          // Non-fatal — log and continue
        }
      }
    }

    const page = Math.floor(i / BATCH_SIZE) + 1;
    const totalPages = Math.ceil(surveyFoods.length / BATCH_SIZE);
    if (page % 5 === 0 || page === totalPages) {
      console.log(
        `[fndds]   batch ${page}/${totalPages} — ${totalInserted} inserted, ${totalSkipped} skipped, ${totalUnits} units`
      );
    }
  }

  console.log(`\n[fndds] ✅ Done. ${totalInserted} foods, ${totalUnits} unit conversions. ${totalSkipped} skipped.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
