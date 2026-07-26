/**
 * scripts/eval/generate-replacement-cases.ts
 *
 * Generates replacement benchmark cases targeting foods KNOWN to be in our DB.
 * Uses DeepSeek exclusively. Merges into existing v3 dataset.
 *
 * Usage:
 *   npx tsx scripts/eval/generate-replacement-cases.ts
 *   DRY_RUN=1 npx tsx scripts/eval/generate-replacement-cases.ts
 */

import { loadEnvConfig } from '@next/env';

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAID_AI_ENDPOINT_GROUPS, requirePaidAiToolApproval } from '../safety/require-paid-ai-approval';

const dryRun = process.env.DRY_RUN === '1';
if (dryRun) {
  console.log('[gen] DRY_RUN — provider attempts: 0; dotenv loads: 0; report mutations: 0.');
  process.exit(0);
}
const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-generate-replacements',
  argv: process.argv.slice(2),
  env: process.env,
  endpoints: PAID_AI_ENDPOINT_GROUPS.factoryRuntime,
});
loadEnvConfig(process.cwd());

type Range = { min: number; max: number };
type EvalCase = {
  id: string;
  input: string;
  language: 'en' | 'es' | 'el' | 'fr' | 'mixed';
  category: string;
  expect_item_count: number;
  expect_total: {
    calories?: Range;
    protein_g?: Range;
    carbs_g?: Range;
    fat_g?: Range;
  } | null;
  expect_safety: boolean;
  expect_needs_clarification: boolean;
  notes?: string;
};

// Foods confirmed to resolve in our pipeline (from successful v3.1 runs)
const DB_FOODS = {
  en: [
    'chicken breast', 'salmon', 'rice', 'broccoli', 'eggs', 'oatmeal', 'banana',
    'avocado', 'sweet potato', 'greek yogurt', 'almonds', 'olive oil', 'quinoa',
    'cottage cheese', 'turkey breast', 'spinach', 'whole wheat bread', 'apple',
    'peanut butter', 'tuna', 'lentils', 'brown rice', 'tofu', 'blueberries',
    'milk', 'cheddar cheese', 'pasta', 'orange juice', 'steak', 'shrimp',
  ],
  fr: [
    'poulet', 'saumon', 'riz', 'brocoli', 'oeuf', 'avocat', 'yaourt',
    'pain', 'fromage', 'lait', 'boeuf', 'croissant', 'baguette', 'camembert',
    'croque-monsieur', 'ratatouille', 'cassoulet', 'couscous', 'quiche',
    'crêpe', 'salade niçoise', 'soupe à l\'oignon', 'gratin dauphinois',
  ],
  es: [
    'pollo', 'arroz', 'frijoles', 'huevo', 'aguacate', 'plátano', 'leche',
    'pan', 'queso', 'carne asada', 'tortilla', 'empanada', 'arepa',
    'ceviche', 'tamales', 'pupusa', 'gallo pinto',
  ],
  el: [
    'κοτόπουλο', 'ρύζι', 'αυγό', 'γιαούρτι', 'ψωμί', 'τυρί', 'ελαιόλαδο',
    'σαλάτα', 'μουσακάς', 'σουβλάκι', 'τζατζίκι', 'σπανακόπιτα', 'χταπόδι',
    'φέτα', 'γύρος', 'παστίτσιο', 'φασολάδα',
  ],
};

const REPLACEMENT_SPECS: Array<{
  count: number;
  lang: 'en' | 'fr' | 'es' | 'el' | 'mixed';
  category: string;
  guidance: string;
}> = [
  { count: 15, lang: 'fr', category: 'base_food', guidance: 'Simple French food inputs with explicit quantities. Use foods from this list: ' + DB_FOODS.fr.join(', ') + '. Format like "150g de poulet grillé" or "2 oeufs durs". Keep portions realistic.' },
  { count: 10, lang: 'fr', category: 'composite', guidance: 'French prepared dishes with quantities. Use: ' + DB_FOODS.fr.slice(10).join(', ') + '. Format like "1 part de quiche lorraine" or "1 assiette de couscous royal".' },
  { count: 10, lang: 'en', category: 'multi_item', guidance: 'Full English meal descriptions with 2-4 items. Use foods from: ' + DB_FOODS.en.join(', ') + '. Format like "grilled chicken breast 200g, brown rice 150g, and steamed broccoli 100g".' },
  { count: 8, lang: 'es', category: 'base_food', guidance: 'Simple Spanish food inputs. Use: ' + DB_FOODS.es.join(', ') + '. Format like "200g de arroz con frijoles" or "1 arepa con queso".' },
  { count: 8, lang: 'el', category: 'base_food', guidance: 'Simple Greek food inputs. Use: ' + DB_FOODS.el.join(', ') + '. Format like "1 μερίδα μουσακά" or "200γρ γιαούρτι με μέλι".' },
  { count: 10, lang: 'en', category: 'beverages', guidance: 'Drink inputs: coffee with milk, orange juice 250ml, protein shake with banana, green smoothie, glass of red wine, iced latte with oat milk, chai tea latte, hot chocolate, beer 330ml, sparkling water with lemon.' },
  { count: 8, lang: 'fr', category: 'beverages', guidance: 'French drink inputs: café au lait, jus d\'orange pressé, verre de vin rouge, limonade, thé vert, chocolat chaud, bière blonde 33cl, smoothie aux fruits.' },
  { count: 8, lang: 'mixed', category: 'code_switch', guidance: 'Mixed language inputs. Combine 2 languages naturally: "I had some γιαούρτι with honey and walnuts", "petit déjeuner: scrambled eggs y tostadas", "arroz con pollo and a side salad".' },
  { count: 10, lang: 'en', category: 'supplements', guidance: 'Supplement inputs: 1 scoop whey protein, 5g creatine monohydrate, 2 fish oil capsules, multivitamin tablet, 10g BCAA powder, pre-workout scoop, collagen peptides 15g, vitamin D 2000IU, zinc 50mg, magnesium citrate 400mg.' },
  { count: 8, lang: 'en', category: 'regional_cuisine', guidance: 'Regional food inputs using known foods: chicken shawarma wrap, falafel plate with hummus, lamb kebab with rice, chicken tikka masala with naan, pad thai with shrimp, pho with beef, bibimbap with egg, jerk chicken with rice and peas.' },
  { count: 5, lang: 'fr', category: 'regional_cuisine', guidance: 'French regional inputs: tajine de poulet au citron, couscous aux légumes, brick à l\'oeuf, merguez grillées 2 pièces, pastilla au poulet.' },
];

