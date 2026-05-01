/**
 * scripts/ingest/usda.ts — USDA FoodData Central ingest.
 *
 * Pulls FoundationFoods + SR Legacy from the FDC API (~7,800 rows combined).
 * Idempotent: uses ON CONFLICT DO NOTHING on (source, source_id).
 * Resumable: tracks last offset in /tmp/usda-ingest-checkpoint.json.
 *
 * Usage:
 *   npx tsx scripts/ingest/usda.ts
 *   USDA_API_KEY=DEMO_KEY npx tsx scripts/ingest/usda.ts   # rate-limited
 *
 * FDC free tier: 3,600 req/hr with a key. DEMO_KEY allows limited testing.
 * Get a free key: https://fdc.nal.usda.gov/api-key-signup.html
 *
 * Data types ingested:
 *   - FoundationFoods  → data_quality = 'lab_verified'
 *   - SR Legacy        → data_quality = 'label'
 *
 * Nutrient IDs (FDC canonical):
 *   1008 = Energy (kcal)
 *   1003 = Protein
 *   1005 = Carbohydrates by difference
 *   1004 = Total lipid (fat)
 *   1079 = Fiber, total dietary
 *   2000 = Sugars, total
 *   1093 = Sodium, Na (mg)
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ─────────────────────────────────────────────────────────────────
const FDC_API_KEY = process.env.USDA_API_KEY || process.env.FDC_API_KEY || 'DEMO_KEY';
const FDC_BASE    = 'https://api.nal.usda.gov/fdc/v1';
const PAGE_SIZE   = 200; // max allowed by FDC API
const CHECKPOINT  = '/tmp/usda-ingest-checkpoint.json';

const DATA_TYPES: Array<{ type: string; quality: 'lab_verified' | 'label' }> = [
  { type: 'Foundation', quality: 'lab_verified' },
  { type: 'SR Legacy',  quality: 'label' },
];

// ── Nutrient extraction helpers ─────────────────────────────────────────────
const NUTRIENT_IDS = {
  kcal:    1008,
  protein: 1003,
  carb:    1005,
  fat:     1004,
  fiber:   1079,
  sugar:   2000,
  sodium:  1093,
} as const;

interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  gtinUpc?: string;
  foodNutrients?: Array<{ nutrientId: number; nutrientNumber?: string; value: number }>;
  foodCategory?: { description: string };
}

function getNutrient(food: FdcFood, id: number): number | null {
  const n = food.foodNutrients?.find((fn) => fn.nutrientId === id);
  return n ? n.value : null;
}

function normalizeRow(food: FdcFood, quality: 'lab_verified' | 'label') {
  const kcal    = getNutrient(food, NUTRIENT_IDS.kcal);
  const protein = getNutrient(food, NUTRIENT_IDS.protein);
  const carb    = getNutrient(food, NUTRIENT_IDS.carb);
  const fat     = getNutrient(food, NUTRIENT_IDS.fat);

  // Skip rows with missing core macros (FDC has sparse entries)
  if (kcal == null || protein == null || carb == null || fat == null) return null;

  return {
    source:            'usda' as const,
    sourceId:          String(food.fdcId),
    sourceUrl:         `https://fdc.nal.usda.gov/food-details/${food.fdcId}/nutrients`,
    dataQuality:       quality,
    nameEn:            food.description.trim(),
    brand:             food.brandOwner ?? null,
    barcode:           food.gtinUpc ?? null,
    region:            ['US'],
    kcalPer100g:       kcal,
    proteinPer100g:    protein,
    carbPer100g:       carb,
    fatPer100g:        fat,
    fiberPer100g:      getNutrient(food, NUTRIENT_IDS.fiber),
    sugarPer100g:      getNutrient(food, NUTRIENT_IDS.sugar),
    sodiumMg:          getNutrient(food, NUTRIENT_IDS.sodium),
    micronutrients:    null,
    defaultServingGrams: 100,
    defaultServingUnit:  '100g',
    popularity:        0,
  };
}

// ── Checkpoint helpers ──────────────────────────────────────────────────────
interface Checkpoint {
  dataType: string;
  pageNumber: number;
  totalInserted: number;
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
  try { fs.unlinkSync(CHECKPOINT); } catch {}
}

// ── FDC API fetcher ─────────────────────────────────────────────────────────
async function fetchPage(dataType: string, pageNumber: number): Promise<{ foods: FdcFood[]; totalHits: number }> {
  const url = `${FDC_BASE}/foods/search?` + new URLSearchParams({
    query:       '*',
    dataType:    dataType,
    pageSize:    String(PAGE_SIZE),
    pageNumber:  String(pageNumber),
    api_key:     FDC_API_KEY,
    // Request full nutrient data
    nutrients:   Object.values(NUTRIENT_IDS).join(','),
  });

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`FDC API error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return { foods: data.foods ?? [], totalHits: data.totalHits ?? 0 };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://brain_user:${process.env.PGPASSWORD || 'jDehquqo1Dj0plzyrmaX2ybtzvjeKdFF'}@127.0.0.1:5433/trophe_dev`,
    max: 5,
  });
  const db = drizzle(pool);

  const checkpoint = loadCheckpoint();
  let totalInserted = checkpoint?.totalInserted ?? 0;

  console.log(`[usda] Starting ingest. FDC key: ${FDC_API_KEY === 'DEMO_KEY' ? '⚠️  DEMO_KEY (rate-limited)' : '✅ custom key'}`);
  if (checkpoint) {
    console.log(`[usda] Resuming from checkpoint: dataType=${checkpoint.dataType} page=${checkpoint.pageNumber}`);
  }

  for (const { type, quality } of DATA_TYPES) {
    // Skip to checkpoint data type
    if (checkpoint && checkpoint.dataType !== type && totalInserted > 0) {
      const alreadyDone = DATA_TYPES.findIndex(d => d.type === type) <
                          DATA_TYPES.findIndex(d => d.type === checkpoint.dataType);
      if (alreadyDone) {
        console.log(`[usda] Skipping ${type} (already processed)`);
        continue;
      }
    }

    console.log(`\n[usda] → Ingesting ${type} (quality: ${quality})`);
    let pageNumber = (checkpoint?.dataType === type) ? checkpoint.pageNumber : 1;
    let totalPages = 1;

    do {
      try {
        const { foods: fdcFoods, totalHits } = await fetchPage(type, pageNumber);
        totalPages = Math.ceil(totalHits / PAGE_SIZE);

        if (fdcFoods.length === 0) break;

        const rows = fdcFoods.map(f => normalizeRow(f, quality)).filter(Boolean) as ReturnType<typeof normalizeRow>[];

        if (rows.length > 0) {
          // Batch insert with ON CONFLICT DO NOTHING (idempotent)
          await db.insert(foods).values(rows as typeof foods.$inferInsert[]).onConflictDoNothing();
          totalInserted += rows.length;
        }

        const skipped = fdcFoods.length - rows.length;
        console.log(
          `[usda]   page ${pageNumber}/${totalPages} → ${rows.length} inserted, ${skipped} skipped (missing macros). Total: ${totalInserted}`
        );

        saveCheckpoint({ dataType: type, pageNumber: pageNumber + 1, totalInserted });
        pageNumber++;

        // Polite rate limiting — FDC free tier allows ~1 req/sec without a key
        if (FDC_API_KEY === 'DEMO_KEY') await sleep(1100);
        else await sleep(100);

      } catch (err) {
        console.error(`[usda] Error on page ${pageNumber}:`, err);
        console.error(`[usda] Checkpoint saved. Re-run to resume from page ${pageNumber}.`);
        await pool.end();
        process.exit(1);
      }
    } while (pageNumber <= totalPages);
  }

  clearCheckpoint();
  console.log(`\n[usda] ✅ Done. Total inserted: ${totalInserted}`);
  await pool.end();
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch((err) => { console.error(err); process.exit(1); });
