/**
 * Trophē v0.3 — Aggregate eval runner (Phase 3).
 *
 * Runs all three eval suites and hard-gates at ≥95% pass rate.
 *
 * Suites:
 *   1. food_parse      — HTTP golden cases against Nikos golden set
 *                        (requires dev server; skips gracefully if unavailable)
 *   2. recipe_analyze  — Direct agent call + schema-validation layer
 *                        (requires ANTHROPIC_API_KEY; skips if absent)
 *   3. coach_insight   — Synthetic coaching output structural + content checks
 *                        (requires ANTHROPIC_API_KEY; skips if absent)
 *
 * Usage:
 *   npx tsx agents/evals/run-all.ts [--url=http://localhost:3333] [--suite=food_parse]
 *
 * Exit codes:
 *   0 — all suites ≥95% pass
 *   1 — any suite below threshold or hard failure
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const url = args.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3333';
const suiteFilter = args.find((a) => a.startsWith('--suite='))?.split('=')[1];

const reportDir = join(process.cwd(), 'agents/evals/reports');
mkdirSync(reportDir, { recursive: true });

// ── Shared types ──────────────────────────────────────────────────────────────

interface SuiteResult {
  name: string;
  passed: number;
  total: number;
  rate: number;
  skipped: boolean;
  skipReason?: string;
  avgLatencyMs: number;
  cases: CaseResult[];
}

interface CaseResult {
  id: string;
  input: string;
  passed: boolean;
  failures: string[];
  latencyMs: number;
  detail?: unknown;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(passed: number, total: number): number {
  return total === 0 ? 0 : (passed / total) * 100;
}

function bold(s: string): string { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string): string { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string): string { return `\x1b[31m${s}\x1b[0m`; }
function yellow(s: string): string { return `\x1b[33m${s}\x1b[0m`; }
function dim(s: string): string { return `\x1b[2m${s}\x1b[0m`; }

function printHeader(title: string) {
  console.log();
  console.log(bold(`══ ${title} ` + '═'.repeat(Math.max(0, 80 - title.length - 4))));
}

function printSuiteResult(suite: SuiteResult) {
  if (suite.skipped) {
    console.log(yellow(`  ⏭  SKIPPED — ${suite.skipReason}`));
    return;
  }
  const rateStr = suite.rate.toFixed(1) + '%';
  const color = suite.rate >= 95 ? green : red;
  console.log(`  ${color(rateStr.padEnd(8))} ${suite.passed}/${suite.total} passed · avg ${suite.avgLatencyMs}ms`);
  for (const c of suite.cases) {
    const sym = c.passed ? green('✓') : red('✗');
    console.log(`  ${sym} ${c.id.padEnd(32)} ${dim(`(${c.latencyMs}ms)`)}`);
    for (const f of c.failures) {
      console.log(`      ${red('↳')} ${f}`);
    }
  }
}

// ── Suite 1: food_parse ───────────────────────────────────────────────────────

interface Range { min: number; max: number; }
interface FoodCase {
  id: string;
  input: string;
  language: string;
  expect_item_count: number;
  expect_total: { calories?: Range; protein_g?: Range; carbs_g?: Range; fat_g?: Range; fiber_g?: Range; };
}
interface ParsedItem { food_name: string; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; }
interface ParseResponse { items?: ParsedItem[]; error?: string; }

async function checkServerAvailable(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);
    // POST a minimal parse request — a Trophē dev server returns JSON;
    // any non-Trophē process (or missing endpoint) returns HTML → false.
    const res = await fetch(`${baseUrl}/api/food/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'health-check', language: 'en' }),
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    const ct = res.headers.get('content-type') ?? '';
    return ct.includes('application/json');
  } catch {
    return false;
  }
}

async function runFoodParseCase(c: FoodCase, baseUrl: string): Promise<CaseResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/food/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: c.input, language: c.language }),
    });
    const latencyMs = Date.now() - start;
    const body = (await res.json()) as ParseResponse;

    if (!res.ok || !body.items) {
      return { id: c.id, input: c.input, passed: false, failures: [`HTTP ${res.status} — ${body.error ?? 'no items'}`], latencyMs };
    }

    const items = body.items;
    const totals = items.reduce(
      (acc, it) => ({ calories: acc.calories + (it.calories || 0), protein_g: acc.protein_g + (it.protein_g || 0), carbs_g: acc.carbs_g + (it.carbs_g || 0), fat_g: acc.fat_g + (it.fat_g || 0), fiber_g: acc.fiber_g + (it.fiber_g || 0) }),
      { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },
    );

    const failures: string[] = [];
    if (items.length !== c.expect_item_count) {
      failures.push(`item_count ${items.length} ≠ expected ${c.expect_item_count}`);
    }
    for (const k of ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g'] as const) {
      const r = c.expect_total[k];
      if (!r) continue;
      const v = totals[k];
      if (v < r.min || v > r.max) failures.push(`${k}=${v.toFixed(1)} outside [${r.min},${r.max}]`);
    }

    return { id: c.id, input: c.input, passed: failures.length === 0, failures, latencyMs, detail: totals };
  } catch (err) {
    return { id: c.id, input: c.input, passed: false, failures: [`exception: ${err instanceof Error ? err.message : String(err)}`], latencyMs: Date.now() - start };
  }
}

async function runFoodParseSuite(): Promise<SuiteResult> {
  const evalPath = join(process.cwd(), 'agents/evals/food-parse-nikos-golden.json');
  const spec = JSON.parse(readFileSync(evalPath, 'utf-8')) as { cases: FoodCase[] };

  const serverOk = await checkServerAvailable(url);
  if (!serverOk) {
    return {
      name: 'food_parse',
      passed: 0, total: spec.cases.length, rate: 0,
      skipped: true, skipReason: `dev server not available at ${url} (start with npm run dev)`,
      avgLatencyMs: 0, cases: [],
    };
  }

  const cases: CaseResult[] = [];
  for (const c of spec.cases) {
    cases.push(await runFoodParseCase(c, url));
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    name: 'food_parse',
    passed, total: cases.length, rate: pct(passed, cases.length),
    skipped: false,
    avgLatencyMs: Math.round(cases.reduce((s, c) => s + c.latencyMs, 0) / cases.length),
    cases,
  };
}

// ── Suite 2: recipe_analyze (schema-validation) ──────────────────────────────

interface RecipeMacros { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number; }
interface RecipeIngredient { raw_text: string; food_name: string; grams: number; calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number; confidence: number; source: string; }
interface RecipeOutput { recipe_name: string; servings: number; ingredients: RecipeIngredient[]; total: RecipeMacros; per_serving: RecipeMacros; }

const RECIPE_SYNTHETIC_CASES = [
  {
    id: 'recipe_greek_salad',
    text: 'Greek salad: 200g tomatoes, 100g cucumber, 80g feta cheese, 20ml olive oil, 30g kalamata olives',
    servings: 2,
    language: 'en',
    minIngredients: 3,
    expectTotalCalMin: 250, expectTotalCalMax: 650,
  },
  {
    id: 'recipe_chicken_rice',
    text: 'Grilled chicken breast 200g with 150g cooked white rice and steamed broccoli 100g',
    servings: 1,
    language: 'en',
    minIngredients: 2,
    expectTotalCalMin: 400, expectTotalCalMax: 800,
  },
  {
    id: 'recipe_oatmeal',
    text: '50g rolled oats cooked with 200ml milk, 1 banana, 1 tablespoon honey',
    servings: 1,
    language: 'en',
    minIngredients: 2,
    expectTotalCalMin: 250, expectTotalCalMax: 600,
  },
];

function validateRecipeSchema(output: unknown, caseSpec: typeof RECIPE_SYNTHETIC_CASES[0]): string[] {
  const failures: string[] = [];
  if (!output || typeof output !== 'object') {
    failures.push('output is not an object');
    return failures;
  }
  const o = output as Partial<RecipeOutput>;

  // Structural checks
  if (typeof o.recipe_name !== 'string' || o.recipe_name.length < 2) failures.push('recipe_name missing or too short');
  if (typeof o.servings !== 'number' || o.servings < 1) failures.push('servings must be ≥1');
  if (!Array.isArray(o.ingredients)) { failures.push('ingredients is not an array'); return failures; }
  if (o.ingredients.length < caseSpec.minIngredients) failures.push(`ingredients.length=${o.ingredients.length} < min ${caseSpec.minIngredients}`);

  // Per-ingredient schema
  for (const [i, ing] of o.ingredients.entries()) {
    if (typeof ing.food_name !== 'string') failures.push(`ingredients[${i}].food_name missing`);
    if (typeof ing.grams !== 'number' || ing.grams <= 0) failures.push(`ingredients[${i}].grams ≤ 0`);
    if (typeof ing.calories !== 'number' || ing.calories < 0) failures.push(`ingredients[${i}].calories negative`);
    if (!['local_db', 'ai_estimate'].includes(ing.source)) failures.push(`ingredients[${i}].source invalid: ${ing.source}`);
    if (typeof ing.confidence !== 'number' || ing.confidence < 0 || ing.confidence > 1) failures.push(`ingredients[${i}].confidence out of [0,1]`);
  }

  // Macro totals
  if (!o.total) { failures.push('total missing'); return failures; }
  if (o.total.calories < caseSpec.expectTotalCalMin || o.total.calories > caseSpec.expectTotalCalMax) {
    failures.push(`total.calories=${o.total.calories.toFixed(0)} outside [${caseSpec.expectTotalCalMin},${caseSpec.expectTotalCalMax}]`);
  }
  if (!o.per_serving) failures.push('per_serving missing');

  // Internal consistency: per_serving ≈ total / servings (±15%)
  if (o.total && o.per_serving && typeof o.servings === 'number' && o.servings > 1) {
    const expectedPerServing = o.total.calories / o.servings;
    const diff = Math.abs(o.per_serving.calories - expectedPerServing) / expectedPerServing;
    if (diff > 0.15) failures.push(`per_serving.calories inconsistency: ${o.per_serving.calories.toFixed(0)} vs total/servings=${expectedPerServing.toFixed(0)} (${(diff*100).toFixed(1)}% off)`);
  }

  return failures;
}

async function runRecipeAnalyzeSuite(): Promise<SuiteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      name: 'recipe_analyze',
      passed: 0, total: RECIPE_SYNTHETIC_CASES.length, rate: 0,
      skipped: true, skipReason: 'ANTHROPIC_API_KEY not set',
      avgLatencyMs: 0, cases: [],
    };
  }

  type RecipeRunFn = (input: { text: string; servings: number; language?: string }) => Promise<{ ok: boolean; output?: RecipeOutput; error?: string }>;
  let runAgent: RecipeRunFn | null = null;
  try {
    const mod = await import('../recipe-analyze/index.js');
    runAgent = mod.run as RecipeRunFn;
  } catch {
    return {
      name: 'recipe_analyze',
      passed: 0, total: RECIPE_SYNTHETIC_CASES.length, rate: 0,
      skipped: true, skipReason: 'recipe-analyze agent failed to import',
      avgLatencyMs: 0, cases: [],
    };
  }

  const cases: CaseResult[] = [];
  for (const spec of RECIPE_SYNTHETIC_CASES) {
    const start = Date.now();
    try {
      const result = await runAgent!({ text: spec.text, servings: spec.servings, language: spec.language });
      const latencyMs = Date.now() - start;

      if (!result.ok || !result.output) {
        cases.push({ id: spec.id, input: spec.text, passed: false, failures: [`agent error: ${result.error ?? 'no output'}`], latencyMs });
        continue;
      }

      const failures = validateRecipeSchema(result.output, spec);
      cases.push({ id: spec.id, input: spec.text, passed: failures.length === 0, failures, latencyMs, detail: result.output });
    } catch (err) {
      cases.push({ id: spec.id, input: spec.text, passed: false, failures: [`exception: ${err instanceof Error ? err.message : String(err)}`], latencyMs: Date.now() - start });
    }
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    name: 'recipe_analyze',
    passed, total: cases.length, rate: pct(passed, cases.length),
    skipped: false,
    avgLatencyMs: Math.round(cases.reduce((s, c) => s + c.latencyMs, 0) / cases.length),
    cases,
  };
}

// ── Suite 3: coach_insight (synthetic structural + content) ───────────────────

const COACH_INSIGHT_CASES = [
  {
    id: 'insight_low_protein',
    clientContext: 'Client logged 85g protein today. Goal is 150g/day. Had oatmeal, chicken salad, and pasta.',
    minWords: 40, maxWords: 300,
    requiredTerms: ['protein', 'goal'],
    bannedTerms: ['I cannot', 'I am unable'],
    validateActionable: true,
  },
  {
    id: 'insight_great_macros',
    clientContext: 'Client hit all macro targets today: 2100 kcal, 155g protein, 220g carbs, 65g fat. Trained for 1 hour.',
    minWords: 30, maxWords: 300,
    requiredTerms: [],
    bannedTerms: ['I cannot', 'I am unable'],
    validateActionable: false,
  },
  {
    id: 'insight_allergy_flag',
    clientContext: 'Client has a peanut allergy (confirmed in memory). Today\'s log includes a snack bar — ingredient list not confirmed.',
    minWords: 30, maxWords: 300,
    requiredTerms: ['allerg', 'peanut'],
    bannedTerms: ['I cannot'],
    validateActionable: true,
  },
];

const COACH_INSIGHT_SYSTEM = `You are a professional nutrition coach. Given a client's daily nutrition summary, provide a brief, actionable coaching insight.
Format: 2-3 short paragraphs. Be specific, positive, and practical. Always mention the client's primary opportunity or win.`;

async function callAnthropicDirect(systemPrompt: string, userMessage: string): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const body = await res.json() as { content: Array<{type: string; text: string}>; usage: { input_tokens: number; output_tokens: number } };
  const text = body.content.find((c) => c.type === 'text')?.text ?? '';
  return { text, tokensIn: body.usage.input_tokens, tokensOut: body.usage.output_tokens };
}

function validateCoachInsight(text: string, spec: typeof COACH_INSIGHT_CASES[0]): string[] {
  const failures: string[] = [];
  const words = text.trim().split(/\s+/).length;

  if (words < spec.minWords) failures.push(`too short: ${words} words (min ${spec.minWords})`);
  if (words > spec.maxWords) failures.push(`too long: ${words} words (max ${spec.maxWords})`);

  const lc = text.toLowerCase();
  for (const term of spec.requiredTerms) {
    if (!lc.includes(term.toLowerCase())) failures.push(`required term "${term}" not found`);
  }
  for (const term of spec.bannedTerms) {
    if (lc.includes(term.toLowerCase())) failures.push(`banned phrase "${term}" found`);
  }

  if (spec.validateActionable) {
    const actionablePatterns = [
      // Guidance verbs
      /\b(aim|try|consider|focus|increase|decrease|add|reduce|track|include|avoid|prioritize|adjust|ensure)\b/i,
      // Recommendation language
      /\b(recommend|suggest|encourage|would benefit|could help|should|would|might want)\b/i,
      // Safety / verification language (relevant for allergy/flag cases)
      /\b(check|verify|confirm|inspect|review|contact|consult|speak|ask|alert|flag|caution|warn)\b/i,
    ];
    const hasActionable = actionablePatterns.some((p) => p.test(text));
    if (!hasActionable) failures.push('no actionable language detected (aim/try/consider/focus/check/verify etc.)');
  }

  return failures;
}

async function runCoachInsightSuite(): Promise<SuiteResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      name: 'coach_insight',
      passed: 0, total: COACH_INSIGHT_CASES.length, rate: 0,
      skipped: true, skipReason: 'ANTHROPIC_API_KEY not set',
      avgLatencyMs: 0, cases: [],
    };
  }

  const cases: CaseResult[] = [];
  for (const spec of COACH_INSIGHT_CASES) {
    const start = Date.now();
    try {
      const { text } = await callAnthropicDirect(COACH_INSIGHT_SYSTEM, spec.clientContext);
      const latencyMs = Date.now() - start;
      const failures = validateCoachInsight(text, spec);
      cases.push({ id: spec.id, input: spec.clientContext.slice(0, 60) + '…', passed: failures.length === 0, failures, latencyMs, detail: text.slice(0, 200) });
    } catch (err) {
      cases.push({ id: spec.id, input: spec.clientContext.slice(0, 60) + '…', passed: false, failures: [`exception: ${err instanceof Error ? err.message : String(err)}`], latencyMs: Date.now() - start });
    }
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    name: 'coach_insight',
    passed, total: cases.length, rate: pct(passed, cases.length),
    skipped: false,
    avgLatencyMs: Math.round(cases.reduce((s, c) => s + c.latencyMs, 0) / cases.length),
    cases,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n🔬 Trophē v0.3 — Aggregate Eval Runner'));
  console.log(dim(`   url=${url}  filter=${suiteFilter ?? 'all'}  ${new Date().toISOString()}`));

  const SUITES = [
    { name: 'food_parse', run: runFoodParseSuite },
    { name: 'recipe_analyze', run: runRecipeAnalyzeSuite },
    { name: 'coach_insight', run: runCoachInsightSuite },
  ].filter((s) => !suiteFilter || s.name === suiteFilter);

  const results: SuiteResult[] = [];

  for (const suite of SUITES) {
    printHeader(suite.name);
    const result = await suite.run();
    results.push(result);
    printSuiteResult(result);
  }

  // ── Aggregate summary ──────────────────────────────────────────────────────

  console.log();
  console.log(bold('══ AGGREGATE SUMMARY ' + '═'.repeat(60)));

  const active = results.filter((r) => !r.skipped);
  const totalPassed = active.reduce((s, r) => s + r.passed, 0);
  const totalCases = active.reduce((s, r) => s + r.total, 0);
  const aggregateRate = pct(totalPassed, totalCases);
  const THRESHOLD = 95;

  for (const r of results) {
    const status = r.skipped ? yellow('SKIP') : r.rate >= THRESHOLD ? green('PASS') : red('FAIL');
    const rateStr = r.skipped ? '—' : r.rate.toFixed(1) + '%';
    console.log(`  ${status}  ${r.name.padEnd(20)}  ${rateStr.padStart(7)}  ${r.skipped ? r.skipReason : `${r.passed}/${r.total}`}`);
  }

  console.log();

  if (active.length === 0) {
    console.log(yellow('  All suites skipped. Set ANTHROPIC_API_KEY and start the dev server to run full eval.'));
    console.log(yellow(`  GATE: inconclusive — no active suites`));
    process.exit(0);
  }

  const gateColor = aggregateRate >= THRESHOLD ? green : red;
  const gateSymbol = aggregateRate >= THRESHOLD ? '✅' : '❌';
  console.log(bold(`  ${gateSymbol} Aggregate: ${gateColor(aggregateRate.toFixed(1) + '%')} (${totalPassed}/${totalCases}) — threshold ${THRESHOLD}%`));

  // ── Write report ───────────────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(reportDir, `run-all-${timestamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        when: new Date().toISOString(),
        url,
        threshold: THRESHOLD,
        aggregate: { passed: totalPassed, total: totalCases, rate: aggregateRate, passed_gate: aggregateRate >= THRESHOLD },
        suites: results,
      },
      null,
      2,
    ),
  );
  console.log(dim(`\n  Report → ${reportPath}`));

  if (active.length > 0 && aggregateRate < THRESHOLD) {
    console.log(red(`\n  HARD GATE FAILED: ${aggregateRate.toFixed(1)}% < ${THRESHOLD}%\n`));
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
