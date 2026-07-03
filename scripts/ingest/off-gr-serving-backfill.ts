/**
 * off-gr-serving-backfill — replace the ingest's "100g serving" fiction on
 * Greek OFF rows with the product's real serving size (lever 7, mission
 * food-input-10 forensics: "1 Danone Nature" resolved to 100g instead of the
 * actual 125g cup, etc.).
 *
 * ⚠️ RATE-LIMIT WARNING (learned 2026-07-03): search-a-licious does NOT expose
 * serving_quantity (0/6,177 hits carried it — verified), so this falls back to
 * the v2 PER-BARCODE product API. That API is capped near ~10 req/MIN; hammering
 * it at ~10 req/sec (3 workers × 300ms) gets IP-throttled to a crawl and never
 * finishes for 3,578 rows (aborted a live run 2026-07-03). DO NOT bulk-fetch
 * against the live API.
 *   Correct path for a real backfill: download the OFF bulk export
 *   (static.openfoodfacts.org → Greece products CSV / full JSONL) which carries
 *   serving_size + serving_quantity per product, join locally by barcode, and
 *   apply via reviewed SQL. This script's --fetch-only stays a small-N (≤~50)
 *   verification tool, NOT a mass fetcher. Lever 7 remains DEFERRED (task #71).
 *
 * Source: OFF v2 product API — field serving_quantity. Guarded 10–1000g.
 *
 * Writes (service-role Supabase client; RLS-bypassing ops script):
 *   foods.default_serving_grams = serving_quantity
 *   foods.default_serving_unit  = 'serving'
 *   + a food_unit_conversions ('serving', grams) row when absent
 *     (INSERT-if-not-exists; the table has no unique constraint — June pitfall)
 *
 * Resumable: only touches rows still carrying the fiction
 * (default_serving_unit = '100g'). Re-runs skip everything already fixed.
 *
 *   npx tsx scripts/ingest/off-gr-serving-backfill.ts --dry-run   # counts only
 *   npx tsx scripts/ingest/off-gr-serving-backfill.ts             # apply
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

const DRY = process.argv.includes('--dry-run');
/** --fetch-only: network phase only — reads barcodes (RLS-safe select), fetches
 *  servings from OFF, writes data/off-gr-servings.json. NO database writes;
 *  the apply happens separately via reviewed SQL (Supabase MCP). */
const FETCH_ONLY = process.argv.includes('--fetch-only');
const UA = 'Trophe/1.0 (https://trophe.app; serving-backfill)';

// search-a-licious does NOT expose serving_quantity (verified 2026-07-03:
// 0/6,177 hits carried it) — the v2 product API does. Per-barcode fetch.
async function fetchServing(barcode: string): Promise<number | string | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=serving_quantity`,
        { headers: { 'User-Agent': UA } },
      );
      if (res.ok) {
        const data = await res.json() as { status?: number; product?: { serving_quantity?: number | string } };
        return data.status === 1 ? data.product?.serving_quantity : undefined;
      }
      if (res.status === 404) return undefined;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 1200 * (attempt + 1)));
  }
  return undefined;
}

function saneServing(v: number | string | undefined): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (n == null || !isFinite(n)) return null;
  if (n < 10 || n > 1000) return null; // guard: junk / kJ-style values out
  return Math.round(n * 10) / 10;
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1) Which of our GR OFF rows still carry the 100g fiction? (paginate past
  //    supabase-js's 1000-row default cap)
  type Row = { id: string; barcode: string | null; default_serving_unit: string | null };
  const fiction: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .from('foods')
      .select('id, barcode, default_serving_unit')
      .eq('source', 'off')
      .contains('region', ['GR'])
      .eq('default_serving_unit', '100g')
      .order('id')
      .range(from, from + 999);
    if (error) throw error;
    fiction.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  console.log(`[db] fiction rows: ${fiction.length}`);

  // 2) Fetch real serving sizes per barcode (v2 API), concurrency 3
  const servings = new Map<string, number>();
  const barcodes = fiction.filter(r => r.barcode).map(r => r.barcode!) as string[];
  let done = 0;
  const q = [...barcodes];
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (q.length) {
      const bc = q.pop()!;
      const g = saneServing(await fetchServing(bc));
      // ==100 adds no behavior change over the fiction — skip to minimize churn
      if (g && g !== 100) servings.set(bc, g);
      done++;
      if (done % 250 === 0) console.log(`[fetch] ${done}/${barcodes.length} — usable ${servings.size}`);
      await new Promise(r => setTimeout(r, 300));
    }
  }));
  console.log(`[fetch] done: ${barcodes.length} barcodes, ${servings.size} with sane non-100 serving_quantity`);

  const targets = fiction.filter(r => r.barcode && servings.has(r.barcode));
  console.log(`[match] rows to update: ${targets.length}`);

  if (FETCH_ONLY) {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    mkdirSync('data', { recursive: true });
    const out = targets.map(t => ({ bc: t.barcode!, g: servings.get(t.barcode!)! }));
    writeFileSync('data/off-gr-servings.json', JSON.stringify(out));
    console.log(`[fetch-only] wrote data/off-gr-servings.json with ${out.length} rows — apply via reviewed SQL.`);
    return;
  }

  if (DRY) {
    const sample = targets.slice(0, 10).map(t => ({ barcode: t.barcode, newServing: servings.get(t.barcode!) }));
    console.log('[dry-run] sample:', JSON.stringify(sample));
    console.log('[dry-run] no writes performed.');
    return;
  }

  // 3) Apply — update foods + ensure a 'serving' conversion row
  let updated = 0, convAdded = 0, failed = 0;
  const queue = [...targets];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const t = queue.pop()!;
      const grams = servings.get(t.barcode!)!;
      const up = await service.from('foods')
        .update({ default_serving_grams: grams, default_serving_unit: 'serving' })
        .eq('id', t.id).eq('default_serving_unit', '100g'); // idempotent guard
      if (up.error) { failed++; continue; }
      updated++;
      const { data: existing } = await service.from('food_unit_conversions')
        .select('id').eq('food_id', t.id).eq('unit', 'serving').limit(1);
      if (!existing || existing.length === 0) {
        const ins = await service.from('food_unit_conversions')
          .insert({ food_id: t.id, unit: 'serving', grams_per_unit: grams, source: 'OFF serving_quantity backfill 2026-07-03' });
        if (!ins.error) convAdded++;
      }
      if (updated % 200 === 0) console.log(`[apply] ${updated}/${targets.length}…`);
    }
  });
  await Promise.all(workers);
  console.log(`[apply] DONE — foods updated: ${updated}, conversions added: ${convAdded}, failed: ${failed}`);
}

main().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
