/**
 * scripts/data/seed-wave3-branded.ts
 *
 * Seeds Wave 3 branded foods (fast food + beverages) into the DB.
 * Uses the same canonical food pipeline as seed-canonical-foods.ts.
 *
 * Flags:
 *   --dry-run      Log what would be done, don't write to DB
 *   --emit-sql     Print idempotent SQL statements for production
 *   --limit N      Only process first N foods (for testing)
 *
 * Usage:
 *   USDA_API_KEY=Yw6KN9Y3oV8cfZco5d8v6RPPbEBWdPe6qZNWNCh0 \
 *   DATABASE_URL="postgresql://brain_user:...@localhost:5433/trophe_dev" \
 *     npx tsx scripts/data/seed-wave3-branded.ts
 *
 *   # Dry run (no DB needed):
 *   USDA_API_KEY=Yw6KN9Y3oV8cfZco5d8v6RPPbEBWdPe6qZNWNCh0 \
 *     npx tsx scripts/data/seed-wave3-branded.ts --dry-run
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq, and } from 'drizzle-orm';
import { v5 as uuidv5 } from 'uuid';
import { foods } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { foodAliases } from '../../db/schema/food_aliases';
import { WAVE3_BRANDED_FOODS, type TIER3_GAPS } from './wave3-branded-foods-list';
import {
  searchFood,
  getMacrosFromSearchResult,
  getFoodByFdcId,
  getMacrosFromFood,
  getDataTypeRank,
  type USDAFoodSearchResult,
} from '../../lib/nutrition/usda-fdc';
import type { CanonicalFood } from './canonical-foods-list';

// ── Deterministic UUID namespace ────────────────────────────────────────────
const NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
function canonicalUUID(key: string): string {
  return uuidv5(`trophe.canonical.${key}`, NAMESPACE);
}

// ── CLI flags ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const EMIT_SQL = args.includes('--emit-sql');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

// ── SQL helpers ─────────────────────────────────────────────────────────────
const sqlStatements: string[] = [];
function emitSQL(stmt: string) { sqlStatements.push(stmt); }
function escapeSQL(val: string | null | undefined): string {
  if (val == null) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}
function escapeArray(arr: string[] | null | undefined): string {
  if (!arr?.length) return 'NULL';
  return `ARRAY[${arr.map(s => escapeSQL(s)).join(',')}]`;
}

// ── Brand aliases to seed for better retrieval ──────────────────────────────
const BRAND_ALIASES: Record<string, Array<{ lang: string; alias: string }>> = {
  mcdonalds_big_mac: [
    { lang: 'en', alias: 'big mac' },
    { lang: 'en', alias: 'bigmac' },
    { lang: 'es', alias: 'big mac' },
  ],
  mcdonalds_chicken_mcnuggets: [
    { lang: 'en', alias: 'mcnuggets' },
    { lang: 'en', alias: 'chicken mcnuggets' },
    { lang: 'en', alias: 'nuggets' },
    { lang: 'es', alias: 'nuggets de pollo' },
    { lang: 'es', alias: 'mcnuggets' },
  ],
  mcdonalds_french_fries_large: [
    { lang: 'en', alias: 'mcdonald fries' },
    { lang: 'en', alias: 'mcdonalds fries' },
    { lang: 'es', alias: 'papas fritas mcdonalds' },
  ],
  mcdonalds_cheeseburger: [
    { lang: 'en', alias: 'mcdonalds cheeseburger' },
    { lang: 'es', alias: 'cheeseburger mcdonalds' },
  ],
  burger_king_whopper: [
    { lang: 'en', alias: 'whopper' },
    { lang: 'es', alias: 'whopper' },
  ],
  coca_cola: [
    { lang: 'en', alias: 'coca cola' },
    { lang: 'en', alias: 'coke' },
    { lang: 'en', alias: 'coca-cola' },
    { lang: 'es', alias: 'coca cola' },
    { lang: 'es', alias: 'coca' },
  ],
  sprite: [
    { lang: 'en', alias: 'sprite' },
    { lang: 'es', alias: 'sprite' },
  ],
  pepsi_cola: [
    { lang: 'en', alias: 'pepsi' },
    { lang: 'es', alias: 'pepsi' },
  ],
  starbucks_caffe_latte: [
    { lang: 'en', alias: 'starbucks latte' },
    { lang: 'en', alias: 'caffe latte' },
    { lang: 'en', alias: 'latte' },
    { lang: 'es', alias: 'latte' },
    { lang: 'es', alias: 'café latte' },
  ],
  red_bull_energy_drink: [
    { lang: 'en', alias: 'red bull' },
    { lang: 'es', alias: 'red bull' },
  ],
  beer_regular: [
    { lang: 'en', alias: 'beer' },
    { lang: 'es', alias: 'cerveza' },
  ],
  corona_beer: [
    { lang: 'en', alias: 'corona' },
    { lang: 'en', alias: 'corona extra' },
    { lang: 'es', alias: 'corona' },
  ],
};

// ── Pick best USDA match ────────────────────────────────────────────────────
function pickBestMatch(
  results: USDAFoodSearchResult[],
  food: CanonicalFood,
): USDAFoodSearchResult | null {
  if (!results.length) return null;
  const scored = results.map(r => {
    const typeIdx = food.preferredTypes.indexOf(r.dataType);
    const typeScore = typeIdx >= 0 ? (food.preferredTypes.length - typeIdx) * 10 : 0;
    const rankScore = 10 - getDataTypeRank(r.dataType);
    return { result: r, score: typeScore + rankScore };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0].result;
}

// ── Process one food ────────────────────────────────────────────────────────
interface ProcessResult {
  key: string;
  fdcId: number | null;
  action: 'updated' | 'inserted' | 'skipped' | 'not_found';
  name: string;
  macros: { kcal: number; protein: number; carb: number; fat: number } | null;
  unitsInserted: number;
  aliasesInserted: number;
}

async function processFood(
  food: CanonicalFood,
  db: ReturnType<typeof drizzle> | null,
): Promise<ProcessResult> {
  const result: ProcessResult = {
    key: food.key, fdcId: null, action: 'not_found', name: '',
    macros: null, unitsInserted: 0, aliasesInserted: 0,
  };

  // 1. Search USDA
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

  // 3. Get macros
  let macros = getMacrosFromSearchResult(match);
  if (macros.calories === 0 && macros.protein_g === 0) {
    const detail = await getFoodByFdcId(match.fdcId);
    if (detail) {
      macros = getMacrosFromFood(detail);
    }
  }
  result.macros = { kcal: macros.calories, protein: macros.protein_g, carb: macros.carbs_g, fat: macros.fat_g };

  if (macros.calories === 0 && macros.protein_g === 0 && macros.carbs_g === 0) {
    console.warn(`  ⚠ No usable macros for "${food.key}" (fdcId: ${match.fdcId})`);
    result.action = 'skipped';
    return result;
  }

  const fdcIdStr = String(match.fdcId);
  const dataQuality = match.dataType === 'Foundation' ? 'lab_verified' as const : 'label' as const;
  const confidence = match.dataType === 'Foundation' ? 0.95 : 0.9;
  const provenanceNote = `Wave 3 branded food: ${food.key}. USDA FDC ${match.dataType} #${match.fdcId}. ${food.notes ?? ''}`;

  if (EMIT_SQL) {
    emitSQL(`-- Wave 3: ${food.key} → ${match.description} (FDC ${match.fdcId})`);
    emitSQL(`INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  ${escapeSQL(canonicalUUID(food.key))}, 'usda', ${escapeSQL(fdcIdStr)},
  ${escapeSQL(`https://fdc.nal.usda.gov/food-details/${match.fdcId}/nutrients`)},
  ${escapeSQL(dataQuality)}, ${escapeSQL(match.description)}, ${escapeArray(food.region)},
  ${macros.calories}, ${macros.protein_g}, ${macros.carbs_g}, ${macros.fat_g},
  ${macros.fiber_g ?? 'NULL'}, ${macros.sugar_g ?? 'NULL'},
  100, '100g', ${match.fdcId}, ${confidence},
  ${escapeSQL(food.key)}, ${escapeSQL(provenanceNote)}, NOW(), 80,
  ${escapeSQL(match.brandOwner || null)}
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;`);

    for (const [unit, grams] of Object.entries(food.commonUnits)) {
      emitSQL(`INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, ${escapeSQL(unit)}, ${grams}, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = ${escapeSQL(fdcIdStr)}
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = ${escapeSQL(unit)});`);
    }

    const aliases = BRAND_ALIASES[food.key] ?? [];
    for (const { lang, alias } of aliases) {
      emitSQL(`INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, ${escapeSQL(lang)}, ${escapeSQL(alias.toLowerCase())}, false
FROM foods f WHERE f.source = 'usda' AND f.source_id = ${escapeSQL(fdcIdStr)}
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = ${escapeSQL(alias.toLowerCase())});`);
    }
    emitSQL('');

    result.action = 'inserted';
    result.unitsInserted = Object.keys(food.commonUnits).length;
    result.aliasesInserted = aliases.length;
    return result;
  }

  if (DRY_RUN || !db) {
    console.log(`  → Would upsert "${match.description}" (FDC ${match.fdcId}, ${match.dataType})`);
    console.log(`    Macros/100g: ${macros.calories} kcal, ${macros.protein_g}P, ${macros.carbs_g}C, ${macros.fat_g}F`);
    console.log(`    Units: ${Object.entries(food.commonUnits).map(([u, g]) => `${u}=${g}g`).join(', ')}`);
    const aliases = BRAND_ALIASES[food.key] ?? [];
    if (aliases.length) console.log(`    Aliases: ${aliases.map(a => a.alias).join(', ')}`);
    result.action = 'inserted';
    result.unitsInserted = Object.keys(food.commonUnits).length;
    result.aliasesInserted = aliases.length;
    return result;
  }

  // ── LIVE DB operations ──────────────────────────────────────────────────
  const existing = await db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.source, 'usda'), eq(foods.sourceId, fdcIdStr)))
    .limit(1);

  let foodId: string;

  if (existing.length > 0) {
    foodId = existing[0].id;
    await db.update(foods)
      .set({
        canonicalFoodKey: food.key,
        usdaFdcId: match.fdcId,
        macroConfidence: confidence,
        provenanceNotes: provenanceNote,
        dataReviewedAt: new Date(),
        dataQuality: dataQuality,
        popularity: 80,
        region: food.region,
        brand: match.brandOwner || null,
        kcalPer100g: macros.calories,
        proteinPer100g: macros.protein_g,
        carbPer100g: macros.carbs_g,
        fatPer100g: macros.fat_g,
        fiberPer100g: macros.fiber_g,
        sugarPer100g: macros.sugar_g,
      })
      .where(eq(foods.id, foodId));
    result.action = 'updated';
    console.log(`  ✓ Updated "${match.description}" (existing FDC ${match.fdcId})`);
  } else {
    foodId = canonicalUUID(food.key);
    await db.insert(foods).values({
      id: foodId,
      source: 'usda',
      sourceId: fdcIdStr,
      sourceUrl: `https://fdc.nal.usda.gov/food-details/${match.fdcId}/nutrients`,
      dataQuality,
      nameEn: match.description,
      region: food.region,
      brand: match.brandOwner || null,
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
      popularity: 80,
    }).onConflictDoNothing();
    result.action = 'inserted';
    console.log(`  + Inserted "${match.description}" (new FDC ${match.fdcId})`);
  }

  // Unit conversions
  for (const [unit, grams] of Object.entries(food.commonUnits)) {
    const existingConv = await db
      .select({ id: foodUnitConversions.id })
      .from(foodUnitConversions)
      .where(and(eq(foodUnitConversions.foodId, foodId), eq(foodUnitConversions.unit, unit)))
      .limit(1);

    if (existingConv.length > 0) {
      await db.update(foodUnitConversions)
        .set({ gramsPerUnit: grams, source: 'usda' })
        .where(eq(foodUnitConversions.id, existingConv[0].id));
    } else {
      await db.insert(foodUnitConversions).values({ foodId, unit, gramsPerUnit: grams, source: 'usda' });
    }
    result.unitsInserted++;
  }

  // Aliases
  const aliases = BRAND_ALIASES[food.key] ?? [];
  for (const { lang, alias } of aliases) {
    await db.insert(foodAliases).values({
      foodId,
      lang,
      alias: alias.toLowerCase(),
      preferred: false,
    }).onConflictDoNothing();
    result.aliasesInserted++;
  }

  return result;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🍔 Trophē Wave 3: Branded Foods Seeder`);
  console.log(`   Mode: ${DRY_RUN ? 'DRY RUN' : EMIT_SQL ? 'EMIT SQL' : 'LIVE'}`);
  console.log(`   Foods: ${Math.min(WAVE3_BRANDED_FOODS.length, LIMIT)} of ${WAVE3_BRANDED_FOODS.length}`);
  console.log('');

  let pool: Pool | null = null;
  let db: ReturnType<typeof drizzle> | null = null;

  if (!DRY_RUN && !EMIT_SQL) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL is required for live mode. Use --dry-run or --emit-sql.');
    pool = new Pool({ connectionString: dbUrl, max: 5 });
    db = drizzle(pool);
  }

  const foodsToProcess = WAVE3_BRANDED_FOODS.slice(0, LIMIT);
  const results: ProcessResult[] = [];

  for (let i = 0; i < foodsToProcess.length; i++) {
    const food = foodsToProcess[i];
    console.log(`[${i + 1}/${foodsToProcess.length}] ${food.key}`);
    const result = await processFood(food, db);
    results.push(result);
    // Rate limit
    if (i < foodsToProcess.length - 1) await new Promise(r => setTimeout(r, 150));
  }

  // ── Summary ─────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('WAVE 3 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');

  const updated = results.filter(r => r.action === 'updated');
  const inserted = results.filter(r => r.action === 'inserted');
  const notFound = results.filter(r => r.action === 'not_found');
  const skipped = results.filter(r => r.action === 'skipped');
  const totalUnits = results.reduce((s, r) => s + r.unitsInserted, 0);
  const totalAliases = results.reduce((s, r) => s + r.aliasesInserted, 0);

  console.log(`  Updated:    ${updated.length}`);
  console.log(`  Inserted:   ${inserted.length}`);
  console.log(`  Not found:  ${notFound.length}`);
  console.log(`  Skipped:    ${skipped.length}`);
  console.log(`  Unit convs: ${totalUnits}`);
  console.log(`  Aliases:    ${totalAliases}`);

  if (notFound.length > 0) {
    console.log('\n  ⚠ Not found:');
    notFound.forEach(r => console.log(`    - ${r.key}`));
  }

  // Show kcal validation
  console.log('\n── Calorie validation (expected ranges) ──');
  for (const r of results) {
    if (!r.macros) continue;
    const food = WAVE3_BRANDED_FOODS.find(f => f.key === r.key)!;
    const primaryUnit = Object.entries(food.commonUnits)[0];
    const perServing = Math.round(r.macros.kcal * primaryUnit[1] / 100);
    console.log(`  ${r.key}: ${r.macros.kcal} kcal/100g × ${primaryUnit[0]}(${primaryUnit[1]}g) = ${perServing} kcal`);
  }

  if (EMIT_SQL && sqlStatements.length > 0) {
    console.log('\n\n-- ═══════════════════════════════════════════════════════');
    console.log('-- WAVE 3 SQL (paste into migration or run directly)');
    console.log('-- ═══════════════════════════════════════════════════════\n');
    console.log(sqlStatements.join('\n'));
  }

  if (pool) await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
