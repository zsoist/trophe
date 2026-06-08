import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Range = { min: number; max: number };
type EvalCase = {
  id: string;
  input: string;
  language: 'en' | 'es' | 'el' | 'mixed';
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
};
type ParsedItem = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

const dataset = JSON.parse(readFileSync(
  join(process.cwd(), 'agents/evals/datasets/nutrition-enterprise-v2.json'),
  'utf8',
)) as { version: string; cases: EvalCase[] };
const baseUrl = process.env.TROPHE_API ?? 'https://trophe.app';
const concurrency = Math.min(Math.max(Number(process.env.EVAL_CONCURRENCY ?? 5), 1), 10);
const email = process.env.EVAL_AUTH_EMAIL;
const password = process.env.EVAL_AUTH_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function within(actual: number, expected?: Range) {
  return !expected || (actual >= expected.min && actual <= expected.max);
}

async function accessToken() {
  if (!email || !password || !supabaseUrl || !anonKey) {
    throw new Error('EVAL_AUTH_EMAIL, EVAL_AUTH_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Eval authentication failed (${response.status})`);
  return (await response.json() as { access_token: string }).access_token;
}

async function runCase(test: EvalCase, token: string) {
  const startedAt = Date.now();
  const language = test.language === 'mixed' ? 'en' : test.language;
  const response = await fetch(`${baseUrl}/api/food/parse`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: test.input, language }),
  });
  const data = await response.json().catch(() => ({})) as {
    items?: ParsedItem[];
    needs_clarification?: boolean;
    error?: string;
  };
  const items = data.items ?? [];
  const totals = items.reduce((sum, item) => ({
    calories: sum.calories + (item.calories ?? 0),
    protein_g: sum.protein_g + (item.protein_g ?? 0),
    carbs_g: sum.carbs_g + (item.carbs_g ?? 0),
    fat_g: sum.fat_g + (item.fat_g ?? 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  const emptyAdversarial = test.category === 'adversarial' && test.input.trim() === '';
  const statusPassed = emptyAdversarial ? response.status === 400 : response.ok;
  const checks = {
    status: statusPassed,
    itemCount: emptyAdversarial || items.length === test.expect_item_count,
    calories: within(totals.calories, test.expect_total?.calories),
    protein: within(totals.protein_g, test.expect_total?.protein_g),
    carbs: within(totals.carbs_g, test.expect_total?.carbs_g),
    fat: within(totals.fat_g, test.expect_total?.fat_g),
    clarification: !test.expect_needs_clarification || data.needs_clarification === true || items.length === 0,
  };
  return {
    id: test.id,
    language: test.language,
    category: test.category,
    input: test.input,
    passed: Object.values(checks).every(Boolean),
    latencyMs: Date.now() - startedAt,
    status: response.status,
    checks,
    totals,
    items: items.length,
    error: data.error,
  };
}

async function main() {
  const token = await accessToken();
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < dataset.cases.length) {
      const index = next++;
      results[index] = await runCase(dataset.cases[index], token);
    }
  }));

  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const groups = [...new Set(results.map((item) => item.category))].map((category) => {
    const selected = results.filter((item) => item.category === category);
    return { category, passed: selected.filter((item) => item.passed).length, total: selected.length };
  });
  const summary = {
    version: dataset.version,
    baseUrl,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    passRate: results.filter((item) => item.passed).length / results.length,
    p50LatencyMs: latencies[Math.ceil(latencies.length * 0.5) - 1],
    p95LatencyMs: latencies[Math.ceil(latencies.length * 0.95) - 1],
    groups,
  };
  mkdirSync(join(process.cwd(), 'artifacts', 'evals'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts', 'evals', 'nutrition-enterprise-production.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
