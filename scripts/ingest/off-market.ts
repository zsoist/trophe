/**
 * scripts/ingest/off-market.ts — parametrized OpenFoodFacts harvest by market.
 *
 * Generalizes off-greece.ts to any Nutrafit launch market. Pulls every product
 * for a country with usable macros from the search-a-licious API (the classic
 * OFF API 503'd through June 2026), localized name into the right name_* column,
 * EAN barcode into foods.barcode → barcode scanning works per market.
 *
 * Idempotent: ON CONFLICT (source, source_id) DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/ingest/off-market.ts de    # Germany  → name_de? no col → name_en + region DE
 *   npx tsx scripts/ingest/off-market.ts nl
 *   npx tsx scripts/ingest/off-market.ts it pt fr   # several at once
 *
 * Note: only EL/ES/FR/IT/NL have dedicated name_* columns. For markets without
 * one (DE), the German product_name lands in name_en if no English name exists,
 * and region tags it — keeps the row matchable without a schema change.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';

const BASE = 'https://search.openfoodfacts.org/search';
const PAGE_SIZE = 100;

// market code → { OFF country tag, region code, localized name column + OFF field }
const MARKETS: Record<string, { country: string; region: string; nameCol?: keyof typeof foods.$inferInsert; offField?: string; host: string }> = {
  de: { country: 'en:germany',     region: 'DE', host: 'de' },
  nl: { country: 'en:netherlands', region: 'NL', nameCol: 'nameNl', offField: 'product_name_nl', host: 'nl' },
  it: { country: 'en:italy',       region: 'IT', nameCol: 'nameIt', offField: 'product_name_it', host: 'it' },
  pt: { country: 'en:portugal',    region: 'PT', host: 'pt' },
  fr: { country: 'en:france',      region: 'FR', nameCol: 'nameFr', offField: 'product_name_fr', host: 'fr' },
};

interface Hit {
  code?: string;
  product_name?: string;
  brands?: string[] | string;
  nutriments?: {
    'energy-kcal_100g'?: number;
    proteins_100g?: number;
    carbohydrates_100g?: number;
    fat_100g?: number;
    fiber_100g?: number;
    sugars_100g?: number;
    sodium_100g?: number;
  };
  [k: string]: unknown;
}

function sane(n: NonNullable<Hit['nutriments']>): boolean {
  const kcal = n['energy-kcal_100g'];
  const p = n.proteins_100g, c = n.carbohydrates_100g, f = n.fat_100g;
  if (kcal == null || p == null || c == null || f == null) return false;
  if (kcal <= 0 || kcal > 900 || p < 0 || c < 0 || f < 0) return false;
  if (p + c + f > 105) return false;
  const atwater = p * 4 + c * 4 + f * 9;
  if (atwater > 0 && kcal > 0 && Math.abs(atwater - kcal) / Math.max(kcal, 1) > 0.6) return false;
  return true;
}

async function fetchPage(query: string, fields: string, page: number): Promise<{ hits: Hit[]; pageCount: number }> {
  const params = new URLSearchParams({ q: query, page_size: String(PAGE_SIZE), page: String(page), fields });
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

async function harvest(code: string, db: ReturnType<typeof drizzle>) {
  const m = MARKETS[code];
  if (!m) { console.error(`[off] unknown market '${code}'. Known: ${Object.keys(MARKETS).join(', ')}`); return; }
  const query = `countries_tags:"${m.country}" AND nutriments.energy-kcal_100g:[1 TO 900]`;
  const fields = ['code', 'product_name', m.offField, 'brands', 'nutriments', 'completeness'].filter(Boolean).join(',');

  let inserted = 0, skipped = 0, filtered = 0, page = 1, pageCount = 1;
  while (page <= pageCount) {
    const { hits, pageCount: pc } = await fetchPage(query, fields, page);
    pageCount = pc || pageCount;
    if (hits.length === 0) break;

    const rows: typeof foods.$inferInsert[] = [];
    for (const h of hits) {
      const localized = m.offField ? (h[m.offField] as string | undefined)?.trim() : undefined;
      const nameEn = h.product_name?.trim() || localized;
      if (!h.code || !nameEn || !h.nutriments || !sane(h.nutriments)) { filtered++; continue; }
      const n = h.nutriments;
      const brand = Array.isArray(h.brands) ? h.brands[0] : h.brands;
      const row: typeof foods.$inferInsert = {
        source: 'off',
        sourceId: h.code,
        sourceUrl: `https://${m.host}.openfoodfacts.org/product/${h.code}`,
        dataQuality: 'crowdsourced',
        nameEn,
        brand: brand?.trim() || null,
        barcode: h.code,
        region: [m.region],
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
      };
      if (m.nameCol && localized) (row[m.nameCol] as string) = localized;
      rows.push(row);
    }

    if (rows.length > 0) {
      const res = await db.insert(foods).values(rows).onConflictDoNothing().returning({ id: foods.id });
      inserted += res.length;
      skipped += rows.length - res.length;
    }
    if (page % 5 === 0 || page === pageCount) {
      console.log(`[off-${code}] page ${page}/${pageCount} — ${inserted} inserted, ${skipped} dup, ${filtered} filtered`);
    }
    page++;
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`[off-${code}] ✅ ${inserted} products inserted (${skipped} dup, ${filtered} filtered)`);
}

async function main() {
  const codes = process.argv.slice(2).map(s => s.toLowerCase());
  if (codes.length === 0) { console.error('Usage: off-market.ts <market...>  (de nl it pt fr)'); process.exit(1); }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);
  for (const code of codes) await harvest(code, db);
  console.log('\n[off] done. Next: npx tsx scripts/ingest/embed-foods.ts');
  await pool.end();
}

main().catch((err) => { console.error('[off] fatal:', err); process.exit(1); });
