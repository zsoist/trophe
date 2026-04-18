// Runner for food-parse golden eval set.
// Usage: `npx tsx agents/evals/run-food-parse.ts [--url=http://localhost:3333]`
// Output: per-case PASS/FAIL + summary stats printed to stdout, JSON report to agents/evals/reports/.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

interface Range {
  min: number;
  max: number;
}

interface ExpectedTotals {
  calories?: Range;
  protein_g?: Range;
  carbs_g?: Range;
  fat_g?: Range;
  fiber_g?: Range;
  sugar_g?: Range;
}

interface Case {
  id: string;
  input: string;
  language: string;
  expect_item_count: number;
  expect_total: ExpectedTotals;
  notes?: string;
}

interface EvalFile {
  description: string;
  model: string;
  agent_version: string;
  source: string;
  cases: Case[];
}

interface ParsedItem {
  food_name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g?: number;
  confidence: number;
  source: 'local_db' | 'ai_estimate';
}

interface ParseResponse {
  items?: ParsedItem[];
  error?: string;
}

const url = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3333';
const evalPath = join(process.cwd(), 'agents/evals/food-parse-nikos-golden.json');
const reportDir = join(process.cwd(), 'agents/evals/reports');
mkdirSync(reportDir, { recursive: true });

const spec = JSON.parse(readFileSync(evalPath, 'utf-8')) as EvalFile;

function fmt(n: number): string {
  return n.toFixed(1).padStart(6);
}

function inRange(val: number, r: Range): boolean {
  return val >= r.min && val <= r.max;
}

function sumItems(items: ParsedItem[]): Required<Omit<ParsedItem, 'food_name' | 'confidence' | 'source'>> {
  return items.reduce(
    (acc, it) => ({
      grams: acc.grams + (it.grams || 0),
      calories: acc.calories + (it.calories || 0),
      protein_g: acc.protein_g + (it.protein_g || 0),
      carbs_g: acc.carbs_g + (it.carbs_g || 0),
      fat_g: acc.fat_g + (it.fat_g || 0),
      fiber_g: acc.fiber_g + (it.fiber_g || 0),
      sugar_g: acc.sugar_g + (it.sugar_g || 0),
    }),
    { grams: 0, calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 },
  );
}

interface CaseResult {
  id: string;
  input: string;
  passed: boolean;
  item_count: number;
  totals: ReturnType<typeof sumItems> | null;
  failures: string[];
  latencyMs: number;
  rawItems?: ParsedItem[];
  error?: string;
}

async function runCase(c: Case): Promise<CaseResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${url}/api/food/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: c.input, language: c.language }),
    });
    const latencyMs = Date.now() - start;
    const body = (await res.json()) as ParseResponse;

    if (!res.ok || !body.items) {
      return {
        id: c.id,
        input: c.input,
        passed: false,
        item_count: 0,
        totals: null,
        failures: [`HTTP ${res.status} — ${body.error ?? 'no items'}`],
        latencyMs,
        error: body.error,
      };
    }

    const items = body.items;
    const totals = sumItems(items);
    const failures: string[] = [];

    if (items.length !== c.expect_item_count) {
      failures.push(`item_count ${items.length} ≠ expected ${c.expect_item_count}`);
    }
    const keys: (keyof ExpectedTotals)[] = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'];
    for (const k of keys) {
      const r = c.expect_total[k];
      if (!r) continue;
      const v = totals[k];
      if (!inRange(v, r)) {
        failures.push(`${k}=${v.toFixed(1)} outside [${r.min},${r.max}]`);
      }
    }

    return {
      id: c.id,
      input: c.input,
      passed: failures.length === 0,
      item_count: items.length,
      totals,
      failures,
      latencyMs,
      rawItems: items,
    };
  } catch (err) {
    return {
      id: c.id,
      input: c.input,
      passed: false,
      item_count: 0,
      totals: null,
      failures: [`exception: ${err instanceof Error ? err.message : String(err)}`],
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  console.log(`Food-parse eval · model=${spec.model} · agent=${spec.agent_version} · cases=${spec.cases.length} · url=${url}`);
  console.log('─'.repeat(100));

  const results: CaseResult[] = [];
  for (const c of spec.cases) {
    const r = await runCase(c);
    results.push(r);
    const status = r.passed ? 'PASS' : 'FAIL';
    const sym = r.passed ? '✅' : '❌';
    const tot = r.totals;
    const line = tot
      ? `kcal${fmt(tot.calories)} P${fmt(tot.protein_g)} C${fmt(tot.carbs_g)} F${fmt(tot.fat_g)}`
      : 'no response';
    console.log(`${sym} ${r.id.padEnd(22)} ${status}  (${r.latencyMs}ms, ${r.item_count} items)  ${line}`);
    console.log(`   input: "${r.input}"`);
    if (r.failures.length > 0) {
      for (const f of r.failures) console.log(`   ⚠︎  ${f}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  const rate = ((passed / total) * 100).toFixed(1);
  const avgLatency = Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / total);

  console.log('─'.repeat(100));
  console.log(`Passed ${passed}/${total} (${rate}%) · avg latency ${avgLatency}ms`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(reportDir, `food-parse-${timestamp}.json`);
  writeFileSync(reportPath, JSON.stringify({ when: new Date().toISOString(), spec: { model: spec.model, version: spec.agent_version }, summary: { passed, total, rate, avgLatency }, results }, null, 2));
  console.log(`\nReport saved to ${reportPath}`);

  process.exit(passed === total ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
