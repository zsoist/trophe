/**
 * scripts/ingest/bedca.ts — BEDCA (Spanish national food composition) ingest.
 *
 * BEDCA 2024: ~900 foods, lab-verified, from bedca.net.
 * Published by AESAN (Agencia Española de Seguridad Alimentaria y Nutrición).
 *
 * Data source: scraped via pybedca into data/bedca_2024.csv
 * Run scraper first: python3 scripts/ingest/scrape-bedca.py
 *
 * Usage:
 *   npx tsx scripts/ingest/bedca.ts
 *
 * Idempotent: ON CONFLICT DO NOTHING on (source, source_id).
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = process.env.BEDCA_CSV
  || path.join(process.cwd(), 'data', 'bedca_2024.csv');

function parseNumeric(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  const num = parseFloat(val.trim());
  return isNaN(num) ? null : num;
}

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === ',' && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? '';
    return row;
  });
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[bedca] ❌ CSV not found at ${CSV_PATH}`);
    console.error('[bedca] Run scraper first: python3 scripts/ingest/scrape-bedca.py');
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  console.log(`[bedca] reading ${CSV_PATH}...`);
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`[bedca] parsed ${rows.length} rows`);

  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  // Dedup: load existing Spanish names
  const existingEs = await db.execute<{ name_es: string }>(
    sql`SELECT lower(name_es) as name_es FROM foods WHERE name_es IS NOT NULL`
  );
  const existingEsNames = new Set(existingEs.rows.map(r => r.name_es?.toLowerCase()));
  console.log(`[bedca] ${existingEsNames.size} existing Spanish names for dedup`);

  let inserted = 0;
  let skippedDup = 0;
  let skippedNoMacros = 0;
  let aliasesInserted = 0;

  for (const row of rows) {
    const code = row['code']?.trim();
    const nameEs = row['name_es']?.trim() || '';
    const nameEn = row['name_en']?.trim() || '';

    if (!code || !nameEs) continue;

    const kcal = parseNumeric(row['kcal_100g']);
    const protein = parseNumeric(row['protein_100g']);
    const carbs = parseNumeric(row['carbs_100g']);
    const fat = parseNumeric(row['fat_100g']);

    if (kcal === null || protein === null || carbs === null || fat === null) {
      skippedNoMacros++;
      continue;
    }

    if (existingEsNames.has(nameEs.toLowerCase())) {
      skippedDup++;
      continue;
    }

    const fiber = parseNumeric(row['fiber_100g']);
    const sodium = parseNumeric(row['sodium_mg_100g']);

    try {
      await db.execute(sql`
        INSERT INTO foods (
          source, source_id, data_quality,
          name_en, name_es, region,
          kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
          fiber_per_100g, sodium_mg,
          default_serving_grams, default_serving_unit,
          macro_confidence, provenance_notes
        ) VALUES (
          'bedca', ${code}, 'lab_verified',
          ${nameEn || nameEs}, ${nameEs}, ARRAY['ES'],
          ${kcal}, ${protein}, ${carbs}, ${fat},
          ${fiber}, ${sodium},
          100, '100g',
          0.95, ${`BEDCA code ${code}`}
        )
        ON CONFLICT (source, source_id) DO NOTHING
      `);
      inserted++;

      // Insert Spanish alias for search
      try {
        await db.execute(sql`
          INSERT INTO food_aliases (food_id, lang, alias, preferred)
          SELECT f.id, 'es', ${nameEs.toLowerCase()}, true
          FROM foods f
          WHERE f.source = 'bedca' AND f.source_id = ${code}
          ON CONFLICT DO NOTHING
        `);
        aliasesInserted++;

        // Also insert English alias if available
        if (nameEn && nameEn !== nameEs) {
          await db.execute(sql`
            INSERT INTO food_aliases (food_id, lang, alias, preferred)
            SELECT f.id, 'en', ${nameEn.toLowerCase()}, false
            FROM foods f
            WHERE f.source = 'bedca' AND f.source_id = ${code}
            ON CONFLICT DO NOTHING
          `);
          aliasesInserted++;
        }
      } catch {
        // alias insert failures are non-fatal
      }
    } catch (err: any) {
      if (err.code === '23505') {
        skippedDup++;
      } else {
        console.error(`[bedca] ❌ failed on ${code} "${nameEs}": ${err.message}`);
      }
    }
  }

  console.log(`[bedca] ✅ done:`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  aliases:  ${aliasesInserted}`);
  console.log(`  skipped (dup): ${skippedDup}`);
  console.log(`  skipped (no macros): ${skippedNoMacros}`);

  await pool.end();
}

main().catch(err => {
  console.error('[bedca] fatal:', err);
  process.exit(1);
});
