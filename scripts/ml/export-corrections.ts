/**
 * scripts/ml/export-corrections.ts — export the correction-capture flywheel
 * (food_parse_corrections) into a fine-tuning dataset (JSONL).
 *
 * Each human correction of an AI-parsed entry is a gold label on OUR Greek/EU
 * cuisine distribution — the labeled data the research (FoodyLLM 43→92% fat,
 * NHANES-PEFT 3.5× MAE reduction) identifies as the path to <10% MAPE.
 *
 * Output: one JSONL line per correction, in an instruction→completion shape ready
 * for LoRA fine-tuning of the food-parse macro estimator.
 *
 *   npx tsx scripts/ml/export-corrections.ts > data/ft/food-parse-corrections.jsonl
 *
 * Run when there are 1,000+ corrections (the research's minimum for a meaningful
 * fine-tune). Until then this is the accumulation mechanism — let it fill.
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const { db } = await import('../../db/client');
  const { sql } = await import('drizzle-orm');

  const r = await db.execute(sql`
    SELECT input_text, qty_input, qty_input_unit, ai_source,
           ai_calories, ai_protein_g, ai_carbs_g, ai_fat_g,
           corrected_calories, corrected_protein_g, corrected_carbs_g, corrected_fat_g
    FROM food_parse_corrections
    ORDER BY created_at ASC
  `);
  const rows = r.rows as Array<Record<string, number | string | null>>;

  let exported = 0;
  for (const row of rows) {
    const qty = row.qty_input ? `${row.qty_input}${row.qty_input_unit ? ' ' + row.qty_input_unit : ''} ` : '';
    const prompt = `Estimate macronutrients for: ${qty}${row.input_text}`;
    const completion = {
      calories: Number(row.corrected_calories),
      protein_g: Number(row.corrected_protein_g),
      carbs_g: Number(row.corrected_carbs_g),
      fat_g: Number(row.corrected_fat_g),
    };
    // Skip degenerate rows (all-zero correction = likely a delete, not a label)
    if (Object.values(completion).every((v) => !v)) continue;
    process.stdout.write(JSON.stringify({
      messages: [
        { role: 'system', content: 'You are a nutrition macro estimator. Output JSON macros.' },
        { role: 'user', content: prompt },
        { role: 'assistant', content: JSON.stringify(completion) },
      ],
      meta: { ai_source: row.ai_source, ai: { calories: Number(row.ai_calories), fat_g: Number(row.ai_fat_g) } },
    }) + '\n');
    exported++;
  }
  console.error(`[export-corrections] ${exported} labels exported (of ${rows.length} rows). Fine-tune at ≥1000.`);
  process.exit(0);
}

main().catch((err) => { console.error('[export-corrections] fatal:', err); process.exit(1); });
