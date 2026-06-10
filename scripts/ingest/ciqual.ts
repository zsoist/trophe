/**
 * scripts/ingest/ciqual.ts — CIQUAL 2025 (French national food composition) ingest.
 *
 * CIQUAL 2025: 3,484 foods, 74 nutrient components, lab-verified, Etalab Open License 2.0.
 * Published by ANSES (French Agency for Food, Environmental and Occupational Health & Safety).
 *
 * Data source: https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY
 * Download the English Excel file and convert to CSV first:
 *   python3 -c "import pandas; pandas.read_excel('Table_Ciqual_2025_ENG.xlsx').to_csv('ciqual_2025.csv', index=False)"
 *
 * Or place the CSV at: data/ciqual_2025.csv
 *
 * Usage:
 *   npx tsx scripts/ingest/ciqual.ts
 *   CIQUAL_CSV=path/to/ciqual.csv npx tsx scripts/ingest/ciqual.ts
 *
 * Idempotent: ON CONFLICT DO NOTHING on (source, source_id).
 * Deduplication: skips foods that already exist by matching canonical name against USDA entries.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = process.env.CIQUAL_CSV
  || path.join(process.cwd(), 'data', 'ciqual_2025.csv');

const DB_URL = process.env.CIQUAL_DB_URL
  || process.env.DIRECT_URL
  || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

// CIQUAL CSV column headers (French version, converted with simplified names)
// Nutrient values may contain: number, "traces", "< X", "-" (missing), or blank
// Decimals use comma in French: "3,14" → 3.14
const COL = {
  code: 'alim_code',
  nameFr: 'alim_nom_fr',
  groupFr: 'alim_grp_nom_fr',
  kcal: 'kcal_100g',
  protein: 'protein_100g',
  carbs: 'carbs_100g',
  fat: 'fat_100g',
  fiber: 'fiber_100g',
  sugar: 'sugar_100g',
  sodium: 'sodium_mg_100g',
} as const;

function parseNumeric(val: string | undefined): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null;
  const trimmed = val.trim();
  if (trimmed === 'traces' || trimmed === 'trace') return 0;
  // Handle "< X" values — use X as upper bound
  if (trimmed.startsWith('<')) {
    const num = parseFloat(trimmed.replace('<', '').replace(',', '.').trim());
    return isNaN(num) ? null : num / 2; // conservative: half the detection limit
  }
  // French decimal comma → dot
  const num = parseFloat(trimmed.replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseCSV(content: string): Record<string, string>[] {
  // Multiline-aware CSV parser: handles quoted fields with embedded newlines
  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  const fields: string[] = [];

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      fields.push(current.trim());
      if (fields.some(f => f !== '')) rows.push([...fields]);
      fields.length = 0;
      current = '';
    } else {
      current += ch;
    }
  }
  if (current || fields.length) {
    fields.push(current.trim());
    if (fields.some(f => f !== '')) rows.push([...fields]);
  }

  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(values => {
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? '';
    return row;
  });
}

function canonicalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[ciqual] ❌ CSV not found at ${CSV_PATH}`);
    console.error('[ciqual] Download CIQUAL 2025 Excel from:');
    console.error('  https://entrepot.recherche.data.gouv.fr/dataset.xhtml?persistentId=doi:10.57745/RDMHWY');
    console.error('Then convert to CSV:');
    console.error('  python3 -c "import pandas; pandas.read_excel(\'Table_Ciqual_2025_ENG.xlsx\').to_csv(\'data/ciqual_2025.csv\', index=False)"');
    process.exit(1);
  }

  console.log(`[ciqual] reading ${CSV_PATH}...`);
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`[ciqual] parsed ${rows.length} rows`);

  // Debug: show first row's keys to help map columns
  if (rows.length > 0) {
    const sampleKeys = Object.keys(rows[0]);
    console.log(`[ciqual] columns (${sampleKeys.length}): ${sampleKeys.slice(0, 10).join(', ')}...`);
  }

  const pool = new Pool({ connectionString: DB_URL });
  const db = drizzle(pool);

  // Dedup: load existing French names to avoid re-inserting
  const existingFr = await db.execute<{ name_fr: string }>(
    sql`SELECT lower(name_fr) as name_fr FROM foods WHERE name_fr IS NOT NULL`
  );
  const existingFrNames = new Set(existingFr.rows.map(r => canonicalize(r.name_fr)));
  console.log(`[ciqual] ${existingFrNames.size} existing French names for dedup`);

  let inserted = 0;
  let skippedDup = 0;
  let skippedNoMacros = 0;
  let aliasesInserted = 0;

  for (const row of rows) {
    const code = row[COL.code]?.trim();
    const nameFr = row[COL.nameFr]?.trim() || '';

    if (!code || !nameFr) continue;

    const kcal = parseNumeric(row[COL.kcal]);
    const protein = parseNumeric(row[COL.protein]);
    const carbs = parseNumeric(row[COL.carbs]);
    const fat = parseNumeric(row[COL.fat]);

    if (kcal === null || protein === null || carbs === null || fat === null) {
      skippedNoMacros++;
      continue;
    }

    // Dedup: skip if French name already exists
    if (existingFrNames.has(canonicalize(nameFr))) {
      skippedDup++;
      continue;
    }

    const fiber = parseNumeric(row[COL.fiber]);
    const sugar = parseNumeric(row[COL.sugar]);
    const sodium = parseNumeric(row[COL.sodium]);
    const groupFr = row[COL.groupFr]?.trim() || '';

    try {
      // name_en = nameFr (French name serves as both until manual translation)
      await db.execute(sql`
        INSERT INTO foods (
          source, source_id, data_quality,
          name_en, name_fr, region,
          kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
          fiber_per_100g, sugar_per_100g, sodium_mg,
          default_serving_grams, default_serving_unit,
          macro_confidence, provenance_notes
        ) VALUES (
          'ciqual', ${code}, 'lab_verified',
          ${nameFr}, ${nameFr}, ARRAY['FR'],
          ${kcal}, ${protein}, ${carbs}, ${fat},
          ${fiber}, ${sugar}, ${sodium},
          100, '100g',
          0.95, ${`CIQUAL 2025 code ${code}, group: ${groupFr}`}
        )
        ON CONFLICT (source, source_id) DO NOTHING
      `);
      inserted++;

      // Insert French alias for search
      try {
        await db.execute(sql`
          INSERT INTO food_aliases (food_id, lang, alias, preferred)
          SELECT f.id, 'fr', ${nameFr.toLowerCase()}, true
          FROM foods f
          WHERE f.source = 'ciqual' AND f.source_id = ${code}
          ON CONFLICT DO NOTHING
        `);
        aliasesInserted++;
      } catch {
        // alias insert failures are non-fatal
      }
    } catch (err: any) {
      if (err.code === '23505') {
        skippedDup++;
      } else {
        console.error(`[ciqual] ❌ failed on ${code} "${nameFr}": ${err.message}`);
      }
    }
  }

  console.log(`[ciqual] ✅ done:`);
  console.log(`  inserted: ${inserted}`);
  console.log(`  aliases:  ${aliasesInserted}`);
  console.log(`  skipped (dup): ${skippedDup}`);
  console.log(`  skipped (no macros): ${skippedNoMacros}`);

  await pool.end();
}

main().catch(err => {
  console.error('[ciqual] fatal:', err);
  process.exit(1);
});
