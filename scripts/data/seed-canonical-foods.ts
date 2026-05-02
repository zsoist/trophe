/**
 * scripts/data/seed-canonical-foods.ts
 *
 * Seeds the 150 canonical foods from CANONICAL_FOODS into the DB.
 *
 * For each canonical food:
 *   1. Search USDA FDC API by query
 *   2. Pick best match per preferred data types
 *   3. Fetch full food detail (nutrients + portions)
 *   4. Check if this FDC ID already exists in DB (source='usda', source_id=fdcId)
 *   5. If exists → UPDATE with canonical_food_key + provenance columns
 *      If new    → INSERT with all fields
 *   6. UPSERT food_unit_conversions for each common_units entry
 *
 * Flags:
 *   --dry-run      Log what would be done, don't write to DB
 *   --emit-sql     Print idempotent SQL statements for production application
 *   --limit N      Only process first N foods (for testing)
 *
 * Usage:
 *   source ~/.local/secrets/usda.env
 *   DATABASE_URL="postgresql://brain_user:...@localhost:5433/trophe_dev" \
 *     npx tsx scripts/data/seed-canonical-foods.ts --dry-run
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and, sql } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';
import { foods } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { CANONICAL_FOODS, type CanonicalFood } from './canonical-foods-list';
import {
  searchFood,
  getFoodByFdcId,
  getMacrosFromFood,
  getMacrosFromSearchResult,
  getServingsFromFood,
  getDataTypeRank,
  type USDAFoodSearchResult,
  type USDAFoodDetail,
} from '../../lib/nutrition/usda-fdc';

// ── Deterministic UUID namespace for canonical foods ─────────────────────────
// UUID v5 namespace: "trophe.canonical.foods"
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'; // DNS namespace as base

function canonicalUUID(key: string): string {
  return uuidv5(`trophe.canonical.${key}`, NAMESPACE);
}

// ── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const EMIT_SQL = args.includes('--emit-sql');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── SQL output buffer (for --emit-sql) ──────────────────────────────────────
const sqlStatements: string[] = [];

function emitSQL(stmt: string) {
  sqlStatements.push(stmt);
}

function escapeSQL(val: string | null | undefined): string {
  if (val == null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

function escapeArray(arr: string[] | null | undefined): string {
  if (!arr?.length) return 'NULL';
  return `ARRAY[${arr.map(s => escapeSQL(s)).join(',')}]`;
}

// ── Pick best USDA match ────────────────────────────────────────────────────
function pickBestMatch(
  results: USDAFoodSearchResult[],
  food: CanonicalFood
): USDAFoodSearchResult | null {
  if (!results.length) return null;

  // Score each result by data type preference
  const scored = results.map(r => {
    const typeIdx = food.preferredTypes.indexOf(r.dataType);
    const typeScore = typeIdx >= 0 ? (food.preferredTypes.length - typeIdx) * 10 : 0;
    const rankScore = 10 - getDataTypeRank(r.dataType); // Foundation=9, SR Legacy=8, etc.
    return { result: r, score: typeScore + rankScore };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].result;
}

// ── Process one canonical food ──────────────────────────────────────────────
interface ProcessResult {
  key: string;
  fdcId: number | null;
  action: 'updated' | 'inserted' | 'skipped' | 'not_found';
  foodId: string | null;
  unitsInserted: number;
  name: string;
  macros: { kcal: number; protein: number; carb: number; fat: number } | null;
}

async function processFood(
  food: CanonicalFood,
  db: ReturnType<typeof drizzle> | null
): Promise<ProcessResult> {
  const result: ProcessResult = {
    key: food.key,
    fdcId: null,
    action: 'not_found',
    foodId: null,
    unitsInserted: 0,
    name: '',
    macros: null,
  };

  // 1. Search USDA FDC
  let searchResults: USDAFoodSearchResult[];
  try {
    searchResults = await searchFood(food.searchQuery, 10);
  } catch (err) {
    console.error(`  ✗ API error for "${food.key}": ${err}`);
    result.action = 'skipped';
    return result;
  }

  // 2. Pick best match
  const match = pickBestMatch(searchResults, food);
  if (!match) {
    console.warn(`  ⚠ No USDA match for "${food.key}" (query: "${food.searchQuery}")`);
    return result;
  }

  result.fdcId = match.fdcId;
  result.name = match.description;

  // 3. Get macros from search result (fast path — avoids extra API call)
  const macros = getMacrosFromSearchResult(match);
  result.macros = {
    kcal: macros.calories,
    protein: macros.protein_g,
    carb: macros.carbs_g,
    fat: macros.fat_g,
  };

  // Skip if core macros are missing
  if (macros.calories === 0 && macros.protein_g === 0 && macros.carbs_g === 0 && macros.fat_g === 0) {
    // Try full detail as fallback
    const detail = await getFoodByFdcId(match.fdcId);
    if (detail) {
      const detailMacros = getMacrosFromFood(detail);
      if (detailMacros.calories > 0 || detailMacros.protein_g > 0) {
        result.macros = {
          kcal: detailMacros.calories,
          protein: detailMacros.protein_g,
          carb: detailMacros.carbs_g,
          fat: detailMacros.fat_g,
        };
      }
    }
    if (result.macros!.kcal === 0 && result.macros!.protein === 0) {
      console.warn(`  ⚠ No usable macros for "${food.key}" (fdcId: ${match.fdcId})`);
      result.action = 'skipped';
      return result;
    }
  }

  const fdcIdStr = String(match.fdcId);
  const dataQuality = match.dataType === 'Foundation' ? 'lab_verified' as const : 'label' as const;
  const confidence = match.dataType === 'Foundation' ? 0.95 : 0.9;
  const provenanceNote = `Canonical food: ${food.key}. USDA FDC ${match.dataType} #${match.fdcId}. Auto-seeded by seed-canonical-foods.ts.`;

  if (EMIT_SQL) {
    // ── Emit UPDATE for existing row (matched by source+source_id) ──────
    emitSQL(`-- Canonical: ${food.key} → ${match.description} (FDC ${match.fdcId})`);
    emitSQL(`UPDATE foods SET
  canonical_food_key = ${escapeSQL(food.key)},
  usda_fdc_id = ${match.fdcId},
  macro_confidence = ${confidence},
  provenance_notes = ${escapeSQL(provenanceNote)},
  data_reviewed_at = NOW(),
  data_quality = ${escapeSQL(dataQuality)},
  popularity = GREATEST(COALESCE(popularity, 0), 50),
  region = ${escapeArray(food.region)},
  kcal_per_100g = ${macros.calories},
  protein_per_100g = ${macros.protein_g},
  carb_per_100g = ${macros.carbs_g},
  fat_per_100g = ${macros.fat_g},
  fiber_per_100g = ${macros.fiber_g ?? 'NULL'},
  sugar_per_100g = ${macros.sugar_g ?? 'NULL'}
WHERE source = 'usda' AND source_id = ${escapeSQL(fdcIdStr)};`);

    // Emit INSERT for case where food doesn't exist yet
    emitSQL(`INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity)
VALUES (
  ${escapeSQL(canonicalUUID(food.key))}, 'usda', ${escapeSQL(fdcIdStr)},
  ${escapeSQL(`https://fdc.nal.usda.gov/food-details/${match.fdcId}/nutrients`)},
  ${escapeSQL(dataQuality)}, ${escapeSQL(match.description)}, ${escapeArray(food.region)},
  ${macros.calories}, ${macros.protein_g}, ${macros.carbs_g}, ${macros.fat_g},
  ${macros.fiber_g ?? 'NULL'}, ${macros.sugar_g ?? 'NULL'},
  100, '100g', ${match.fdcId}, ${confidence},
  ${escapeSQL(food.key)}, ${escapeSQL(provenanceNote)}, NOW(), 50
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 50),
  region = EXCLUDED.region;`);

    // Emit unit conversion SQL (INSERT ... WHERE NOT EXISTS for idempotency)
    for (const [unit, grams] of Object.entries(food.commonUnits)) {
      emitSQL(`INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, ${escapeSQL(unit)}, ${grams}, 'usda'
FROM foods f
WHERE f.source = 'usda' AND f.source_id = ${escapeSQL(fdcIdStr)}
  AND NOT EXISTS (
    SELECT 1 FROM food_unit_conversions fuc
    WHERE fuc.food_id = f.id AND fuc.unit = ${escapeSQL(unit)}
  );`);
    }
    emitSQL('');

    result.action = 'updated';
    result.unitsInserted = Object.keys(food.commonUnits).length;
    return result;
  }

  if (DRY_RUN || !db) {
    console.log(`  → Would upsert "${match.description}" (FDC ${match.fdcId}, ${match.dataType})`);
    console.log(`    Macros/100g: ${macros.calories} kcal, ${macros.protein_g}P, ${macros.carbs_g}C, ${macros.fat_g}F`);
    console.log(`    Units: ${Object.entries(food.commonUnits).map(([u, g]) => `${u}=${g}g`).join(', ')}`);
    result.action = 'updated';
    result.unitsInserted = Object.keys(food.commonUnits).length;
    return result;
  }

  // ── Real DB operations ────────────────────────────────────────────────────

  // 4. Check if this FDC ID already exists
  const existing = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.source, 'usda'), eq(foods.sourceId, fdcIdStr)))
    .limit(1);

  let foodId: string;

  if (existing.length > 0) {
    // UPDATE existing row with canonical provenance
    foodId = existing[0].id;
    await db.update(foods)
      .set({
        canonicalFoodKey: food.key,
        usdaFdcId: match.fdcId,
        macroConfidence: confidence,
        provenanceNotes: provenanceNote,
        dataReviewedAt: new Date(),
        dataQuality: dataQuality,
        popularity: 50,
        region: food.region,
        // Also refresh macros from USDA (in case they were stale)
        kcalPer100g: macros.calories,
        proteinPer100g: macros.protein_g,
        carbPer100g: macros.carbs_g,
        fatPer100g: macros.fat_g,
        fiberPer100g: macros.fiber_g,
        sugarPer100g: macros.sugar_g,
      })
      .where(eq(foods.id, foodId));

    result.action = 'updated';
    console.log(`  ✓ Updated "${match.description}" (existing, FDC ${match.fdcId})`);
  } else {
    // INSERT new row with deterministic UUID
    foodId = canonicalUUID(food.key);
    await db.insert(foods).values({
      id: foodId,
      source: 'usda',
      sourceId: fdcIdStr,
      sourceUrl: `https://fdc.nal.usda.gov/food-details/${match.fdcId}/nutrients`,
      dataQuality: dataQuality,
      nameEn: match.description,
      region: food.region,
      kcalPer100g: macros.calories,
      proteinPer100g: macros.protein_g,
      carbPer100g: macros.carbs_g,
      fatPer100g: macros.fat_g,
      fiberPer100g: macros.fiber_g,
      sugarPer100g: macros.sugar_g,
      defaultServingGrams: 100,
      defaultServingUnit: '100g',
      usdaFdcId: match.fdcId,
      macroConfidence: confidence,
      canonicalFoodKey: food.key,
      provenanceNotes: provenanceNote,
      dataReviewedAt: new Date(),
      popularity: 50,
    }).onConflictDoNothing();

    result.action = 'inserted';
    console.log(`  + Inserted "${match.description}" (new, FDC ${match.fdcId})`);
  }

  result.foodId = foodId;

  // 5. UPSERT food_unit_conversions
  for (const [unit, grams] of Object.entries(food.commonUnits)) {
    // Check if this exact conversion already exists
    const existingConv = await db
      .select({ id: foodUnitConversions.id })
      .from(foodUnitConversions)
      .where(and(
        eq(foodUnitConversions.foodId, foodId),
        eq(foodUnitConversions.unit, unit),
      ))
      .limit(1);

    if (existingConv.length > 0) {
      // Update grams if changed
      await db.update(foodUnitConversions)
        .set({ gramsPerUnit: grams, source: 'usda' })
        .where(eq(foodUnitConversions.id, existingConv[0].id));
    } else {
      await db.insert(foodUnitConversions).values({
        foodId,
        unit,
        gramsPerUnit: grams,
        source: 'usda',
      });
    }
    result.unitsInserted++;
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🌿 Trophē Canonical Foods Seeder`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : EMIT_SQL ? 'EMIT SQL' : 'LIVE'}`);
  console.log(`   Foods: ${Math.min(CANONICAL_FOODS.length, LIMIT)} of ${CANONICAL_FOODS.length}`);
  console.log('');

  let pool: Pool | null = null;
  let db: ReturnType<typeof drizzle> | null = null;

  if (!DRY_RUN && !EMIT_SQL) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error('DATABASE_URL is required for live mode. Use --dry-run or --emit-sql without it.');
    }
    pool = new Pool({ connectionString: dbUrl, max: 5 });
    db = drizzle(pool);
  }

  const foodsToProcess = CANONICAL_FOODS.slice(0, LIMIT);
  const results: ProcessResult[] = [];
  let processed = 0;

  for (const food of foodsToProcess) {
    processed++;
    console.log(`[${processed}/${foodsToProcess.length}] ${food.key} (${food.category})`);

    const result = await processFood(food, db);
    results.push(result);

    // Rate limit between API calls
    if (processed < foodsToProcess.length) {
      await new Promise(r => setTimeout(r, 120));
    }
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const updated = results.filter(r => r.action === 'updated');
  const inserted = results.filter(r => r.action === 'inserted');
  const notFound = results.filter(r => r.action === 'not_found');
  const skipped = results.filter(r => r.action === 'skipped');
  const totalUnits = results.reduce((s, r) => s + r.unitsInserted, 0);

  console.log(`  Updated:    ${updated.length}`);
  console.log(`  Inserted:   ${inserted.length}`);
  console.log(`  Not found:  ${notFound.length}`);
  console.log(`  Skipped:    ${skipped.length}`);
  console.log(`  Unit convs: ${totalUnits}`);

  if (notFound.length > 0) {
    console.log('\n  Not found:');
    notFound.forEach(r => console.log(`    - ${r.key}`));
  }
  if (skipped.length > 0) {
    console.log('\n  Skipped (API/macro errors):');
    skipped.forEach(r => console.log(`    - ${r.key}`));
  }

  // ── Emit SQL output ───────────────────────────────────────────────────
  if (EMIT_SQL && sqlStatements.length > 0) {
    const sqlFile = '/tmp/canonical-foods-seed.sql';
    const header = [
      '-- Trophē Canonical Foods Seed SQL',
      `-- Generated: ${new Date().toISOString()}`,
      `-- Foods: ${foodsToProcess.length}`,
      '-- IDEMPOTENT: safe to run multiple times',
      '',
      'BEGIN;',
      '',
    ];
    const footer = [
      '',
      'COMMIT;',
    ];
    const fullSQL = [...header, ...sqlStatements, ...footer].join('\n');

    const fs = await import('fs');
    fs.writeFileSync(sqlFile, fullSQL);
    console.log(`\n  SQL written to: ${sqlFile}`);
    console.log(`  Statements: ${sqlStatements.length}`);
  }

  // ── Key foods verification ────────────────────────────────────────────
  console.log('\n── Key foods check ──');
  const keyFoods = ['egg_chicken_whole_raw', 'banana_raw', 'honey', 'rice_cake_plain', 'feta_cheese'];
  for (const key of keyFoods) {
    const r = results.find(x => x.key === key);
    if (r && r.macros) {
      console.log(`  ${key}: ${r.name} → ${r.macros.kcal} kcal/100g (FDC ${r.fdcId})`);
    } else {
      console.log(`  ${key}: ⚠ NOT RESOLVED`);
    }
  }

  if (pool) await pool.end();
  console.log('\n✅ Done.\n');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
