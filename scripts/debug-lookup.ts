/**
 * Debug script: replicate lookupFood internals step by step.
 * Usage: npx tsx scripts/debug-lookup.ts "cafe con leche"
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db } from '../db/client';
import { foods } from '../db/schema/foods';
import { sql, inArray } from 'drizzle-orm';

async function main() {
  const foodName = process.argv[2] || 'cafe con leche';
  console.log(`\n=== Debug lookup for "${foodName}" ===\n`);

  // Step 1: Tokenize (replicating keywordCandidates)
  const tokens = foodName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-zα-ωά-ώ0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  console.log('1. Tokens:', tokens);

  const singularTokens = tokens.map(t =>
    t.length > 3 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t
  );
  console.log('2. Singular tokens:', singularTokens);

  const tsQuery = tokens.map((t, i) => {
    const s = singularTokens[i];
    return s !== t ? `(${s}:* | ${t}:*)` : `${t}:*`;
  }).join(' & ');
  console.log('3. tsQuery:', tsQuery);

  // Step 2: Run BM25
  try {
    const bm25Rows = await db
      .select()
      .from(foods)
      .where(sql`search_text @@ to_tsquery('simple', ${tsQuery})`)
      .orderBy(sql`ts_rank(search_text, to_tsquery('simple', ${tsQuery})) DESC`)
      .limit(40);
    console.log('\n4. BM25 results:', bm25Rows.length);
    bm25Rows.forEach((r, i) => console.log(`   [${i}] ${r.nameEn} (kcal=${r.kcalPer100g})`));
  } catch (e: any) {
    console.log('4. BM25 ERROR:', e.message);
  }

  // Step 3: ILIKE exactish
  const simpleQuery = tokens.join(' ');
  const exactishPattern = `${simpleQuery}%`;
  try {
    const ilike = await db
      .select()
      .from(foods)
      .where(sql`(name_en ILIKE ${exactishPattern} OR name_el ILIKE ${exactishPattern})`)
      .limit(10);
    console.log('\n5. ILIKE results:', ilike.length);
    ilike.forEach((r, i) => console.log(`   [${i}] ${r.nameEn}`));
  } catch (e: any) {
    console.log('5. ILIKE ERROR:', e.message);
  }

  // Step 4: Alias search
  try {
    const aliasRes = await db.execute<{ food_id: string }>(
      sql`SELECT DISTINCT fa.food_id FROM food_aliases fa WHERE to_tsvector('simple', fa.alias) @@ to_tsquery('simple', ${tsQuery}) LIMIT 10`
    );
    console.log('\n6. Alias hits:', aliasRes.rows.length);
    if (aliasRes.rows.length > 0) {
      const aliasIds = aliasRes.rows.map(r => r.food_id);
      const aliasFoods = await db.select().from(foods).where(inArray(foods.id, aliasIds));
      aliasFoods.forEach(r => console.log(`   ${r.nameEn} (id=${r.id})`));
    }
  } catch (e: any) {
    console.log('6. Alias ERROR:', e.message);
  }

  // Step 5: Canonical injection
  const canonPattern = `%${singularTokens.join('%')}%`;
  try {
    const canonRows = await db
      .select()
      .from(foods)
      .where(sql`canonical_food_key IS NOT NULL AND (name_en ILIKE ${canonPattern} OR name_el ILIKE ${canonPattern})`)
      .limit(10);
    console.log('\n7. Canonical results:', canonRows.length);
    canonRows.forEach(r => console.log(`   ${r.nameEn} (key=${r.canonicalFoodKey})`));
  } catch (e: any) {
    console.log('7. Canonical ERROR:', e.message);
  }

  // Step 6: Direct SQL BM25 test (to compare)
  try {
    const direct = await db.execute(
      sql`SELECT name_en, kcal_per_100g, ts_rank(search_text, to_tsquery('simple', ${tsQuery})) as rank
          FROM foods WHERE search_text @@ to_tsquery('simple', ${tsQuery})
          ORDER BY rank DESC LIMIT 5`
    );
    console.log('\n8. Direct SQL BM25:', direct.rows.length, 'rows');
    direct.rows.forEach((r: any) => console.log(`   ${r.name_en} rank=${r.rank}`));
  } catch (e: any) {
    console.log('8. Direct SQL ERROR:', e.message);
  }

  // Step 7: Direct ID lookup
  try {
    const byId = await db
      .select({ id: foods.id, nameEn: foods.nameEn, kcal: foods.kcalPer100g })
      .from(foods)
      .where(sql`id = 'b2162000-d373-4cde-9b14-a5967fe4a686'`);
    console.log('\n9. Direct ID lookup:', byId.length, byId);
  } catch (e: any) {
    console.log('9. Direct ID ERROR:', e.message);
  }

  // Step 8: Count foods
  try {
    const count = await db.execute(sql`SELECT count(*) as cnt FROM foods`);
    console.log('\n10. Total foods:', count.rows);
  } catch (e: any) {
    console.log('10. Count ERROR:', e.message);
  }

  // Step 9: Search for any food with "leche" in name
  try {
    const leche = await db
      .select({ nameEn: foods.nameEn })
      .from(foods)
      .where(sql`name_en ILIKE '%leche%'`)
      .limit(5);
    console.log('\n11. Foods with "leche":', leche.map(r => r.nameEn));
  } catch (e: any) {
    console.log('11. Leche ERROR:', e.message);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
