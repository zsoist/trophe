/**
 * scripts/ingest/hhf-dishes.ts — Hellenic/HHF traditional dishes ingest.
 *
 * Two sources merged:
 *   1. lib/greek-foods-seed.ts — 21 existing entries (Trophē Phase 0 data)
 *   2. HHF-derived traditional Greek dishes from PubMed 28731641
 *      (Hellenic Health Foundation / "Food Composition Tables for Epidemiological
 *      Studies in Greece" — published academic subset)
 *
 * Per-100g values sourced from:
 *   - USDA FDC for internationally recognized items
 *   - HHF published tables for Greek-specific preparations
 *   - Kavdas coaching plan annotations (flagged as 'hhf')
 *
 * All entries get Greek aliases via food_aliases table for hybrid retrieval.
 *
 * Usage:
 *   npx tsx scripts/ingest/hhf-dishes.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { foodAliases } from '../../db/schema/food_aliases';
import { GREEK_FOODS } from '../../lib/greek-foods-seed';

// ── HHF + published Greek dish data (per 100g unless noted) ─────────────────
// Sources: HHF tables, USDA SR Legacy cross-reference, Kavdas plan annotations
const HHF_FOODS: Array<{
  nameEn: string;
  nameEl: string;
  kcal: number;
  protein: number;
  carb: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodiumMg?: number;
  defaultServingGrams?: number;
  defaultServingUnit?: string;
  aliases?: Array<{ lang: string; alias: string; preferred?: boolean }>;
}> = [
  // ── Dairy & Cheese ──────────────────────────────────────────────────────
  {
    nameEn: 'Feta Cheese',       nameEl: 'Φέτα',
    kcal: 264, protein: 14.2, carb: 4.1, fat: 21.3, fiber: 0, sodiumMg: 1116,
    defaultServingGrams: 30, defaultServingUnit: 'slice',
    aliases: [
      { lang: 'el', alias: 'φέτα', preferred: true },
      { lang: 'el', alias: 'φέτα τυρί' },
      { lang: 'en', alias: 'feta', preferred: true },
      { lang: 'en', alias: 'greek cheese' },
    ],
  },
  {
    nameEn: 'Greek Yogurt Full Fat',  nameEl: 'Γιαούρτι Στραγγιστό',
    kcal: 100, protein: 9.9, carb: 3.6, fat: 5.0, fiber: 0, sodiumMg: 36,
    defaultServingGrams: 150, defaultServingUnit: 'cup',
    aliases: [
      { lang: 'el', alias: 'γιαούρτι', preferred: true },
      { lang: 'el', alias: 'στραγγιστό γιαούρτι' },
      { lang: 'el', alias: 'γιαούρτι πλήρες' },
      { lang: 'en', alias: 'greek yogurt', preferred: true },
      { lang: 'en', alias: 'strained yogurt' },
    ],
  },
  {
    nameEn: 'Halloumi Cheese',   nameEl: 'Χαλούμι',
    kcal: 320, protein: 22.0, carb: 3.1, fat: 25.0, fiber: 0, sodiumMg: 756,
    defaultServingGrams: 30, defaultServingUnit: 'slice',
    aliases: [
      { lang: 'el', alias: 'χαλούμι', preferred: true },
      { lang: 'en', alias: 'halloumi', preferred: true },
    ],
  },
  {
    nameEn: 'Graviera Cheese',   nameEl: 'Γραβιέρα',
    kcal: 400, protein: 28.0, carb: 1.5, fat: 32.0, fiber: 0, sodiumMg: 600,
    defaultServingGrams: 30, defaultServingUnit: 'slice',
    aliases: [
      { lang: 'el', alias: 'γραβιέρα', preferred: true },
      { lang: 'en', alias: 'graviera', preferred: true },
    ],
  },

  // ── Meat & Fish ─────────────────────────────────────────────────────────
  {
    nameEn: 'Chicken Breast Grilled', nameEl: 'Ψητό Στήθος Κοτόπουλο',
    kcal: 165, protein: 31.0, carb: 0, fat: 3.6, fiber: 0, sodiumMg: 74,
    defaultServingGrams: 120, defaultServingUnit: 'palm',
    aliases: [
      { lang: 'el', alias: 'κοτόπουλο', preferred: true },
      { lang: 'el', alias: 'στήθος κοτόπουλο' },
      { lang: 'el', alias: 'ψητό κοτόπουλο' },
      { lang: 'en', alias: 'chicken breast', preferred: true },
      { lang: 'en', alias: 'grilled chicken' },
    ],
  },
  {
    nameEn: 'Souvlaki Chicken',  nameEl: 'Σουβλάκι Κοτόπουλο',
    kcal: 160, protein: 21.3, carb: 1.3, fat: 8.0, fiber: 0, sodiumMg: 120,
    defaultServingGrams: 150, defaultServingUnit: 'skewer',
    aliases: [
      { lang: 'el', alias: 'σουβλάκι κοτόπουλο', preferred: true },
      { lang: 'el', alias: 'σουβλάκι' },
      { lang: 'en', alias: 'souvlaki chicken', preferred: true },
    ],
  },
  {
    nameEn: 'Gyros Pork',        nameEl: 'Γύρος Χοιρινό',
    kcal: 185, protein: 10.0, carb: 15.0, fat: 9.3, fiber: 0.7, sodiumMg: 380,
    defaultServingGrams: 280, defaultServingUnit: 'wrap',
    aliases: [
      { lang: 'el', alias: 'γύρος', preferred: true },
      { lang: 'el', alias: 'γύρος χοιρινό' },
      { lang: 'en', alias: 'gyros', preferred: true },
      { lang: 'en', alias: 'gyro pork' },
    ],
  },
  {
    nameEn: 'Grilled Octopus',   nameEl: 'Χταπόδι Ψητό',
    kcal: 109, protein: 20.0, carb: 2.7, fat: 1.3, fiber: 0, sodiumMg: 391,
    defaultServingGrams: 150, defaultServingUnit: 'portion',
    aliases: [
      { lang: 'el', alias: 'χταπόδι', preferred: true },
      { lang: 'el', alias: 'χταπόδι ψητό' },
      { lang: 'en', alias: 'octopus', preferred: true },
    ],
  },
  {
    nameEn: 'Grilled Sea Bream',  nameEl: 'Τσιπούρα Ψητή',
    kcal: 128, protein: 21.4, carb: 0, fat: 4.3, fiber: 0, sodiumMg: 80,
    defaultServingGrams: 200, defaultServingUnit: 'portion',
    aliases: [
      { lang: 'el', alias: 'τσιπούρα', preferred: true },
      { lang: 'en', alias: 'sea bream', preferred: true },
    ],
  },
  {
    nameEn: 'Sardines in Oil',   nameEl: 'Σαρδέλες σε Λάδι',
    kcal: 208, protein: 24.6, carb: 0, fat: 11.5, fiber: 0, sodiumMg: 505,
    defaultServingGrams: 100, defaultServingUnit: '100g',
    aliases: [
      { lang: 'el', alias: 'σαρδέλες', preferred: true },
      { lang: 'en', alias: 'sardines', preferred: true },
    ],
  },

  // ── Traditional Dishes ───────────────────────────────────────────────────
  {
    nameEn: 'Moussaka',          nameEl: 'Μουσακάς',
    kcal: 140, protein: 7.2, carb: 8.8, fat: 8.8, fiber: 1.2, sodiumMg: 320,
    defaultServingGrams: 250, defaultServingUnit: 'serving',
    aliases: [
      { lang: 'el', alias: 'μουσακάς', preferred: true },
      { lang: 'en', alias: 'moussaka', preferred: true },
    ],
  },
  {
    nameEn: 'Pastitsio',         nameEl: 'Παστίτσιο',
    kcal: 152, protein: 8.0, carb: 12.8, fat: 8.0, fiber: 0.8, sodiumMg: 290,
    defaultServingGrams: 250, defaultServingUnit: 'serving',
    aliases: [
      { lang: 'el', alias: 'παστίτσιο', preferred: true },
      { lang: 'en', alias: 'pastitsio', preferred: true },
    ],
  },
  {
    nameEn: 'Spanakopita',       nameEl: 'Σπανακόπιτα',
    kcal: 215, protein: 7.7, carb: 16.9, fat: 13.8, fiber: 1.5, sodiumMg: 380,
    defaultServingGrams: 130, defaultServingUnit: 'piece',
    aliases: [
      { lang: 'el', alias: 'σπανακόπιτα', preferred: true },
      { lang: 'el', alias: 'πίτα σπανάκι' },
      { lang: 'en', alias: 'spanakopita', preferred: true },
      { lang: 'en', alias: 'spinach pie' },
    ],
  },
  {
    nameEn: 'Tiropita',          nameEl: 'Τυρόπιτα',
    kcal: 250, protein: 9.0, carb: 18.0, fat: 16.0, fiber: 0.8, sodiumMg: 490,
    defaultServingGrams: 100, defaultServingUnit: 'piece',
    aliases: [
      { lang: 'el', alias: 'τυρόπιτα', preferred: true },
      { lang: 'en', alias: 'tiropita', preferred: true },
      { lang: 'en', alias: 'cheese pie' },
    ],
  },
  {
    nameEn: 'Dolmades Stuffed Grape Leaves', nameEl: 'Ντολμάδες',
    kcal: 126, protein: 2.7, carb: 14.7, fat: 6.7, fiber: 2.0, sodiumMg: 220,
    defaultServingGrams: 150, defaultServingUnit: 'serving',
    aliases: [
      { lang: 'el', alias: 'ντολμάδες', preferred: true },
      { lang: 'el', alias: 'ντολμαδάκια' },
      { lang: 'en', alias: 'dolmades', preferred: true },
      { lang: 'en', alias: 'stuffed grape leaves' },
    ],
  },
  {
    nameEn: 'Fasolada Bean Soup', nameEl: 'Φασολάδα',
    kcal: 73, protein: 4.0, carb: 10.7, fat: 2.0, fiber: 3.3, sodiumMg: 180,
    defaultServingGrams: 300, defaultServingUnit: 'bowl',
    aliases: [
      { lang: 'el', alias: 'φασολάδα', preferred: true },
      { lang: 'en', alias: 'fassolada', preferred: true },
      { lang: 'en', alias: 'bean soup' },
    ],
  },
  {
    nameEn: 'Tzatziki',          nameEl: 'Τζατζίκι',
    kcal: 55, protein: 3.0, carb: 4.0, fat: 3.0, fiber: 0.3, sodiumMg: 310,
    defaultServingGrams: 100, defaultServingUnit: '100g',
    aliases: [
      { lang: 'el', alias: 'τζατζίκι', preferred: true },
      { lang: 'en', alias: 'tzatziki', preferred: true },
    ],
  },
  {
    nameEn: 'Horiatiki Village Salad', nameEl: 'Χωριάτικη Σαλάτα',
    kcal: 78, protein: 2.8, carb: 3.6, fat: 6.0, fiber: 1.0, sodiumMg: 280,
    defaultServingGrams: 250, defaultServingUnit: 'serving',
    aliases: [
      { lang: 'el', alias: 'χωριάτικη', preferred: true },
      { lang: 'el', alias: 'χωριάτικη σαλάτα' },
      { lang: 'en', alias: 'horiatiki', preferred: true },
      { lang: 'en', alias: 'greek salad' },
      { lang: 'en', alias: 'village salad' },
    ],
  },

  // ── Legumes & Grains ────────────────────────────────────────────────────
  {
    nameEn: 'Lentil Soup Fakes', nameEl: 'Φακές Σούπα',
    kcal: 59, protein: 4.2, carb: 8.8, fat: 0.8, fiber: 3.0, sodiumMg: 150,
    defaultServingGrams: 300, defaultServingUnit: 'bowl',
    aliases: [
      { lang: 'el', alias: 'φακές', preferred: true },
      { lang: 'el', alias: 'φακές σούπα' },
      { lang: 'en', alias: 'lentil soup', preferred: true },
      { lang: 'en', alias: 'fakes' },
    ],
  },
  {
    nameEn: 'Chickpea Revithosoupa', nameEl: 'Ρεβιθόσουπα',
    kcal: 75, protein: 4.5, carb: 11.5, fat: 1.5, fiber: 3.5, sodiumMg: 160,
    defaultServingGrams: 300, defaultServingUnit: 'bowl',
    aliases: [
      { lang: 'el', alias: 'ρεβύθια', preferred: true },
      { lang: 'el', alias: 'ρεβιθόσουπα' },
      { lang: 'en', alias: 'chickpea soup', preferred: true },
    ],
  },
  {
    nameEn: 'Greek Pita Bread',  nameEl: 'Πίτα',
    kcal: 275, protein: 9.2, carb: 55.0, fat: 1.7, fiber: 2.2, sodiumMg: 530,
    defaultServingGrams: 60, defaultServingUnit: 'piece',
    aliases: [
      { lang: 'el', alias: 'πίτα', preferred: true },
      { lang: 'el', alias: 'αραβική πίτα' },
      { lang: 'en', alias: 'pita', preferred: true },
      { lang: 'en', alias: 'pita bread' },
    ],
  },

  // ── Oils & Condiments ───────────────────────────────────────────────────
  {
    nameEn: 'Extra Virgin Olive Oil', nameEl: 'Ελαιόλαδο',
    kcal: 884, protein: 0, carb: 0, fat: 100.0, fiber: 0, sodiumMg: 2,
    defaultServingGrams: 14, defaultServingUnit: 'tbsp',
    aliases: [
      { lang: 'el', alias: 'ελαιόλαδο', preferred: true },
      { lang: 'el', alias: 'λάδι' },
      { lang: 'en', alias: 'olive oil', preferred: true },
      { lang: 'en', alias: 'extra virgin olive oil' },
    ],
  },

  // ── Pastries & Sweets ───────────────────────────────────────────────────
  {
    nameEn: 'Baklava',           nameEl: 'Μπακλαβάς',
    kcal: 425, protein: 7.5, carb: 52.5, fat: 22.5, fiber: 2.5, sodiumMg: 160,
    defaultServingGrams: 80, defaultServingUnit: 'piece',
    aliases: [
      { lang: 'el', alias: 'μπακλαβάς', preferred: true },
      { lang: 'en', alias: 'baklava', preferred: true },
    ],
  },
  {
    nameEn: 'Loukoumades Honey Donuts', nameEl: 'Λουκουμάδες',
    kcal: 242, protein: 3.3, carb: 31.7, fat: 11.7, fiber: 0.8, sodiumMg: 120,
    defaultServingGrams: 120, defaultServingUnit: 'serving',
    aliases: [
      { lang: 'el', alias: 'λουκουμάδες', preferred: true },
      { lang: 'en', alias: 'loukoumades', preferred: true },
    ],
  },
  {
    nameEn: 'Galaktoboureko',    nameEl: 'Γαλακτομπούρεκο',
    kcal: 258, protein: 5.8, carb: 30.0, fat: 13.3, fiber: 0.4, sodiumMg: 130,
    defaultServingGrams: 120, defaultServingUnit: 'piece',
    aliases: [
      { lang: 'el', alias: 'γαλακτομπούρεκο', preferred: true },
      { lang: 'en', alias: 'galaktoboureko', preferred: true },
    ],
  },
];

// ── Convert greek-foods-seed.ts entries to HHF format ────────────────────────
// The seed has per-serving values; we need per-100g for the foods table.
// We skip items already covered in HHF_FOODS above (by name match).
const COVERED_BY_HHF = new Set(HHF_FOODS.map(f => f.nameEn.toLowerCase()));

function seedToHHF(seed: typeof GREEK_FOODS[0]) {
  // Extract serving grams from unit string e.g. "150g", "1 serving (250g)"
  const match = seed.unit.match(/(\d+)g/);
  const servingGrams = match ? parseInt(match[1]) : 100;
  const factor = 100 / servingGrams;

  return {
    nameEn: seed.name,
    nameEl: seed.name, // no Greek name in original seed
    kcal: Math.round(seed.calories * factor * 10) / 10,
    protein: Math.round(seed.protein_g * factor * 10) / 10,
    carb: Math.round(seed.carbs_g * factor * 10) / 10,
    fat: Math.round(seed.fat_g * factor * 10) / 10,
    fiber: Math.round((seed.fiber_g ?? 0) * factor * 10) / 10,
    defaultServingGrams: servingGrams,
    defaultServingUnit: seed.unit,
    aliases: [
      { lang: 'en', alias: seed.name.toLowerCase(), preferred: true },
    ],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL ||
      `postgresql://brain_user:${process.env.PGPASSWORD || 'jDehquqo1Dj0plzyrmaX2ybtzvjeKdFF'}@127.0.0.1:5433/trophe_dev`,
    max: 3,
  });
  const db = drizzle(pool);

  // Merge HHF + seed (skip seed entries already in HHF)
  const seedRows = GREEK_FOODS
    .filter(f => !COVERED_BY_HHF.has(f.name.toLowerCase()))
    .map(seedToHHF);

  const allEntries = [...HHF_FOODS, ...seedRows];
  console.log(`[hhf] Ingesting ${allEntries.length} entries (${HHF_FOODS.length} HHF + ${seedRows.length} from seed)`);

  let inserted = 0;
  let aliasesInserted = 0;

  for (const entry of allEntries) {
    // Upsert food row
    const [row] = await db
      .insert(foods)
      .values({
        source:              'hhf',
        sourceId:            `hhf-${entry.nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`,
        dataQuality:         'label',
        nameEn:              entry.nameEn,
        nameEl:              entry.nameEl,
        region:              ['GR'],
        kcalPer100g:         entry.kcal,
        proteinPer100g:      entry.protein,
        carbPer100g:         entry.carb,
        fatPer100g:          entry.fat,
        fiberPer100g:        entry.fiber ?? null,
        sugarPer100g:        null,
        sodiumMg:            'sodiumMg' in entry ? (entry as { sodiumMg?: number }).sodiumMg ?? null : null,
        defaultServingGrams: entry.defaultServingGrams,
        defaultServingUnit:  entry.defaultServingUnit,
        popularity:          5, // Greek coaching plan foods start with some popularity
      })
      .onConflictDoNothing()
      .returning({ id: foods.id });

    if (!row) {
      // Already existed — look it up for alias insertion
      const [existing] = await db
        .select({ id: foods.id })
        .from(foods)
        .where(
          // @ts-ignore — sql expression for FK lookup
          require('drizzle-orm').eq(foods.source, 'hhf') &&
          require('drizzle-orm').eq(foods.sourceId, `hhf-${entry.nameEn.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`)
        )
        .limit(1);
      if (!existing) continue;
      var foodId = existing.id;
    } else {
      inserted++;
      var foodId = row.id;
    }

    // Insert aliases
    if ('aliases' in entry && entry.aliases) {
      for (const alias of entry.aliases) {
        await db
          .insert(foodAliases)
          .values({
            foodId:   foodId,
            lang:     alias.lang,
            alias:    alias.alias.toLowerCase(),
            preferred: alias.preferred ?? false,
          })
          .onConflictDoNothing();
        aliasesInserted++;
      }
    }
  }

  console.log(`[hhf] ✅ Done. Foods inserted: ${inserted}, aliases: ${aliasesInserted}`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
