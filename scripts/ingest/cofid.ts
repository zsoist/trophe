/**
 * scripts/ingest/cofid.ts — UK CoFID (McCance & Widdowson 2021) ingest.
 *
 * ~2,850 lab-verified UK/European foods. Open Government Licence v3.0.
 * Source: gov.uk Composition of Foods Integrated Dataset.
 *
 * Convert the Excel first (see data/cofid_2021.csv, produced from
 * sheet "1.3 Proximates" + sodium from "1.4 Inorganics").
 *
 * Dedup: skips rows whose lower(name_en) already exists in ANY source —
 * prevents generic-name shadowing (learned from the BEDCA collision incident).
 *
 * Usage:
 *   npx tsx scripts/ingest/cofid.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { sql } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = process.env.COFID_CSV
  || path.join(process.cwd(), 'data', 'cofid_2021.csv');

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

// Skip rows that are raw ingredients users never log, or UK-specific
// commercial items that would pollute multilingual matching.
const SKIP_PATTERNS = [
  /^Infant formula/i,
  /powder, raw$/i,
  /unfortified$/i,
];

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[cofid] ❌ CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) throw new Error('DATABASE_URL required');

  const rows = parseCSV(fs.readFileSync(CSV_PATH, 'utf-8'));
  console.log(`[cofid] parsed ${rows.length} rows`);

  const pool = new Pool({ connectionString: dbUrl, max: 5 });
  const db = drizzle(pool);

  // Dedup against ALL existing English names (BEDCA shadow lesson)
  const existing = await db.execute<{ n: string }>(
    sql`SELECT lower(name_en) as n FROM foods`
  );
  const existingNames = new Set(existing.rows.map(r => r.n));
  console.log(`[cofid] ${existingNames.size} existing names for dedup`);

  let inserted = 0, skippedDup = 0, skippedNoMacros = 0, skippedPattern = 0;

  for (const row of rows) {
    const code = row['code']?.trim();
    const nameEn = row['name_en']?.trim() || '';
    if (!code || !nameEn) continue;
    if (SKIP_PATTERNS.some(p => p.test(nameEn))) { skippedPattern++; continue; }

    const kcal = parseNumeric(row['kcal_100g']);
    const protein = parseNumeric(row['protein_100g']);
    const carbs = parseNumeric(row['carbs_100g']);
    const fat = parseNumeric(row['fat_100g']);
    if (kcal === null || protein === null || carbs === null || fat === null) {
      skippedNoMacros++;
      continue;
    }
    if (existingNames.has(nameEn.toLowerCase())) { skippedDup++; continue; }

    const fiber = parseNumeric(row['fiber_100g']);
    const sugar = parseNumeric(row['sugar_100g']);
    const sodium = parseNumeric(row['sodium_mg_100g']);

    try {
      await db.execute(sql`
        INSERT INTO foods (
          source, source_id, data_quality,
          name_en, region,
          kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
          fiber_per_100g, sugar_per_100g, sodium_mg,
          default_serving_grams, default_serving_unit,
          macro_confidence, provenance_notes
        ) VALUES (
          'cofid', ${code}, 'lab_verified',
          ${nameEn}, ARRAY['UK','EU'],
          ${kcal}, ${protein}, ${carbs}, ${fat},
          ${fiber}, ${sugar}, ${sodium},
          100, '100g',
          0.95, ${`CoFID 2021 code ${code}, group ${row['group'] || '?'}`}
        )
        ON CONFLICT (source, source_id) DO NOTHING
      `);
      inserted++;
    } catch (err: any) {
      if (err.code === '23505') skippedDup++;
      else console.error(`[cofid] ❌ ${code} "${nameEn}": ${err.message}`);
    }
  }

  console.log(`[cofid] ✅ inserted ${inserted}, dup ${skippedDup}, no-macros ${skippedNoMacros}, pattern-skip ${skippedPattern}`);
  await pool.end();
}

main().catch(err => { console.error('[cofid] fatal:', err); process.exit(1); });
