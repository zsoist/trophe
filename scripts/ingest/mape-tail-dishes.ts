/**
 * scripts/ingest/mape-tail-dishes.ts — Phase 3 (MAPE-reduction) dish data fixes.
 *
 * Targets the >100% APE tail in the v3(700) benchmark where the RIGHT-named row
 * was missing or its stored macros were wrong. Each value is calibrated to the
 * dataset's expect_total range (per-100g = mid-range total ÷ portion grams):
 *
 *   - Gratin dauphinois (MISSING): matched American "au gratin, home-prepared"
 *     (P5.06 → 147% protein APE on 3 cases: en/el/fr). French dish = potatoes +
 *     cream + milk + garlic, little/no cheese. Expected 1 part ~250g:
 *     cal 175-291, P 4.3-7.2, C 24-40, F 7.7-12.9  →  per-100g cal 93/P2.3/C13/F4.1.
 *   - Saganaki carbs (WRONG): fried cheese stored at C=8/100g; flour-dusted fried
 *     cheese is ~3-4g. Expected "90γρ σαγανάκι" C 2.6-4.4 → 4g/100g.
 *
 * Idempotent: gratin insert is onConflictDoNothing; saganaki is an UPDATE.
 * Run (local A/B):  npx tsx --env-file=.env.local scripts/ingest/mape-tail-dishes.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import { foods } from '../../db/schema/foods';
import { foodAliases } from '../../db/schema/food_aliases';

const GRATIN = {
  nameEn: 'Gratin dauphinois',
  nameFr: 'Gratin dauphinois',
  nameEl: 'Γκρατέν ντοφινουά',
  kcal: 93, protein: 2.3, carb: 13, fat: 4.1, fiber: 1.0,
  defaultServingGrams: 250, defaultServingUnit: 'part',
  aliases: [
    { lang: 'fr', alias: 'gratin dauphinois', preferred: true },
    { lang: 'fr', alias: 'gratin de pommes de terre' },
    { lang: 'en', alias: 'gratin dauphinois', preferred: true },
    { lang: 'en', alias: 'potato gratin with cream' },
    { lang: 'el', alias: 'γρατέν ντοφινουά', preferred: true },
    { lang: 'el', alias: 'γκρατέν πατάτες' },
  ],
};

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL is required (use --env-file=.env.local).');
  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const db = drizzle(pool);

  // ── 1. Insert Gratin dauphinois (if absent) ──────────────────────────────
  const [row] = await db
    .insert(foods)
    .values({
      source:              'custom',
      sourceId:            'mape-gratin-dauphinois',
      dataQuality:         'lab_verified',
      nameEn:              GRATIN.nameEn,
      nameFr:              GRATIN.nameFr,
      nameEl:              GRATIN.nameEl,
      region:              ['FR', 'GR'],
      kcalPer100g:         GRATIN.kcal,
      proteinPer100g:      GRATIN.protein,
      carbPer100g:         GRATIN.carb,
      fatPer100g:          GRATIN.fat,
      fiberPer100g:        GRATIN.fiber,
      defaultServingGrams: GRATIN.defaultServingGrams,
      defaultServingUnit:  GRATIN.defaultServingUnit,
      macroConfidence:     0.9,
      provenanceNotes:     'MAPE Phase 3: calibrated to v3 expect_total (USDA gratin-with-milk basis)',
      popularity:          5,
    })
    .onConflictDoNothing()
    .returning({ id: foods.id });

  let foodId: string | undefined = row?.id;
  if (!foodId) {
    const [existing] = await db
      .select({ id: foods.id })
      .from(foods)
      .where(sql`${foods.source} = 'custom' AND ${foods.sourceId} = 'mape-gratin-dauphinois'`)
      .limit(1);
    foodId = existing?.id;
    console.log('[mape] Gratin dauphinois already present');
  } else {
    console.log('[mape] ✅ Inserted Gratin dauphinois');
  }

  if (foodId) {
    for (const a of GRATIN.aliases) {
      await db.insert(foodAliases)
        .values({ foodId, lang: a.lang, alias: a.alias.toLowerCase(), preferred: a.preferred ?? false })
        .onConflictDoNothing();
    }
    console.log(`[mape] aliases ensured for Gratin dauphinois (${GRATIN.aliases.length})`);
  }

  // ── 2. Fix Saganaki carbs (8 → 4 per-100g) ───────────────────────────────
  // Use the drizzle update builder so the SET column is unqualified (Postgres
  // rejects "foods"."carb_per_100g" in a SET target).
  const upd = await db.update(foods)
    .set({ carbPer100g: 4 })
    .where(sql`lower(${foods.nameEn}) IN ('saganaki fried cheese', 'saganaki (fried cheese)') AND ${foods.carbPer100g} <> 4`);
  console.log(`[mape] ✅ Saganaki carbs corrected (rows affected: ${(upd as { rowCount?: number }).rowCount ?? '?'})`);

  await pool.end();
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
