/**
 * scripts/ingest/nevo.ts — Dutch NEVO (RIVM NEVO-online 2023) ingest.
 *
 * ~2,200 lab-verified Dutch foods. Open data (RIVM), the authoritative NL
 * composition table — Nutrafit market matrix: NL locale shipped 2026-06-12,
 * this is the matching food DB.
 *
 * Data file: download "NEVO-online versie 2023" CSV export from
 * https://nevo-online.rivm.nl/ (Downloads → CSV) and save as
 * data/nevo_2023.csv (or set NEVO_CSV). Column headers in the export are
 * Dutch; the HEADER map below adapts if RIVM renames them.
 *
 * Dedup: skips rows whose lower(name_en) already exists in ANY source —
 * prevents generic-name shadowing (BEDCA collision lesson).
 *
 * Usage:
 *   npx tsx scripts/ingest/nevo.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import * as fs from 'fs';
import * as path from 'path';

const CSV_PATH = process.env.NEVO_CSV
  || path.join(process.cwd(), 'data', 'nevo_2023.csv');

// NEVO-online 2023 export headers → our fields. Adjust here if the export differs.
const HEADER = {
  code: 'NEVO-code',
  nameNl: 'Voedingsmiddelnaam',
  nameEn: 'Engelse naam',
  kcal: 'ENERCC (kcal)',
  protein: 'PROT (g)',
  carbs: 'CHO (g)',
  fat: 'FAT (g)',
  fiber: 'FIBT (g)',
  sugar: 'SUGMB (g)',
  sodiumMg: 'NA (mg)',
} as const;

function parseNumeric(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null;
  // NEVO uses comma decimals in some exports
  const num = parseFloat(val.trim().replace(',', '.'));
  return isNaN(num) ? null : num;
}

function parseCSV(content: string, sep: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (const ch of line) {
      if (ch === '"') { inQuotes = !inQuotes; }
      else if (ch === sep && !inQuotes) { values.push(current.trim()); current = ''; }
      else { current += ch; }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? '';
    return row;
  });
}

// Lab-prep rows and fortified-infant products pollute consumer matching.
const SKIP_PATTERNS = [
  /^Infant formula/i,
  /zuigelingenvoeding/i,
  /^Human milk/i,
  /laboratory/i,
];

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[nevo] Missing ${CSV_PATH}.`);
    console.error('[nevo] Download the CSV export from https://nevo-online.rivm.nl/ first.');
    process.exit(1);
  }
  const { db } = await import('../../db/client');
  const { sql } = await import('drizzle-orm');

  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  // RIVM exports use '|' or ';' depending on version; sniff the header line.
  const sep = content.slice(0, content.indexOf('\n')).includes('|') ? '|'
    : content.slice(0, content.indexOf('\n')).includes(';') ? ';' : ',';
  const rows = parseCSV(content, sep);
  console.log(`[nevo] ${rows.length} rows, separator '${sep}'`);

  const existing = await db.execute(sql`SELECT lower(name_en) AS n FROM foods`);
  const known = new Set((existing.rows as Array<{ n: string }>).map(r => r.n));

  let inserted = 0, skippedDup = 0, skippedBad = 0;
  for (const row of rows) {
    const nameEn = row[HEADER.nameEn]?.trim();
    const nameNl = row[HEADER.nameNl]?.trim();
    const code = row[HEADER.code]?.trim();
    if (!nameEn || !code) { skippedBad++; continue; }
    if (SKIP_PATTERNS.some(p => p.test(nameEn) || p.test(nameNl ?? ''))) { skippedBad++; continue; }

    const kcal = parseNumeric(row[HEADER.kcal]);
    const protein = parseNumeric(row[HEADER.protein]);
    const carbs = parseNumeric(row[HEADER.carbs]);
    const fat = parseNumeric(row[HEADER.fat]);
    if (kcal === null || protein === null || carbs === null || fat === null) { skippedBad++; continue; }
    // Atwater sanity: macros shouldn't imply > ~135% of stated kcal
    const atwater = protein * 4 + carbs * 4 + fat * 9;
    if (kcal > 0 && atwater > kcal * 1.35 + 25) { skippedBad++; continue; }
    if (known.has(nameEn.toLowerCase())) { skippedDup++; continue; }

    await db.execute(sql`
      INSERT INTO foods (source, source_id, data_quality, name_en, name_nl, region,
        kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
        fiber_per_100g, sugar_per_100g, sodium_mg, macro_confidence, provenance_notes)
      VALUES ('nevo', ${`nevo_${code}`}, 'lab_verified', ${nameEn}, ${nameNl || null}, ${sql.raw(`ARRAY['NL']`)},
        ${kcal}, ${protein}, ${carbs}, ${fat},
        ${parseNumeric(row[HEADER.fiber])}, ${parseNumeric(row[HEADER.sugar])},
        ${parseNumeric(row[HEADER.sodiumMg])}, 0.9,
        ${`NEVO-online 2023 #${code}`})
      ON CONFLICT (source, source_id) DO NOTHING
    `);
    known.add(nameEn.toLowerCase());
    inserted++;
    if (inserted % 250 === 0) console.log(`[nevo] inserted ${inserted}...`);
  }
  console.log(`[nevo] done: ${inserted} inserted, ${skippedDup} dup-skipped, ${skippedBad} filtered`);
  console.log('[nevo] next: npx tsx scripts/ingest/embed-foods.ts');
  process.exit(0);
}

main();
