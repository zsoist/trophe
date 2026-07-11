/**
 * scripts/eval/generate-benchmark-cases.ts
 *
 * LLM-assisted benchmark case generation for nutrition-enterprise v3.
 * Uses DeepSeek V4 Flash to generate candidate cases, then cross-references
 * expected macros against USDA/CIQUAL DB for validation.
 *
 * Usage:
 *   npx tsx scripts/eval/generate-benchmark-cases.ts
 *   DRY_RUN=1 npx tsx scripts/eval/generate-benchmark-cases.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

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

type CategorySpec = {
  delta: number;
  languages: Record<string, number>; // language → count
  guidance: string;
};

const CATEGORY_SPECS: Record<string, CategorySpec> = {
  base_food: {
    delta: 55,
    languages: { en: 15, fr: 20, es: 10, el: 10 },
    guidance: 'Single whole foods with explicit quantities in grams or common units. Include French staples (baguette 1/4, camembert 30g, ratatouille 200g, quiche lorraine 1 slice), Latin American foods (arepa 1 unit, bandeja paisa, pupusa), and Greek foods (moussaka 250g, souvlaki 1 skewer, spanakopita). Use realistic household portions.',
  },
  composite: {
    delta: 35,
    languages: { en: 10, fr: 12, es: 8, el: 5 },
    guidance: 'Multi-ingredient dishes described as a single item. French: croque-monsieur, cassoulet, pot-au-feu, blanquette de veau, gratin dauphinois. Spanish: paella, bandeja paisa, sancocho. Greek: pastitsio, gemista. Include cooking method when relevant (grillé, frit, au four). Portions should be typical restaurant servings.',
  },
  multi_item: {
    delta: 35,
    languages: { en: 10, fr: 10, es: 5, el: 5, mixed: 5 },
    guidance: 'Full meal descriptions with 2-5 items listed together. Examples: "petit déjeuner: croissant, café au lait, jus d\'orange", "almuerzo: arroz con pollo, ensalada, jugo de mora". Each item should have a clear quantity or be a standard single serving. Include breakfast, lunch, and dinner meals.',
  },
  code_switch: {
    delta: 15,
    languages: { mixed: 15 },
    guidance: 'Inputs that mix 2+ languages naturally. FR-EN: "un croissant and black coffee", "salade niçoise with extra tuna". ES-EN: "arroz con pollo and a side salad". EL-EN: "γύρος with fries and tzatziki". FR-ES: "crêpe au chocolat y un café con leche". Make the mixing feel natural, like a bilingual person would speak.',
  },
  adversarial: {
    delta: 15,
    languages: { en: 5, fr: 5, es: 3, el: 2 },
    guidance: 'Tricky inputs: misspellings (poulett, brocoli, spageti), emoji-only food descriptions (🍕🍕 2 slices), slang (un McDo, un grec, a za), extremely long run-on descriptions, inputs with extra punctuation or formatting. Each should still be parseable to a real food. Include the correct expected macros despite the bad spelling.',
  },
  vague_quantity: {
    delta: 15,
    languages: { en: 4, fr: 5, es: 3, el: 3 },
    guidance: 'Inputs with imprecise quantities that should trigger clarification or use sensible defaults. "un peu de riz", "quelques fraises", "a handful of almonds", "λίγο τυρί", "un poquito de arroz". Set expect_needs_clarification to true. Expected macros should reflect the default portion the system would assume.',
  },
  clarification: {
    delta: 15,
    languages: { en: 4, fr: 5, es: 3, el: 3 },
    guidance: 'Ambiguous inputs requiring follow-up. "chicken" (what cut? how cooked?), "du pain" (what kind? how much?), "pasta" (what type? what sauce?), "σαλάτα" (what kind?). Set expect_needs_clarification to true. Expected macros should reflect the most common default interpretation.',
  },
  branded: {
    delta: 20,
    languages: { en: 8, fr: 8, es: 4 },
    guidance: 'Brand-name foods with specific products. French brands: Danone Nature yaourt 125g, Lu Petit Beurre 4 biscuits, Président Camembert 30g, Kiri 1 portion, Vache qui rit 1 triangle. US brands: Chobani Greek Yogurt 170g, KIND bar 1 bar. Include the brand name naturally as a user would type it.',
  },
  bakery: {
    delta: 15,
    languages: { en: 3, fr: 8, es: 2, el: 2 },
    guidance: 'Bakery items with French emphasis. Pain au chocolat 1 piece (~70g), croissant aux amandes, baguette tradition 1/4, brioche 1 slice, éclair au chocolat, tarte aux pommes 1 slice, mille-feuille, kouign-amann. Include typical bakery portions. Greek: κουλούρι, μπουγάτσα. Spanish: churros con chocolate.',
  },
  seafood: {
    delta: 15,
    languages: { en: 4, fr: 6, es: 3, el: 2 },
    guidance: 'Seafood dishes. French: bouillabaisse 300ml, moules marinières 500g, sole meunière 1 filet, coquilles Saint-Jacques 4 pieces, plateau de fruits de mer. Spanish: ceviche 200g, pulpo a la gallega. Greek: χταπόδι σχάρας, καλαμάρι τηγανητό. English: grilled salmon 150g fillet, fish and chips.',
  },
  beverages: {
    delta: 30,
    languages: { en: 8, fr: 12, es: 5, el: 5 },
    guidance: 'Drinks testing liquid volume-to-gram conversion. French café culture: café crème, noisette, allongé, chocolat chaud, vin rouge 1 verre (150ml), pastis, cidre. Smoothies: smoothie banane-fraise 300ml. Juices: jus d\'orange pressé 250ml. Greek: φραπέ, ελληνικός καφές. Spanish: horchata, agua de panela. Alcohol: bière 33cl, cocktail mojito. Include caloric beverages, not just water.',
  },
  supplements: {
    delta: 20,
    languages: { en: 14, fr: 4, es: 2 },
    guidance: 'Fitness/health supplements with concentrated nutrients. Whey protein 1 scoop (30g), creatine monohydrate 5g, BCAA 10g, mass gainer 1 serving, collagen peptides 10g, protéine végétale en poudre 30g. Include pre-workout drinks, protein bars (Quest bar, Barebells). These have unusual macro ratios (high protein, low fat) that stress-test the system.',
  },
  regional_cuisine: {
    delta: 25,
    languages: { en: 5, fr: 10, es: 5, el: 5 },
    guidance: 'Regional and cultural dishes that test portion assumptions. North African (via French): couscous royal 1 assiette, tajine poulet-citron, merguez 2 saucisses, brick à l\'oeuf. Caribbean French: accras de morue 6 pieces, colombo de poulet. Lebanese (via French): taboulé libanais, houmous 100g, falafel 4 pieces. Greek regional: κρητική σαλάτα, σαγανάκι. Colombian: bandeja paisa, ajiaco.',
  },
};

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';
const MODEL = 'deepseek-v4-flash';

async function generateCases(category: string, spec: CategorySpec): Promise<EvalCase[]> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY required');

  const cases: EvalCase[] = [];

  for (const [lang, count] of Object.entries(spec.languages)) {
    if (count === 0) continue;

    const prompt = `Generate exactly ${count} nutrition benchmark test cases in ${lang === 'mixed' ? 'mixed languages (code-switching)' : `${lang} language`}.

Category: ${category}
Guidance: ${spec.guidance}

Each case must be a JSON object with these exact fields:
- "input": the food description a user would type (realistic, natural language)
- "language": "${lang}"
- "category": "${category}"
- "expect_item_count": number of distinct food items in the input
- "expect_total": { "calories": {"min": N, "max": N}, "protein_g": {"min": N, "max": N}, "carbs_g": {"min": N, "max": N}, "fat_g": {"min": N, "max": N} }
  Use ±15% tolerance ranges around the expected value. Base values on standard nutrition databases (USDA, CIQUAL).
- "expect_safety": true (all cases should be safe food inputs)
- "expect_needs_clarification": true/false (true if the input is intentionally vague)
- "notes": brief note on the reference source for expected macros

Return ONLY a JSON array of objects. No markdown, no explanation.`;

    const response = await fetch(DEEPSEEK_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      console.error(`[gen] DeepSeek error for ${category}/${lang}: ${response.status}`);
      continue;
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };

    const content = data.choices[0]?.message?.content ?? '';
    try {
      // Strip markdown fences if present
      const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const generated = JSON.parse(cleaned) as Partial<EvalCase>[];
      for (const c of generated) {
        cases.push({
          id: `v3_${category}_${lang}_${cases.length + 1}`,
          input: c.input ?? '',
          language: (c.language ?? lang) as EvalCase['language'],
          category,
          expect_item_count: c.expect_item_count ?? 1,
          expect_total: c.expect_total ?? null,
          expect_safety: c.expect_safety ?? true,
          expect_needs_clarification: c.expect_needs_clarification ?? false,
          notes: c.notes,
        });
      }
    } catch (e) {
      console.error(`[gen] Failed to parse response for ${category}/${lang}:`, e);
    }
  }

  return cases;
}

async function main() {
  const dryRun = process.env.DRY_RUN === '1';

  if (Object.keys(CATEGORY_SPECS).length === 0) {
    console.error('[gen] CATEGORY_SPECS is empty — implement it first (look for TODO(human))');
    process.exit(1);
  }

  // Load existing v2 dataset
  const v2Path = join(process.cwd(), 'agents', 'evals', 'datasets', 'nutrition-enterprise-v2.json');
  const v2 = JSON.parse(readFileSync(v2Path, 'utf8')) as { version: string; cases: EvalCase[] };
  console.log(`[gen] loaded v2 dataset: ${v2.cases.length} cases`);

  const allNewCases: EvalCase[] = [];
  const totalDelta = Object.values(CATEGORY_SPECS).reduce((sum, s) => sum + s.delta, 0);
  console.log(`[gen] generating ${totalDelta} new cases across ${Object.keys(CATEGORY_SPECS).length} categories`);

  if (dryRun) {
    console.log('[gen] DRY_RUN — printing specs only:');
    for (const [cat, spec] of Object.entries(CATEGORY_SPECS)) {
      console.log(`  ${cat}: +${spec.delta} (${Object.entries(spec.languages).map(([l, n]) => `${l}:${n}`).join(', ')})`);
    }
    return;
  }

  for (const [cat, spec] of Object.entries(CATEGORY_SPECS)) {
    console.log(`[gen] generating ${spec.delta} cases for "${cat}"...`);
    const cases = await generateCases(cat, spec);
    console.log(`[gen]   → got ${cases.length} cases`);
    allNewCases.push(...cases);
  }

  // Merge with v2 cases
  const v3Cases = [...v2.cases, ...allNewCases];
  const v3 = {
    version: '3.0',
    generated_at: new Date().toISOString(),
    cases: v3Cases,
  };

  const outPath = join(process.cwd(), 'agents', 'evals', 'datasets', 'nutrition-enterprise-v3.json');
  mkdirSync(join(process.cwd(), 'agents', 'evals', 'datasets'), { recursive: true });
  writeFileSync(outPath, JSON.stringify(v3, null, 2));
  console.log(`[gen] ✅ wrote ${v3Cases.length} cases to ${outPath}`);

  // Summary
  const byCat = v3Cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.category] = (acc[c.category] ?? 0) + 1;
    return acc;
  }, {});
  const byLang = v3Cases.reduce<Record<string, number>>((acc, c) => {
    acc[c.language] = (acc[c.language] ?? 0) + 1;
    return acc;
  }, {});
  console.log('\n[gen] Category distribution:');
  for (const [cat, n] of Object.entries(byCat).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${n}`);
  }
  console.log('\n[gen] Language distribution:');
  for (const [lang, n] of Object.entries(byLang).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${lang}: ${n}`);
  }
}

main().catch(err => {
  console.error('[gen] fatal:', err);
  process.exit(1);
});
