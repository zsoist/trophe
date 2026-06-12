/**
 * scripts/ingest/crea.ts — Italian CREA 2019 food composition ingest.
 *
 * CREA (Centro di ricerca Alimenti e Nutrizione): ~790 foods, lab-verified.
 * Scraped from alimentinutrizione.it. Government data, free for consultation.
 *
 * Data source: https://www.alimentinutrizione.it/tabelle-nutrizionali/
 * Pre-requisite: run `python3 scripts/ingest/scrape-crea.py` to generate data/crea_2019.csv
 *
 * Usage:
 *   npx tsx scripts/ingest/crea.ts
 *   CREA_CSV=path/to/crea.csv npx tsx scripts/ingest/crea.ts
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

const CSV_PATH = process.env.CREA_CSV
  || path.join(process.cwd(), 'data', 'crea_2019.csv');

const DB_URL = process.env.CREA_DB_URL
  || process.env.DIRECT_URL
  || process.env.DATABASE_URL
  || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function parseCSV(content: string): Record<string, string>[] {
  const lines = content.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    values.push(current.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) row[headers[j]] = values[j] ?? '';
    return row;
  });
}

function parseNum(val: string | undefined): number | null {
  if (!val || val.trim() === '' || val.trim() === '-') return null;
  const n = parseFloat(val.trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}

function canonicalize(name: string): string {
  return name.toLowerCase().replace(/[,()]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Italian → English food name mappings for common foods
const IT_EN_MAP: Record<string, string> = {
  'aglio': 'garlic',
  'agnello': 'lamb',
  'albicocche': 'apricots',
  'ananas': 'pineapple',
  'anatra': 'duck',
  'arancia': 'orange',
  'arance': 'oranges',
  'aringa': 'herring',
  'asparagi': 'asparagus',
  'avocado': 'avocado',
  'banane': 'bananas',
  'barbabietole': 'beets',
  'basilico': 'basil',
  'bieta': 'chard',
  'biscotti': 'cookies',
  'broccolo': 'broccoli',
  'burro': 'butter',
  'cacao': 'cocoa',
  'carciofi': 'artichokes',
  'carote': 'carrots',
  'castagne': 'chestnuts',
  'cavolfiore': 'cauliflower',
  'ceci': 'chickpeas',
  'cetrioli': 'cucumbers',
  'cioccolato': 'chocolate',
  'cipolle': 'onions',
  'coniglio': 'rabbit',
  'couscous': 'couscous',
  'crackers': 'crackers',
  'fagioli': 'beans',
  'fagiolini': 'green beans',
  'farina': 'flour',
  'farro': 'spelt',
  'fave': 'fava beans',
  'fegato': 'liver',
  'fichi': 'figs',
  'finocchi': 'fennel',
  'formaggio': 'cheese',
  'fragole': 'strawberries',
  'funghi': 'mushrooms',
  'gamberi': 'shrimp',
  'gelato': 'ice cream',
  'kiwi': 'kiwi',
  'lamponi': 'raspberries',
  'latte': 'milk',
  'lattuga': 'lettuce',
  'lenticchie': 'lentils',
  'limoni': 'lemons',
  'maiale': 'pork',
  'mais': 'corn',
  'mandorle': 'almonds',
  'mango': 'mango',
  'marmellata': 'jam',
  'melanzane': 'eggplant',
  'mele': 'apples',
  'melone': 'melon',
  'merluzzo': 'cod',
  'miele': 'honey',
  'mirtilli': 'blueberries',
  'mozzarella': 'mozzarella',
  'nocciole': 'hazelnuts',
  'noci': 'walnuts',
  'olio': 'oil',
  'olive': 'olives',
  'pane': 'bread',
  'pasta': 'pasta',
  'patate': 'potatoes',
  'peperoni': 'peppers',
  'pere': 'pears',
  'pesche': 'peaches',
  'piselli': 'peas',
  'pistacchi': 'pistachios',
  'pizza': 'pizza',
  'polenta': 'polenta',
  'pollo': 'chicken',
  'pomodori': 'tomatoes',
  'prosciutto': 'ham',
  'quinoa': 'quinoa',
  'riso': 'rice',
  'salmone': 'salmon',
  'sardine': 'sardines',
  'sedano': 'celery',
  'sgombro': 'mackerel',
  'sogliola': 'sole',
  'spinaci': 'spinach',
  'tacchino': 'turkey',
  'tonno': 'tuna',
  'trota': 'trout',
  'uova': 'eggs',
  'uva': 'grapes',
  'yogurt': 'yogurt',
  'zucca': 'pumpkin',
  'zucchero': 'sugar',
  'zucchine': 'zucchini',
};

function guessEnglish(nameIt: string): string {
  const lower = nameIt.toLowerCase();
  for (const [it, en] of Object.entries(IT_EN_MAP)) {
    if (lower.includes(it)) return `${en} (${nameIt})`;
  }
  return nameIt;
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[crea] CSV not found at ${CSV_PATH}`);
    console.error('[crea] Run: python3 scripts/ingest/scrape-crea.py');
    process.exit(1);
  }

  console.log(`[crea] reading ${CSV_PATH}...`);
  const raw = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCSV(raw);
  console.log(`[crea] parsed ${rows.length} rows`);

  const pool = new Pool({ connectionString: DB_URL });
  const db = drizzle(pool);

  // Dedup: load existing Italian-sourced foods
  const existing = await db.execute<{ source_id: string }>(
    sql`SELECT source_id FROM foods WHERE source = 'crea'`
  );
  const existingIds = new Set(existing.rows.map(r => r.source_id));
  console.log(`[crea] ${existingIds.size} existing CREA foods for dedup`);

  let inserted = 0;
  let skippedDup = 0;
  let skippedNoMacros = 0;
  let aliasesInserted = 0;

  for (const row of rows) {
    const code = row['code']?.trim();
    const nameIt = row['name_it']?.trim();
    if (!code || !nameIt) continue;

    if (existingIds.has(code)) { skippedDup++; continue; }

    const kcal = parseNum(row['kcal_100g']);
    const protein = parseNum(row['protein_100g']);
    const carbs = parseNum(row['carbs_100g']);
    const fat = parseNum(row['fat_100g']);

    if (kcal === null || protein === null || carbs === null || fat === null) {
      skippedNoMacros++;
      continue;
    }

    const fiber = parseNum(row['fiber_100g']);
    const sugar = parseNum(row['sugar_100g']);
    const sodium = parseNum(row['sodium_mg_100g']);
    const nameEn = guessEnglish(nameIt);

    try {
      const result = await db.execute(sql`
        INSERT INTO foods (
          source, source_id, data_quality,
          name_en, name_it, region,
          kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
          fiber_per_100g, sugar_per_100g, sodium_mg,
          default_serving_grams, default_serving_unit,
          macro_confidence, provenance_notes
        ) VALUES (
          'crea', ${code}, 'lab_verified',
          ${nameEn}, ${nameIt}, ARRAY['IT'],
          ${kcal}, ${protein}, ${carbs}, ${fat},
          ${fiber}, ${sugar}, ${sodium},
          100, '100g',
          0.90, ${`CREA 2019 code ${code}`}
        ) ON CONFLICT (source, source_id) DO NOTHING
        RETURNING id
      `);

      if (result.rows.length > 0) {
        inserted++;
        const foodId = result.rows[0].id;

        // Insert Italian alias
        await db.execute(sql`
          INSERT INTO food_aliases (id, food_id, alias, lang)
          VALUES (gen_random_uuid(), ${foodId}, ${nameIt}, 'it')
          ON CONFLICT DO NOTHING
        `);
        aliasesInserted++;
      }
    } catch (e: any) {
      if (!e.message?.includes('duplicate')) {
        console.error(`[crea] error inserting ${code} "${nameIt}":`, e.message);
      }
    }
  }

  console.log(`[crea] Done:`);
  console.log(`  Inserted: ${inserted}`);
  console.log(`  Aliases:  ${aliasesInserted}`);
  console.log(`  Skipped (dup): ${skippedDup}`);
  console.log(`  Skipped (no macros): ${skippedNoMacros}`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
