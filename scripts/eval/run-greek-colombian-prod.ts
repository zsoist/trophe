#!/usr/bin/env npx tsx
/**
 * run-greek-colombian-prod.ts
 *
 * Phase 1 production eval: 30 Greek + Colombian food-parse cases.
 * Authenticates as eval-tester-2026, runs each case against production,
 * evaluates against golden expected values, outputs structured report.
 *
 * Usage:
 *   npx tsx scripts/eval/run-greek-colombian-prod.ts
 *
 * Env:
 *   EVAL_EMAIL    — eval tester email (default: eval-tester-2026@trophe.app)
 *   EVAL_PASSWORD — eval tester password
 *   TROPHE_API    — base URL (default: https://trophe.app)
 *
 * Output:
 *   /tmp/eval-greek-colombian-<timestamp>.json — full structured report
 *   stdout — summary table
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

// ─── Types ──────────────────────────────────────────────────────────────────

interface GoldenCase {
  id: string;
  language: string;
  input: string;
  category: string;
  expectedFallbackToAI: boolean;
  notes: string;
  expected: {
    items?: number;
    primaryFood?: string[];
    totalKcal?: { min: number; max: number };
    totalProtein?: { min: number; max: number };
    totalFat?: { min: number; max: number };
    totalCarbs?: { min: number; max: number };
    fallbackFlag?: boolean;
    confidenceMax?: number;
    kcalReasonable?: { min: number; max: number };
  };
}

interface GoldenFile {
  version: string;
  pass_criteria: {
    item_count_match: boolean;
    portion_tolerance_pct: number;
    macro_tolerance_pct: number;
    latency_p95_ms: number;
  };
  cases: GoldenCase[];
}

interface ParsedItem {
  raw_text: string;
  food_name: string;
  name_localized: string;
  quantity: number;
  unit: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
  confidence: number;
  source: string;
}

interface CaseResult {
  id: string;
  language: string;
  category: string;
  input: string;
  expectedFallbackToAI: boolean;
  latencyMs: number;
  httpStatus: number;
  error: string | null;
  response: { items: ParsedItem[] } | null;
  checks: {
    itemCount: { expected: number | null; actual: number; pass: boolean };
    foodIdentification: { expected: string[] | null; found: string[]; pass: boolean };
    kcal: { expected: { min: number; max: number } | null; actual: number; pass: boolean };
    protein: { expected: { min: number; max: number } | null; actual: number; pass: boolean };
    fat: { expected: { min: number; max: number } | null; actual: number; pass: boolean };
    carbs: { expected: { min: number; max: number } | null; actual: number; pass: boolean };
    fallbackSource: { expected: boolean; actual: boolean; pass: boolean };
    confidence: { max: number | null; actual: number; pass: boolean };
    latency: { maxMs: number; actual: number; pass: boolean };
  };
  passed: boolean;
}

// ─── Config ─────────────────────────────────────────────────────────────────

const EVAL_EMAIL = process.env.EVAL_EMAIL || 'eval-tester-2026@trophe.app';
const EVAL_PASSWORD = process.env.EVAL_PASSWORD;
const TROPHE_API = process.env.TROPHE_API || 'https://trophe.app';
const SUPABASE_URL = 'https://iwbpzwmidzvpiofnqexd.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_mEkTXGkdpQyH9ZWqgAWoBQ_b8iTG2cZ';
const MAX_LATENCY_MS = 8000;

if (!EVAL_PASSWORD) {
  console.error('❌ EVAL_PASSWORD env var required');
  console.error('   Source it: source ~/.local/secrets/trophe-eval.env');
  process.exit(1);
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function getAccessToken(): Promise<string> {
  console.log(`🔑 Signing in as ${EVAL_EMAIL}...`);
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ email: EVAL_EMAIL, password: EVAL_PASSWORD }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) throw new Error('No access_token in auth response');
  console.log(`✅ Authenticated (user_id: ${data.user?.id?.slice(0, 8)}...)`);
  return data.access_token;
}

// ─── Runner ─────────────────────────────────────────────────────────────────

async function runCase(
  c: GoldenCase,
  token: string,
): Promise<CaseResult> {
  const t0 = Date.now();
  let httpStatus = 0;
  let error: string | null = null;
  let response: { items: ParsedItem[] } | null = null;

  try {
    const res = await fetch(`${TROPHE_API}/api/food/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text: c.input, language: c.language }),
    });
    httpStatus = res.status;
    const body = await res.json();

    if (res.ok && body.items) {
      response = { items: body.items };
    } else {
      error = body.error || `HTTP ${res.status}`;
    }
  } catch (e: any) {
    error = e.message || String(e);
  }

  const latencyMs = Date.now() - t0;
  const items = response?.items ?? [];

  // ─── Compute totals ─────────────────────────────────────────────────
  const totalKcal = items.reduce((s, i) => s + (i.calories ?? 0), 0);
  const totalProtein = items.reduce((s, i) => s + (i.protein_g ?? 0), 0);
  const totalFat = items.reduce((s, i) => s + (i.fat_g ?? 0), 0);
  const totalCarbs = items.reduce((s, i) => s + (i.carbs_g ?? 0), 0);
  const avgConfidence = items.length
    ? items.reduce((s, i) => s + (i.confidence ?? 0), 0) / items.length
    : 0;
  const hasAiFallback = items.some((i) => i.source === 'ai_estimate');
  const foodNames = items.map((i) => i.food_name?.toLowerCase() ?? '');

  const ex = c.expected;

  // ─── Checks ──────────────────────────────────────────────────────────

  // Item count
  const expectedItemCount = ex.items ?? null;
  const itemCountPass = expectedItemCount === null || items.length === expectedItemCount;

  // Food identification (partial match: at least ONE expected keyword appears in at least one food_name)
  // Uses word-boundary-aware matching: "egg" matches "egg, whole, raw" but not "eggplant"
  const expectedFoods = ex.primaryFood ?? null;
  const foodIdPass = expectedFoods === null || expectedFoods.some((ef) => {
    const needle = ef.toLowerCase();
    return foodNames.some((fn) => {
      // Direct substring for multi-word (e.g. "olive oil" in "oil, olive, salad or cooking")
      if (needle.includes(' ')) {
        const words = needle.split(' ');
        return words.every((w) => fn.includes(w));
      }
      // Word-boundary match for single words, with plural tolerance
      const singularNeedle = needle.endsWith('s') ? needle.slice(0, -1) : needle;
      return fn.split(/[\s,()]+/).some((word) => {
        const singularWord = word.endsWith('s') ? word.slice(0, -1) : word;
        return word === needle || singularWord === needle || word === singularNeedle || singularWord === singularNeedle;
      });
    });
  });

  // Macro ranges
  const kcalRange = c.expectedFallbackToAI ? (ex.kcalReasonable ?? null) : (ex.totalKcal ?? null);
  const kcalPass = kcalRange === null || (totalKcal >= kcalRange.min && totalKcal <= kcalRange.max);

  const proteinRange = ex.totalProtein ?? null;
  const proteinPass = proteinRange === null || (totalProtein >= proteinRange.min && totalProtein <= proteinRange.max);

  const fatRange = ex.totalFat ?? null;
  const fatPass = fatRange === null || (totalFat >= fatRange.min && totalFat <= fatRange.max);

  const carbsRange = ex.totalCarbs ?? null;
  const carbsPass = carbsRange === null || (totalCarbs >= carbsRange.min && totalCarbs <= carbsRange.max);

  // Fallback source check
  const expectedFallback = c.expectedFallbackToAI;
  const fallbackPass = !expectedFallback || hasAiFallback;

  // Confidence check (for fallback cases, avg confidence should be ≤ max)
  const confMax = ex.confidenceMax ?? null;
  const confPass = confMax === null || avgConfidence <= confMax;

  // Latency
  const latencyPass = latencyMs <= MAX_LATENCY_MS;

  // Overall pass: no error + all checks green
  const allChecksPass =
    !error &&
    httpStatus === 200 &&
    itemCountPass &&
    foodIdPass &&
    kcalPass &&
    proteinPass &&
    fatPass &&
    carbsPass &&
    fallbackPass &&
    confPass &&
    latencyPass;

  return {
    id: c.id,
    language: c.language,
    category: c.category,
    input: c.input,
    expectedFallbackToAI: c.expectedFallbackToAI,
    latencyMs,
    httpStatus,
    error,
    response,
    checks: {
      itemCount: { expected: expectedItemCount, actual: items.length, pass: itemCountPass },
      foodIdentification: { expected: expectedFoods, found: foodNames, pass: foodIdPass },
      kcal: { expected: kcalRange, actual: totalKcal, pass: kcalPass },
      protein: { expected: proteinRange, actual: totalProtein, pass: proteinPass },
      fat: { expected: fatRange, actual: totalFat, pass: fatPass },
      carbs: { expected: carbsRange, actual: totalCarbs, pass: carbsPass },
      fallbackSource: { expected: expectedFallback, actual: hasAiFallback, pass: fallbackPass },
      confidence: { max: confMax, actual: avgConfidence, pass: confPass },
      latency: { maxMs: MAX_LATENCY_MS, actual: latencyMs, pass: latencyPass },
    },
    passed: allChecksPass,
  };
}

// ─── Report ─────────────────────────────────────────────────────────────────

function printSummary(results: CaseResult[]) {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  const inScope = results.filter((r) => !r.expectedFallbackToAI);
  const fallback = results.filter((r) => r.expectedFallbackToAI);
  const inScopePassed = inScope.filter((r) => r.passed).length;
  const fallbackPassed = fallback.filter((r) => r.passed).length;

  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];

  // By category
  const categories = [...new Set(results.map((r) => r.category))];
  const byCategory = categories.map((cat) => {
    const cases = results.filter((r) => r.category === cat);
    return { category: cat, total: cases.length, passed: cases.filter((r) => r.passed).length };
  });

  // By language
  const byLanguage = ['el', 'es'].map((lang) => {
    const cases = results.filter((r) => r.language === lang);
    return { language: lang, total: cases.length, passed: cases.filter((r) => r.passed).length };
  });

  console.log('\n' + '═'.repeat(72));
  console.log(' GREEK + COLOMBIAN PRODUCTION EVAL — PHASE 1 BASELINE');
  console.log('═'.repeat(72));
  console.log(`\n📊 Overall: ${passed}/${total} passed (${((passed / total) * 100).toFixed(1)}%)`);
  console.log(`   Failed:  ${failed}/${total}`);

  console.log(`\n🎯 In-scope (DB-backed): ${inScopePassed}/${inScope.length} (${((inScopePassed / inScope.length) * 100).toFixed(1)}%)`);
  console.log(`🤖 Fallback (AI):        ${fallbackPassed}/${fallback.length} (${((fallbackPassed / fallback.length) * 100).toFixed(1)}%)`);

  console.log(`\n⏱️  Latency: p50=${p50}ms  p95=${p95}ms  p99=${p99}ms`);

  console.log('\n📂 By Category:');
  for (const c of byCategory) {
    const pct = ((c.passed / c.total) * 100).toFixed(0);
    console.log(`   ${c.category.padEnd(25)} ${c.passed}/${c.total} (${pct}%)`);
  }

  console.log('\n🌍 By Language:');
  for (const l of byLanguage) {
    const pct = ((l.passed / l.total) * 100).toFixed(0);
    const label = l.language === 'el' ? 'Greek (el)' : 'Colombian Spanish (es)';
    console.log(`   ${label.padEnd(25)} ${l.passed}/${l.total} (${pct}%)`);
  }

  // Failures detail
  const failures = results.filter((r) => !r.passed);
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    for (const f of failures) {
      const failedChecks = Object.entries(f.checks)
        .filter(([, v]) => !v.pass)
        .map(([k, v]) => {
          const vAny = v as Record<string, unknown>;
          if ('expected' in vAny && vAny.expected !== null) {
            const exp = typeof vAny.expected === 'object' && vAny.expected !== null && 'min' in (vAny.expected as Record<string, unknown>)
              ? `[${(vAny.expected as any).min}–${(vAny.expected as any).max}]`
              : JSON.stringify(vAny.expected);
            return `${k}: got ${JSON.stringify(vAny.actual ?? vAny.found)}, expected ${exp}`;
          }
          return `${k}: ${JSON.stringify(vAny.actual ?? vAny.found)}`;
        });
      console.log(`\n   ${f.id} — "${f.input}"`);
      if (f.error) console.log(`      ERROR: ${f.error}`);
      for (const fc of failedChecks) {
        console.log(`      ✗ ${fc}`);
      }
    }
  }

  console.log('\n' + '═'.repeat(72));
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  // Load golden cases
  const goldenPath = resolve(__dirname, '../../agents/evals/food-parse-greek-colombian-golden.json');
  const golden: GoldenFile = JSON.parse(readFileSync(goldenPath, 'utf-8'));
  console.log(`📋 Loaded ${golden.cases.length} cases from golden file`);

  // Authenticate
  const token = await getAccessToken();

  // Run cases sequentially (avoid overwhelming production)
  const results: CaseResult[] = [];
  for (let i = 0; i < golden.cases.length; i++) {
    const c = golden.cases[i];
    process.stdout.write(`  [${i + 1}/${golden.cases.length}] ${c.id}: "${c.input.slice(0, 40)}"... `);
    const result = await runCase(c, token);
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.latencyMs}ms`);
    results.push(result);

    // Small delay to be polite to production
    if (i < golden.cases.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Print summary
  printSummary(results);

  // Save full report
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = `/tmp/eval-greek-colombian-${ts}.json`;
  const report = {
    timestamp: new Date().toISOString(),
    apiBase: TROPHE_API,
    evalUser: EVAL_EMAIL,
    goldenVersion: golden.version,
    totalCases: results.length,
    totalPassed: results.filter((r) => r.passed).length,
    passRate: results.filter((r) => r.passed).length / results.length,
    latency: {
      p50: results.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.5)],
      p95: results.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.95)],
      p99: results.map((r) => r.latencyMs).sort((a, b) => a - b)[Math.floor(results.length * 0.99)],
    },
    results,
  };

  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n💾 Full report saved to: ${reportPath}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
