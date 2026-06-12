/**
 * scripts/ingest/populate-portions.ts — Populate food_unit_conversions from two sources:
 *
 * 1. USDA FDC API `foodPortions[]` for foods with `usda_fdc_id`
 * 2. HHF (Hellenic Health Foods) defaults from `foods.defaultServingGrams/Unit`
 *
 * The 78/210 (37%) nutrition accuracy is largely caused by missing portion data.
 * Every USDA food was ingested with `defaultServingGrams: 100` (the ingest script
 * hardcodes this), throwing away the `foodPortions[]` data the API provides.
 * HHF foods have good defaults (feta=30g/slice, yogurt=150g/cup) but these
 * aren't in `food_unit_conversions`, so `resolveUnit()` can't find them for
 * alternate unit names.
 *
 * Usage:
 *   npx tsx scripts/ingest/populate-portions.ts
 *   npx tsx scripts/ingest/populate-portions.ts --dry-run   # preview only
 *
 * Idempotent: uses ON CONFLICT DO NOTHING on (food_id, unit, qualifier).
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';
import { sql, eq, and, isNull, isNotNull } from 'drizzle-orm';
import { getFoodByFdcId, normalizePortionUnit, getServingsFromFood } from '../../lib/nutrition/usda-fdc';

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

const pool = new Pool({ connectionString, max: 5 });
const db = drizzle(pool);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Insert a unit conversion, skipping duplicates.
 * Uses raw SQL because Drizzle doesn't support ON CONFLICT with partial unique indexes.
 */
async function upsertConversion(
  foodId: string,
  unit: string,
  gramsPerUnit: number,
  source: string,
  qualifier: string | null = null,
): Promise<boolean> {
  if (gramsPerUnit <= 0 || gramsPerUnit > 10_000) {
    console.warn(`  ⚠ Skipping implausible: ${unit}=${gramsPerUnit}g`);
    return false;
  }

  if (DRY_RUN) {
    console.log(`  [DRY] Would insert: ${unit}${qualifier ? ` (${qualifier})` : ''} = ${gramsPerUnit}g (${source})`);
    return true;
  }

  // Check if row exists first (no unique constraint on (food_id, unit, qualifier))
  const existing = await db
    .select({ id: foodUnitConversions.id })
    .from(foodUnitConversions)
    .where(
      and(
        eq(foodUnitConversions.foodId, foodId),
        eq(foodUnitConversions.unit, unit),
        qualifier ? eq(foodUnitConversions.qualifier, qualifier) : isNull(foodUnitConversions.qualifier),
      )
    )
    .limit(1);

  if (existing.length > 0) {
    return false; // Already exists
  }

  await db.insert(foodUnitConversions).values({
    foodId,
    unit,
    qualifier,
    gramsPerUnit,
    source,
  });
  return true;
}

// ── Phase 1: USDA FDC portions ──────────────────────────────────────────────

async function ingestUSDAPortions(): Promise<number> {
  console.log('\n=== Phase 1: USDA FDC Portions ===\n');

  const usdaFoods = await db
    .select({
      id: foods.id,
      nameEn: foods.nameEn,
      usdaFdcId: foods.usdaFdcId,
    })
    .from(foods)
    .where(isNotNull(foods.usdaFdcId));

  console.log(`Found ${usdaFoods.length} foods with usda_fdc_id\n`);
  let totalInserted = 0;

  for (const food of usdaFoods) {
    if (!food.usdaFdcId) continue;
    console.log(`📦 ${food.nameEn} (FDC: ${food.usdaFdcId})`);

    try {
      const detail = await getFoodByFdcId(food.usdaFdcId);
      if (!detail) {
        console.log('  ⚠ No FDC detail found, skipping');
        continue;
      }

      const servings = getServingsFromFood(detail);
      if (servings.length === 0) {
        console.log('  ⚠ No portions in FDC response');
        continue;
      }

      // Also update the food's defaultServingGrams/Unit with the first portion
      const primaryServing = servings[0];
      if (!DRY_RUN) {
        await db.execute(sql`
          UPDATE foods
          SET default_serving_grams = ${primaryServing.grams},
              default_serving_unit = ${primaryServing.unit}
          WHERE id = ${food.id}::uuid
            AND default_serving_grams = 100
            AND default_serving_unit = '100g'
        `);
      }

      for (const serving of servings) {
        const inserted = await upsertConversion(
          food.id,
          serving.unit,
          serving.grams,
          'usda',
        );
        if (inserted) {
          totalInserted++;
          console.log(`  ✅ ${serving.unit} = ${serving.grams}g`);
        } else {
          console.log(`  ⏭ ${serving.unit} = ${serving.grams}g (exists)`);
        }
      }
    } catch (error) {
      console.error(`  ❌ Error fetching FDC ${food.usdaFdcId}:`, error);
    }
  }

  return totalInserted;
}

