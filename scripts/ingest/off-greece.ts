/**
 * scripts/ingest/off-greece.ts — Greek OpenFoodFacts harvest (with barcodes).
 *
 * Pulls every Greek-market product with usable macros from the
 * search-a-licious API (the classic OFF API was 503ing through June 2026).
 * Greek names land in name_el, the EAN barcode in foods.barcode — this is
 * the dataset that makes barcode scanning work for Greek users.
 *
 * Idempotent: ON CONFLICT (source, source_id) DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/ingest/off-greece.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';

const BASE = 'https://search.openfoodfacts.org/search';
const QUERY = 'countries_tags:"en:greece" AND nutriments.energy-kcal_100g:[1 TO 900]';
const PAGE_SIZE = 100;
const FIELDS = 'code,product_name,product_name_el,brands,nutriments,completeness';

interface Hit {
  code?: string;
  product_name?: string;
  product_name_el?: string;
  brands?: string[] | string;
  completeness?: number;
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
  };
}

function sane(n: NonNullable<Hit['nutriments']>): boolean {
  const kcal = n['energy-kcal_100g'];
  const p = n.proteins_100g, c = n.carbohydrates_100g, f = n.fat_100g;
  if (kcal == null || p == null || c == null || f == null) return false;
  if (kcal <= 0 || kcal > 900 || p < 0 || c < 0 || f < 0) return false;
  if (p + c + f > 105) return false;
  // Zero-macro hole (2026-07-02): when P=C=F=0 the Atwater check below is
  // skipped entirely, so a row claiming 400 kcal with no macros passed. Useless
  // for macro coaching — reject. (kcal ≤ 20 zero-macro items like diet drinks stay.)
  if (p + c + f === 0 && kcal > 20) return false;
  const atwater = p * 4 + c * 4 + f * 9;
  if (atwater > 0 && kcal > 0 && Math.abs(atwater - kcal) / Math.max(kcal, 1) > 0.6) return false;
  return true;
}

async function fetchPage(page: number): Promise<{ hits: Hit[]; pageCount: number }> {
  const params = new URLSearchParams({
    q: QUERY,
    page_size: String(PAGE_SIZE),
    page: String(page),
    fields: FIELDS,
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000 * attempt));
    const res = await fetch(`${BASE}?${params}`, {
      headers: { 'User-Agent': 'TropheNutrition/0.3 (d.reyesusma@gmail.com; trophe.app)' },
    });
    if (!res.ok) continue;
    const data = await res.json() as { hits?: Hit[]; page_count?: number };
    return { hits: data.hits ?? [], pageCount: data.page_count ?? 0 };
  }
  return { hits: [], pageCount: 0 };
}

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  let inserted = 0, skipped = 0, filtered = 0;
  let page = 1, pageCount = 1;

  while (page <= pageCount) {
    const { hits, pageCount: pc } = await fetchPage(page);
    pageCount = pc || pageCount;
    if (hits.length === 0) break;

    const rows = [];
    for (const h of hits) {
      const nameEl = h.product_name_el?.trim();
      const nameEn = h.product_name?.trim() || nameEl;
      if (!h.code || !nameEn || !h.nutriments || !sane(h.nutriments)) { filtered++; continue; }
      const n = h.nutriments;
      const brand = Array.isArray(h.brands) ? h.brands[0] : h.brands;
      rows.push({
        source: 'off' as const,
        sourceId: h.code,
        sourceUrl: `https://gr.openfoodfacts.org/product/${h.code}`,
        dataQuality: 'crowdsourced' as const,
        nameEn,
        nameEl: nameEl ?? null,
        brand: brand?.trim() || null,
        barcode: h.code,
        region: ['GR'],
        kcalPer100g: n['energy-kcal_100g']!,
        proteinPer100g: n.proteins_100g!,
        carbPer100g: n.carbohydrates_100g!,
        fatPer100g: n.fat_100g!,
        fiberPer100g: n.fiber_100g ?? null,
        sugarPer100g: n.sugars_100g ?? null,
        sodiumMg: n.sodium_100g != null ? Math.round(n.sodium_100g * 1000) : null,
        defaultServingGrams: 100,
        defaultServingUnit: '100g',
        popularity: 0,
      });
    }

    if (rows.length > 0) {
      const res = await db
        .insert(foods)
        .values(rows as typeof foods.$inferInsert[])
        .onConflictDoNothing()
        .returning({ id: foods.id });
      inserted += res.length;
      skipped += rows.length - res.length;
    }

    if (page % 5 === 0 || page === pageCount) {
      console.log(`[off-gr] page ${page}/${pageCount} — ${inserted} inserted, ${skipped} dup, ${filtered} filtered`);
    }
    page++;
    await new Promise((r) => setTimeout(r, 400));
  }

  console.log(`\n[off-gr] ✅ ${inserted} Greek products with barcodes inserted (${skipped} dup, ${filtered} filtered)`);
  await pool.end();
}

main().catch((err) => { console.error('[off-gr] fatal:', err); process.exit(1); });
