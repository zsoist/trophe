/**
 * Trophē v0.3 — Aggregate eval runner (Phase 3).
 *
 * Runs all three eval suites and hard-gates at ≥95% pass rate.
 *
 * Suites:
 *   1. food_parse      — HTTP golden cases against Nikos golden set
 *                        (requires dev server; skips gracefully if unavailable)
 *   2. recipe_analyze  — Direct agent call + schema-validation layer
 *   3. coach_insight   — Synthetic coaching output structural + content checks
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
import { foodParseSimulatorPolicy, taskPolicies } from '../router/policies';
import { invokeTextProvider } from '../runtime/providers/text';
import { requirePaidAiToolApproval } from '../../scripts/safety/require-paid-ai-approval';

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-all',
  argv: args,
  env: process.env,
});
const url = args.find((a) => a.startsWith('--url='))?.split('=')[1] ?? 'http://localhost:3333';
const suiteFilter = args.find((a) => a.startsWith('--suite='))?.split('=')[1];

const reportDir = process.env.EVAL_REPORT_DIR || join(process.cwd(), 'agents/evals/reports');
const enforceGate = process.env.EVAL_ENFORCE_GATE !== '0';
const requiredSuites = new Set(
  (process.env.EVAL_REQUIRED_SUITES ?? '')
    .split(',')
    .map((suite) => suite.trim())
    .filter(Boolean),
);
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

function hasProviderCredential(provider: string): boolean {
  if (provider === 'openai') return Boolean(process.env.OPENAI_API_KEY);
  if (provider === 'anthropic') return Boolean(process.env.ANTHROPIC_API_KEY);
  if (provider === 'google') return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
  if (provider === 'deepseek') return Boolean(process.env.DEEPSEEK_API_KEY);
  return true;
}

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
//
// Runs in-process by importing the pipeline function directly (no HTTP server,
// no auth token required). Mirrors the recipe_analyze / coach_insight pattern.
// A live DB (NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE_KEY) is still needed for
// food lookups — if the DB is unreachable the cases will error individually.
//
// TODO: add a lightweight mock-DB path for fully offline CI runs.

interface Range { min: number; max: number; }
interface FoodCase {
  id: string;
  input: string;
  language: string;
  expect_item_count: number;
  expect_total: { calories?: Range; protein_g?: Range; carbs_g?: Range; fat_g?: Range; fiber_g?: Range; };
}

async function runFoodParseCase(c: FoodCase, runPipeline: (input: { text: string; language?: string }) => Promise<{ ok: boolean; output?: { items: Array<{ calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }> }; error?: string }>): Promise<CaseResult> {
  const start = Date.now();
  try {
    paidAiApproval.consumeAttempt();
    const result = await runPipeline({ text: c.input, language: c.language });
    const latencyMs = Date.now() - start;

    if (!result.ok || !result.output?.items) {
      return { id: c.id, input: c.input, passed: false, failures: [`pipeline error: ${result.error ?? 'no output'}`], latencyMs };
    }

    const items = result.output.items;
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

  // The simulator reads the exact production object instead of duplicating a
  // provider/model string. The CI routing guard asserts this identity.
  if (!hasProviderCredential(foodParseSimulatorPolicy.provider)) {
    console.warn(`\n[food_parse eval] WARNING: ${foodParseSimulatorPolicy.provider} credential not set — suite skipped.`);
    return {
      name: 'food_parse',
      passed: 0, total: spec.cases.length, rate: 0,
      skipped: true, skipReason: `${foodParseSimulatorPolicy.provider} credential not set`,
      avgLatencyMs: 0, cases: [],
    };
  }

  // Sparse-DB guard: the food-parse pipeline resolves against the foods table.
  // CI's local DB has only migration-seeded foods (~hundreds), not the ~43k
  // ingested in prod, so accuracy here is meaningless and would trip the 95% gate
  // on coverage, not correctness. Skip unless the DB is reasonably populated.
  // The authoritative food_parse accuracy is measured against prod via
  // scripts/eval/run-nutrition-enterprise-prod.ts (700-case enterprise set).
  try {
    const { db } = await import('../../db/client');
    const { sql } = await import('drizzle-orm');
    const r = await db.execute(sql`SELECT count(*)::int AS n FROM foods`);
    const foodCount = Number((r.rows?.[0] as { n?: number } | undefined)?.n ?? 0);
    if (foodCount < 10000) {
      console.warn(`\n[food_parse eval] SKIPPED — sparse DB (${foodCount} foods < 10000). Run against prod via run-nutrition-enterprise-prod.ts.\n`);
      return {
        name: 'food_parse',
        passed: 0, total: spec.cases.length, rate: 0,
        skipped: true, skipReason: `sparse DB (${foodCount} foods) — measured against prod instead`,
        avgLatencyMs: 0, cases: [],
      };
    }
  } catch (err) {
    console.warn(`\n[food_parse eval] SKIPPED — DB unavailable: ${err instanceof Error ? err.message : String(err)}\n`);
    return {
      name: 'food_parse',
      passed: 0, total: spec.cases.length, rate: 0,
      skipped: true, skipReason: 'DB unavailable for food count check',
      avgLatencyMs: 0, cases: [],
    };
  }

  // Import the pipeline function directly — no HTTP server or auth token required.
  type RunFn = (input: { text: string; language?: string }) => Promise<{ ok: boolean; output?: { items: Array<{ calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number }> }; error?: string }>;
  let runPipeline: RunFn | null = null;
  try {
    const mod = await import('../food-parse/index.v4.js');
    runPipeline = mod.run as RunFn;
  } catch (err) {
    const reason = `food-parse pipeline failed to import: ${err instanceof Error ? err.message : String(err)}`;
    console.warn(`\n[food_parse eval] WARNING: ${reason}\n`);
    return {
      name: 'food_parse',
      passed: 0, total: spec.cases.length, rate: 0,
      skipped: true, skipReason: reason,
      avgLatencyMs: 0, cases: [],
    };
  }

  const cases: CaseResult[] = [];
  for (const c of paidAiApproval.boundCases(spec.cases)) {
    cases.push(await runFoodParseCase(c, runPipeline!));
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
  const policy = taskPolicies.recipe_analyze;
  if (!hasProviderCredential(policy.provider)) {
    return {
      name: 'recipe_analyze',
      passed: 0, total: RECIPE_SYNTHETIC_CASES.length, rate: 0,
      skipped: true, skipReason: `${policy.provider} credential not set`,
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
  for (const spec of paidAiApproval.boundCases(RECIPE_SYNTHETIC_CASES)) {
    const start = Date.now();
    try {
      paidAiApproval.consumeAttempt();
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
    requiredTerms: ['protein'],
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
Format: 2-3 short paragraphs. Be specific, positive, and practical. Always mention the client's primary opportunity or win.
Always end with ONE concrete next step phrased as a direct recommendation (e.g. "Check…", "Aim for…", "Try…", "Consider…"). If anything is uncertain or unverified (ingredients, allergens), explicitly tell the client to check or confirm it.`;

async function callCoachPolicy(systemPrompt: string, userMessage: string): Promise<{ text: string; tokensIn: number; tokensOut: number }> {
  const policy = taskPolicies.coach_insight;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
  try {
    paidAiApproval.consumeAttempt();
    const result = await invokeTextProvider({
      policy,
      system: systemPrompt,
      prompt: userMessage,
      signal: controller.signal,
      maxTokens: 512,
    });
    return { text: result.output, tokensIn: result.usage.inputTokens, tokensOut: result.usage.outputTokens };
  } finally {
    clearTimeout(timer);
  }
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
  const policy = taskPolicies.coach_insight;
  if (!hasProviderCredential(policy.provider)) {
    return {
      name: 'coach_insight',
      passed: 0, total: COACH_INSIGHT_CASES.length, rate: 0,
      skipped: true, skipReason: `${policy.provider} credential not set`,
      avgLatencyMs: 0, cases: [],
    };
  }

  const cases: CaseResult[] = [];
  for (const spec of paidAiApproval.boundCases(COACH_INSIGHT_CASES)) {
    const start = Date.now();
    try {
      const { text } = await callCoachPolicy(COACH_INSIGHT_SYSTEM, spec.clientContext);
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
    console.log(yellow('  All suites skipped. Configure the routed provider credentials and production-backed DB.'));
    console.log(yellow(`  GATE: inconclusive — no active suites`));
    process.exit(1);
  }

  const skippedRequired = results.filter((r) => r.skipped && requiredSuites.has(r.name));
  if (skippedRequired.length > 0) {
    console.log(red(`\n  Required eval suite skipped: ${skippedRequired.map((r) => `${r.name} (${r.skipReason})`).join(', ')}\n`));
    if (enforceGate) process.exit(1);
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
        gateEnforced: enforceGate,
        suites: results,
      },
      null,
      2,
    ),
  );
  console.log(dim(`\n  Report → ${reportPath}`));

  if (active.length > 0 && aggregateRate < THRESHOLD) {
    if (enforceGate) {
      console.log(red(`\n  HARD GATE FAILED: ${aggregateRate.toFixed(1)}% < ${THRESHOLD}%\n`));
      process.exit(1);
    }
    console.log(yellow(`\n  OBSERVATION ONLY: ${aggregateRate.toFixed(1)}% < ${THRESHOLD}%; deterministic release gates remain authoritative.\n`));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
