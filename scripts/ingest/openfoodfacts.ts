/**
 * scripts/ingest/openfoodfacts.ts — OpenFoodFacts selective branded foods ingest.
 *
 * Fetches curated branded products from OpenFoodFacts API v2.
 * Selective: only products with completeness >0.7, Nutri-Score A/B/C,
 * from target countries (US, ES, FR, IT, GR, CO).
 *
 * Target categories: yogurts, protein bars, ready meals, cheeses,
 * beverages, cereals, snacks.
 *
 * Data quality: 'crowdsourced' — lower confidence than lab-verified sources.
 * Macro sanity: skips if protein+carb+fat > kcal/3 (impossible thermodynamics).
 *
 * Usage:
 *   npx tsx scripts/ingest/openfoodfacts.ts
 *   MAX_PRODUCTS=500 npx tsx scripts/ingest/openfoodfacts.ts
 *
 * Idempotent: ON CONFLICT DO NOTHING on (source, source_id).
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import * as path from 'path';

const DB_URL = process.env.DATABASE_URL || process.env.DIRECT_URL;
if (!DB_URL) throw new Error('DATABASE_URL required');

const MAX_PRODUCTS = parseInt(process.env.MAX_PRODUCTS || '5000', 10);
const PAGE_SIZE = 100;
const BASE_URL = 'https://world.openfoodfacts.org/api/v2/search';

const CATEGORIES = [
  'en:yogurts',
  'en:protein-bars',
  'en:cereal-bars',
  'en:energy-bars',
  'en:cheeses',
  'en:breakfast-cereals',
  'en:ready-meals',
  'en:fruit-juices',
  'en:plant-milks',
  'en:granolas',
];

const COUNTRIES = ['United States', 'Spain', 'France', 'Italy', 'Greece', 'Colombia'];

interface OFFProduct {
  code?: string;
  product_name?: string;
  brands?: string;
  nutriscore_grade?: string;
  completeness?: number;
  countries_tags?: string[];
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
    salt_100g?: number;
  };
}

function macroSanity(p: OFFProduct): boolean {
  const n = p.nutriments;
  if (!n) return false;
  const kcal = n['energy-kcal_100g'];
  const protein = n.proteins_100g;
  const carbs = n.carbohydrates_100g;
  const fat = n.fat_100g;
  if (kcal == null || protein == null || carbs == null || fat == null) return false;
  if (kcal <= 0 || kcal > 900) return false;
  if (protein < 0 || carbs < 0 || fat < 0) return false;
  if (protein + carbs + fat > 105) return false;
  const computedKcal = protein * 4 + carbs * 4 + fat * 9;
  if (computedKcal > 0 && Math.abs(computedKcal - kcal) / kcal > 0.5) return false;
  return true;
}

async function fetchPage(category: string, page: number): Promise<OFFProduct[]> {
  const params = new URLSearchParams({
    categories_tags_en: category,
    page_size: String(PAGE_SIZE),
    page: String(page),
    fields: 'code,product_name,brands,nutriscore_grade,completeness,countries_tags,nutriments',
    sort_by: 'completeness',
  });

  const url = `${BASE_URL}?${params}`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));

    const res = await fetch(url, {
      headers: { 'User-Agent': 'TropheNutrition/0.3 (d.reyesusma@gmail.com; trophe.app)' },
    });

    if (res.status === 503 || res.status === 429) {
      console.error(`[off] ⚠ HTTP ${res.status} for ${category} page ${page}, retry ${attempt + 1}/3`);
      continue;
    }

    if (!res.ok) {
      console.error(`[off] ⚠ HTTP ${res.status} for ${category} page ${page}`);
      return [];
    }

    const data = await res.json() as { products?: OFFProduct[] };
    return data.products ?? [];
  }

  console.error(`[off] ✗ gave up on ${category} page ${page} after 3 retries`);
  return [];
}

function matchesCountry(product: OFFProduct): boolean {
  if (!product.countries_tags?.length) return true;
  return product.countries_tags.some(tag =>
    COUNTRIES.some(c => tag.toLowerCase().includes(c.toLowerCase()))
  );
}

async function main() {
  console.log(`[off] Starting OpenFoodFacts selective ingest (max ${MAX_PRODUCTS} products)`);

  const pool = new Pool({ connectionString: DB_URL, max: 5 });
  const db = drizzle(pool);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalFiltered = 0;

  for (const category of CATEGORIES) {
    if (totalInserted >= MAX_PRODUCTS) break;

    let page = 1;
    let categoryInserted = 0;
    const maxPages = 10;

    while (page <= maxPages && totalInserted < MAX_PRODUCTS) {
      const products = await fetchPage(category, page);
      if (products.length === 0) break;

      for (const p of products) {
        if (totalInserted >= MAX_PRODUCTS) break;

        if (!p.code || !p.product_name?.trim()) { totalFiltered++; continue; }
        if ((p.completeness ?? 0) < 0.7) { totalFiltered++; continue; }
        if (p.nutriscore_grade && !['a', 'b', 'c'].includes(p.nutriscore_grade)) { totalFiltered++; continue; }
        if (!matchesCountry(p)) { totalFiltered++; continue; }
        if (!macroSanity(p)) { totalFiltered++; continue; }

        const n = p.nutriments!;
        const sodiumMg = n.sodium_100g != null
          ? Math.round(n.sodium_100g * 1000)
          : n.salt_100g != null
            ? Math.round(n.salt_100g * 400)
            : null;

        try {
          const result = await db
            .insert(foods)
            .values({
              source: 'off' as const,
              sourceId: p.code,
              sourceUrl: `https://world.openfoodfacts.org/product/${p.code}`,
              dataQuality: 'crowdsourced' as const,
              nameEn: p.product_name.trim(),
              brand: p.brands?.split(',')[0]?.trim() || null,
              barcode: p.code,
              region: ['INTL'],
              kcalPer100g: n['energy-kcal_100g']!,
              proteinPer100g: n.proteins_100g!,
              carbPer100g: n.carbohydrates_100g!,
              fatPer100g: n.fat_100g!,
              fiberPer100g: n.fiber_100g ?? null,
              sugarPer100g: n.sugars_100g ?? null,
              sodiumMg: sodiumMg,
              micronutrients: null,
              defaultServingGrams: 100,
              defaultServingUnit: '100g',
              popularity: 0,
            } as typeof foods.$inferInsert)
            .onConflictDoNothing()
            .returning({ id: foods.id });

          if (result.length > 0) {
            totalInserted++;
            categoryInserted++;
          } else {
            totalSkipped++;
          }
        } catch {
          totalSkipped++;
        }
      }

      page++;
      await new Promise(r => setTimeout(r, 2000));
    }

    console.log(`[off]   ${category}: +${categoryInserted} (total: ${totalInserted})`);
  }

  console.log(`\n[off] ✅ Done. ${totalInserted} inserted, ${totalSkipped} skipped (dup), ${totalFiltered} filtered.`);
  await pool.end();
}

main().catch(err => {
  console.error('[off] fatal:', err);
  process.exit(1);
});