// ── Phase 2: HHF food defaults → conversions ────────────────────────────────

/**
 * For each HHF food that has defaultServingGrams + defaultServingUnit set,
 * insert a matching row into food_unit_conversions so `resolveUnit()` can
 * find it regardless of what unit name the user/LLM provides.
 *
 * Also adds common synonyms: bowl → serving, portion → serving for soups.
 */
async function ingestHHFDefaults(): Promise<number> {
  console.log('\n=== Phase 2: HHF Default Portions ===\n');

  const hhfFoods = await db
    .select({
      id: foods.id,
      nameEn: foods.nameEn,
      defaultServingGrams: foods.defaultServingGrams,
      defaultServingUnit: foods.defaultServingUnit,
      canonicalFoodKey: foods.canonicalFoodKey,
    })
    .from(foods)
    .where(eq(foods.source, 'hhf'));

  console.log(`Found ${hhfFoods.length} HHF foods\n`);
  let totalInserted = 0;

  // Unit synonym expansion: when the primary unit is "bowl", also insert "serving" and "portion"
  const UNIT_SYNONYMS: Record<string, string[]> = {
    bowl: ['serving', 'portion'],
    serving: ['portion'],
    piece: ['serving'],
    cup: ['serving'],
    slice: ['piece'],
    wrap: ['piece', 'serving'],
    skewer: ['piece', 'serving'],
    palm: ['serving', 'portion'],
  };

  for (const food of hhfFoods) {
    if (!food.defaultServingGrams || !food.defaultServingUnit) continue;
    let primaryUnit = food.defaultServingUnit.toLowerCase().trim()
      // Clean up units like "1 serving (200g)" → "serving"
      .replace(/^\d+\s*/, '')
      .replace(/\s*\(.*\)$/, '')
      .replace(/\s+/g, '_');

    // Skip metric-mass defaults — "100g" as a serving unit means "per 100g"
    // which is already handled by the explicit mass logic in resolveUnit().
    // Inserting g=100g would mean "1 gram = 100 grams" which is wrong.
    if (['100g', 'g', 'kg', 'ml', 'l'].includes(primaryUnit)) {
      console.log(`  ⏭ Skipping metric default (${primaryUnit})`);
      // Still insert a 'serving' conversion for these foods
      primaryUnit = 'serving';
    }

    console.log(`🇬🇷 ${food.nameEn} — ${food.defaultServingGrams}g/${primaryUnit}`);

    // Insert primary unit
    const inserted = await upsertConversion(
      food.id,
      primaryUnit,
      food.defaultServingGrams,
      'hhf',
    );
    if (inserted) {
      totalInserted++;
      console.log(`  ✅ ${primaryUnit} = ${food.defaultServingGrams}g`);
    }

    // Insert synonyms
    const synonyms = UNIT_SYNONYMS[primaryUnit] ?? [];
    for (const synonym of synonyms) {
      const synInserted = await upsertConversion(
        food.id,
        synonym,
        food.defaultServingGrams,
        'hhf',
      );
      if (synInserted) {
        totalInserted++;
        console.log(`  ✅ ${synonym} = ${food.defaultServingGrams}g (synonym)`);
      }
    }
  }

  return totalInserted;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🔧 Populate food_unit_conversions${DRY_RUN ? ' (DRY RUN)' : ''}\n`);
  console.log('─'.repeat(60));

  const usdaCount = await ingestUSDAPortions();
  const hhfCount = await ingestHHFDefaults();

  console.log('\n' + '─'.repeat(60));
  console.log(`\n✅ Done! Inserted ${usdaCount + hhfCount} conversions (USDA: ${usdaCount}, HHF: ${hhfCount})`);

  if (DRY_RUN) {
    console.log('\n⚠ DRY RUN — no changes were made. Remove --dry-run to apply.\n');
  }

  await pool.end();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  pool.end().finally(() => process.exit(1));
});
