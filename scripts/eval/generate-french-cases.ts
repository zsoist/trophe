/**
 * Generate French benchmark cases now that the API accepts fr language.
 * Uses DeepSeek exclusively. Merges into v3 dataset.
 */
import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { requirePaidAiToolApproval } from '../safety/require-paid-ai-approval';

const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-generate-french',
  argv: process.argv.slice(2),
  env: process.env,
});

type Range = { min: number; max: number };
type EvalCase = {
  id: string;
  input: string;
  language: 'en' | 'es' | 'el' | 'fr' | 'mixed';
  category: string;
  expect_item_count: number;
  expect_total: { calories?: Range; protein_g?: Range; carbs_g?: Range; fat_g?: Range } | null;
  expect_safety: boolean;
  expect_needs_clarification: boolean;
  notes?: string;
};

const SPECS: Array<{ count: number; category: string; guidance: string }> = [
  { count: 20, category: 'base_food', guidance: 'Simple French foods with EXPLICIT quantities in grams or common French units. Examples: "150g de poulet grillé", "2 oeufs au plat", "100g de riz basmati cuit", "1 tranche de pain complet", "30g de camembert", "1 yaourt nature 125g", "200g de saumon fumé", "80g de brocoli vapeur", "1 banane", "250ml de lait demi-écrémé". Always include a quantity.' },
  { count: 15, category: 'composite', guidance: 'French prepared dishes with portions. "1 part de quiche lorraine", "1 assiette de couscous royal", "1 croque-monsieur", "200g de ratatouille niçoise", "1 portion de cassoulet", "1 crêpe complète (jambon-fromage-oeuf)", "1 bol de soupe à l\'oignon", "1 part de gratin dauphinois", "1 salade niçoise", "200g de blanquette de veau". Include portion size.' },
  { count: 10, category: 'multi_item', guidance: 'Full French meal descriptions with 2-4 items and explicit quantities. "Déjeuner: 150g de poulet rôti, 200g de haricots verts, 100g de riz", "Petit-déjeuner: 2 tartines de pain complet, 10g de beurre, 1 café au lait", "Dîner: 1 bol de soupe de légumes, 50g de fromage, 1 pomme".' },
  { count: 8, category: 'beverages', guidance: 'French drink inputs with quantities. "1 café crème", "1 verre de vin rouge 150ml", "1 jus d\'orange pressé 250ml", "1 chocolat chaud au lait", "1 thé vert", "1 limonade 33cl", "1 bière blonde 25cl", "1 smoothie banane-fraise 300ml".' },
  { count: 8, category: 'bakery', guidance: 'French bakery items with quantities. "1 croissant au beurre", "1 pain au chocolat", "1/4 de baguette tradition", "2 madeleines", "1 part de tarte aux pommes", "1 brioche", "1 éclair au chocolat", "1 chausson aux pommes".' },
  { count: 5, category: 'seafood', guidance: 'French seafood with quantities. "200g de moules marinières", "1 filet de sole meunière 150g", "150g de crevettes grillées", "1 assiette de fruits de mer", "200g de saumon en papillote".' },
  { count: 5, category: 'regional_cuisine', guidance: 'French regional/North African influenced cuisine. "1 tajine de poulet au citron", "1 assiette de couscous aux légumes", "2 bricks à l\'oeuf", "3 merguez grillées", "1 pastilla au poulet".' },
  { count: 5, category: 'branded', guidance: 'French branded food products. "1 Danone Nature", "2 Petit Lu", "1 Kiri 20g", "1 Vache qui rit", "1 Actimel".' },
  { count: 4, category: 'code_switch', guidance: 'French-English or French-Spanish mixed inputs. "J\'ai mangé du chicken avec des frites", "petit-déjeuner: scrambled eggs et tartine", "un bowl de açaí avec granola", "salade avec avocado et tomates".' },
];

async function generate(spec: typeof SPECS[0]): Promise<EvalCase[]> {
  const { generateFactoryText } = await import('./factory-runtime');
  const prompt = `Generate exactly ${spec.count} nutrition benchmark test cases in French for category "${spec.category}".

${spec.guidance}

Each case JSON structure:
- "input": the food description in French
- "language": "fr"
- "category": "${spec.category}"
- "expect_item_count": number of distinct food items
- "expect_total": { "calories": {"min": N, "max": N}, "protein_g": {"min": N, "max": N}, "carbs_g": {"min": N, "max": N}, "fat_g": {"min": N, "max": N} }
  Use ±15% tolerance. Base on CIQUAL/USDA values.
- "expect_safety": true
- "expect_needs_clarification": false
- "notes": brief reference

Return ONLY a JSON array. No markdown.`;

  const content = await generateFactoryText(prompt, {
    generator: 'french-cases',
    category: spec.category,
  }, () => paidAiApproval.consumeAttempt());
  try {
    const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
    const generated = JSON.parse(cleaned) as Partial<EvalCase>[];
    return paidAiApproval.boundCases(generated).map((c, i) => ({
      id: `v3f_${spec.category}_fr_${i + 1}`,
      input: c.input ?? '',
      language: 'fr' as const,
      category: spec.category,
      expect_item_count: c.expect_item_count ?? 1,
      expect_total: c.expect_total ?? null,
      expect_safety: true,
      expect_needs_clarification: false,
      notes: c.notes,
    }));
  } catch (e) { console.error(`[gen] Parse error:`, e); return []; }
}

async function main() {
  const total = SPECS.reduce((s, sp) => s + sp.count, 0);
  console.log(`[gen] generating ${total} French cases across ${SPECS.length} categories`);

  const allNew: EvalCase[] = [];
  for (const spec of paidAiApproval.boundCases(SPECS)) {
    console.log(`[gen] ${spec.category}: +${spec.count}...`);
    const cases = await generate(spec);
    console.log(`[gen]   → got ${cases.length}`);
    allNew.push(...cases);
  }

  const v3Path = join(process.cwd(), 'agents', 'evals', 'datasets', 'nutrition-enterprise-v3.json');
  const v3 = JSON.parse(readFileSync(v3Path, 'utf8'));
  v3.cases = [...v3.cases, ...allNew];
  v3.version = '3.5';
  writeFileSync(v3Path, JSON.stringify(v3, null, 2));

  const byLang: Record<string, number> = {};
  for (const c of v3.cases) byLang[c.language] = (byLang[c.language] ?? 0) + 1;
  console.log(`[gen] ✅ ${v3.cases.length} total cases`);
  console.log(`[gen] Languages: ${JSON.stringify(byLang)}`);
}

main().catch(console.error);