async function generateCases(spec: typeof REPLACEMENT_SPECS[0]): Promise<EvalCase[]> {
  const { generateFactoryText } = await import('./factory-runtime');
  const prompt = `Generate exactly ${spec.count} nutrition benchmark test cases for category "${spec.category}" in language "${spec.lang}".

${spec.guidance}

Each case must have this exact JSON structure:
- "input": the food description a user would type (in ${spec.lang})
- "language": "${spec.lang}"
- "category": "${spec.category}"
- "expect_item_count": number of distinct food items
- "expect_total": { "calories": {"min": N, "max": N}, "protein_g": {"min": N, "max": N}, "carbs_g": {"min": N, "max": N}, "fat_g": {"min": N, "max": N} }
  Use ±15% tolerance ranges around the expected value. Base values on USDA/CIQUAL.
- "expect_safety": true
- "expect_needs_clarification": false (all inputs should be parseable)
- "notes": brief nutrition reference

Return ONLY a JSON array. No markdown.`;

  const content = await generateFactoryText(prompt, {
    generator: 'replacement-cases',
    category: spec.category,
    language: spec.lang,
  }, paidAiApproval.beforeTransportAttempt);

  try {
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const generated = JSON.parse(cleaned) as Partial<EvalCase>[];
    return generated.map((c, i) => ({
      id: `v3r_${spec.category}_${spec.lang}_${i + 1}`,
      input: c.input ?? '',
      language: spec.lang,
      category: spec.category,
      expect_item_count: c.expect_item_count ?? 1,
      expect_total: c.expect_total ?? null,
      expect_safety: true,
      expect_needs_clarification: false,
      notes: c.notes,
    }));
  } catch (e) {
    console.error(`[gen] Parse error for ${spec.category}/${spec.lang}:`, e);
    return [];
  }
}

async function main() {
  console.log(`[gen] generating ${REPLACEMENT_SPECS.reduce((s, sp) => s + sp.count, 0)} replacement cases across ${REPLACEMENT_SPECS.length} specs`);

  const allNew: EvalCase[] = [];
  for (const spec of paidAiApproval.boundCases(REPLACEMENT_SPECS)) {
    console.log(`[gen] generating ${spec.count} ${spec.category}/${spec.lang} cases...`);
    const cases = await generateCases(spec);
    console.log(`[gen]   → got ${cases.length}`);
    allNew.push(...cases);
  }

  // Load current v3 dataset and merge
  const v3Path = join(process.cwd(), 'agents', 'evals', 'datasets', 'nutrition-enterprise-v3.json');
  const v3 = JSON.parse(readFileSync(v3Path, 'utf8'));
  const merged = [...v3.cases, ...allNew];

  v3.cases = merged;
  v3.version = '3.3';
  v3.generatedAt = new Date().toISOString();

  writeFileSync(v3Path, JSON.stringify(v3, null, 2));
  console.log(`[gen] ✅ wrote ${merged.length} total cases`);

  // Distribution
  const byCat: Record<string, number> = {};
  const byLang: Record<string, number> = {};
  for (const c of merged) {
    byCat[c.category] = (byCat[c.category] ?? 0) + 1;
    byLang[c.language] = (byLang[c.language] ?? 0) + 1;
  }
  console.log('\n[gen] Category distribution:');
  for (const [k, v] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log('\n[gen] Language distribution:');
  for (const [k, v] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
}

main().catch(console.error);
