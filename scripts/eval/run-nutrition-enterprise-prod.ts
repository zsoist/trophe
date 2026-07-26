import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import {
  FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS,
  requirePaidAiToolApproval,
  resolvePaidAiRouteEndpoint,
} from '../safety/require-paid-ai-approval';

// Auto-load .env.local so the script works without manual `source .env.local`
const paidEndpoint = resolvePaidAiRouteEndpoint({
  baseUrl: process.env.TROPHE_API ?? 'https://trophe.app',
  pathname: '/api/food/parse',
  operation: 'eval-nutrition-enterprise-prod',
});
const paidAiApproval = requirePaidAiToolApproval({
  operation: 'eval-nutrition-enterprise-prod',
  argv: process.argv.slice(2),
  env: process.env,
  endpoints: [paidEndpoint],
});
paidAiApproval.reserveOpaqueEnvelope({
  endpoint: paidEndpoint,
  maxProviderAttempts: FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS,
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
};
type ParsedItem = {
  food_name: string;
  grams: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  confidence: number;
  source: string;
};

const datasetVersion = process.env.EVAL_DATASET ?? 'v2';
const datasetPath = join(process.cwd(), `agents/evals/datasets/nutrition-enterprise-${datasetVersion}.json`);
const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as { version: string; cases: EvalCase[] };
console.log(`[eval] dataset: ${datasetVersion} (${dataset.cases.length} cases)`);
const baseUrl = new URL(paidEndpoint).origin;
const concurrency = Math.min(Math.max(Number(process.env.EVAL_CONCURRENCY ?? 5), 1), 10);
const email = process.env.EVAL_AUTH_EMAIL;
const password = process.env.EVAL_AUTH_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function within(actual: number, expected?: Range) {
  return !expected || (actual >= expected.min && actual <= expected.max);
}

function rangeCenter(expected?: Range) {
  return expected ? (expected.min + expected.max) / 2 : null;
}

// MAPE is undefined near zero: a 0-cal supplement with range center 2.5 scores
// 100% APE for being exactly right. Exclude tiny denominators (NutriBench does
// the same) — calories < 10 kcal, macros < 2 g.
const MIN_APE_CENTER_CALORIES = 10;
const MIN_APE_CENTER_MACRO = 2;

function errorMetrics(actual: number, expected: Range | undefined, minCenter: number) {
  const center = rangeCenter(expected);
  if (center === null || center < minCenter) return { signedError: null, absolutePercentageError: null };
  return {
    signedError: actual - center,
    absolutePercentageError: Math.abs(actual - center) / center,
  };
}

async function accessToken() {
  // Option 1: Service role key → generate magic link OTP, then verify to get JWT
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceRoleKey && supabaseUrl && anonKey) {
    try {
      // Find the eval test user. MUST be the rate-limit-allowlisted eval account
      // (lib/security/api-guard.ts EVAL_BYPASS): `users[0]` once silently became a
      // non-allowlisted user when signup order changed → the run hit the 60-req
      // wall and scored 0 across the board (2026-07-03 incident).
      const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?per_page=50`, {
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
      });
      if (listRes.ok) {
        const data = await listRes.json() as { users?: Array<{ email?: string }> };
        const evalEmail = process.env.EVAL_AUTH_EMAIL
          ?? data.users?.find(u => u.email?.startsWith('eval-tester'))?.email
          ?? data.users?.[0]?.email;
        if (evalEmail) {
          // Generate a magic link + OTP via admin API
          const linkRes = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link`, {
            method: 'POST',
            headers: {
              apikey: serviceRoleKey,
              authorization: `Bearer ${serviceRoleKey}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({ type: 'magiclink', email: evalEmail }),
          });
          if (linkRes.ok) {
            const linkData = await linkRes.json() as { email_otp?: string };
            if (linkData.email_otp) {
              // Verify the OTP to get a valid JWT access token
              const verifyRes = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=id_token`, {
                method: 'POST',
                headers: { apikey: anonKey, 'content-type': 'application/json' },
                body: JSON.stringify({ email: evalEmail, token: linkData.email_otp, gotrue_meta_security: {} }),
              });
              // Fallback: use verify endpoint
              if (!verifyRes.ok) {
                const verifyRes2 = await fetch(`${supabaseUrl}/auth/v1/verify`, {
                  method: 'POST',
                  headers: { apikey: anonKey, 'content-type': 'application/json' },
                  body: JSON.stringify({ type: 'magiclink', token: linkData.email_otp, email: evalEmail }),
                });
                if (verifyRes2.ok) {
                  const verifyData = await verifyRes2.json() as { access_token?: string };
                  if (verifyData.access_token) return verifyData.access_token;
                }
              } else {
                const verifyData = await verifyRes.json() as { access_token?: string };
                if (verifyData.access_token) return verifyData.access_token;
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('[eval] Service role auth failed:', err instanceof Error ? err.message : err);
    }
    console.warn('[eval] Service role auth fallback failed, trying email/password...');
  }

  // Option 2: Email/password auth (original flow)
  if (!email || !password || !supabaseUrl || !anonKey) {
    throw new Error(
      'Auth required. Set SUPABASE_SERVICE_ROLE_KEY (preferred) or ' +
      'EVAL_AUTH_EMAIL + EVAL_AUTH_PASSWORD + NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY'
    );
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`Eval authentication failed (${response.status})`);
  return (await response.json() as { access_token: string }).access_token;
}

// Multi-run median mode: EVAL_RUNS_PER_CASE > 1 calls the API N times per case
// and scores the run with the median calorie total. LLM sampling noise produces
// ±2-4% run-to-run swing on single runs; the median run is what a "typical" user
// sees and makes scores comparable across benchmark runs.
const runsPerCase = Math.min(Math.max(Number(process.env.EVAL_RUNS_PER_CASE ?? 1), 1), 5);

async function callOnce(test: EvalCase, token: string) {
  const startedAt = Date.now();
  const language = test.language === 'mixed' ? 'en' : test.language;
  const response = await paidAiApproval.fetchOpaque(paidEndpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ text: test.input, language }),
  }, { maxProviderAttempts: FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS });
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
  return { response, data, items, totals, latencyMs: Date.now() - startedAt };
}

async function runCase(test: EvalCase, token: string) {
  const attempts = [await callOnce(test, token)];
  // Extra runs only matter when the LLM is in the loop — a DB-resolved parse is
  // deterministic, so skip duplicates when every item already came from local_db.
  const fullyDeterministic = attempts[0].items.length > 0
    && attempts[0].items.every((item) => item.source?.startsWith('local_db'));
  if (runsPerCase > 1 && !fullyDeterministic && attempts[0].response.ok) {
    for (let i = 1; i < runsPerCase; i++) attempts.push(await callOnce(test, token));
  }
  const byCalories = [...attempts].sort((a, b) => a.totals.calories - b.totals.calories);
  const { response, data, items, totals } = byCalories[Math.floor((byCalories.length - 1) / 2)];
  const latencyMs = [...attempts.map(a => a.latencyMs)].sort((a, b) => a - b)[Math.floor((attempts.length - 1) / 2)];
  const emptyAdversarial = test.category === 'adversarial' && test.input.trim() === '';
  const statusPassed = emptyAdversarial ? response.status === 400 : response.ok;
  const checks = {
    status: statusPassed,
    // Segmentation granularity is ambiguous for composites ("bread with feta and
    // olives" parses to 1-3 items across runs while totals stay correct). Macros
    // are what the product reports; allow ±1 item when 2+ are expected.
    itemCount: emptyAdversarial || (test.expect_item_count >= 2
      ? Math.abs(items.length - test.expect_item_count) <= 1 && items.length >= 1
      : items.length === test.expect_item_count),
    calories: within(totals.calories, test.expect_total?.calories),
    protein: within(totals.protein_g, test.expect_total?.protein_g),
    carbs: within(totals.carbs_g, test.expect_total?.carbs_g),
    fat: within(totals.fat_g, test.expect_total?.fat_g),
    clarification: !test.expect_needs_clarification || data.needs_clarification === true || items.length === 0,
  };
  // A 0-item meal (clarification / refusal) has no macro PREDICTION — scoring 0 vs a
  // non-zero range as 100% APE pollutes MAPE and invents a phantom under-estimate bias.
  // Exclude empty meals from MAPE/signed-error; they're still judged by checks.clarification
  // + pass-rate, and surfaced separately as emptyRate.
  const empty = items.length === 0;
  const NULL_ERR: { signedError: number | null; absolutePercentageError: number | null } =
    { signedError: null, absolutePercentageError: null };
  const errors = empty ? { calories: NULL_ERR, protein: NULL_ERR, carbs: NULL_ERR, fat: NULL_ERR } : {
    calories: errorMetrics(totals.calories, test.expect_total?.calories, MIN_APE_CENTER_CALORIES),
    protein: errorMetrics(totals.protein_g, test.expect_total?.protein_g, MIN_APE_CENTER_MACRO),
    carbs: errorMetrics(totals.carbs_g, test.expect_total?.carbs_g, MIN_APE_CENTER_MACRO),
    fat: errorMetrics(totals.fat_g, test.expect_total?.fat_g, MIN_APE_CENTER_MACRO),
  };
  return {
    id: test.id,
    language: test.language,
    category: test.category,
    input: test.input,
    passed: Object.values(checks).every(Boolean),
    latencyMs,
    status: response.status,
    checks,
    totals,
    items: items.length,
    empty,
    parsedItems: items.map((item) => ({
      foodName: item.food_name,
      grams: item.grams,
      calories: item.calories,
      protein_g: item.protein_g,
      carbs_g: item.carbs_g,
      fat_g: item.fat_g,
      confidence: item.confidence,
      source: item.source,
    })),
    totalGrams: items.reduce((sum, item) => sum + (item.grams ?? 0), 0),
    meanConfidence: items.length
      ? items.reduce((sum, item) => sum + (item.confidence ?? 0), 0) / items.length
      : null,
    dbResolved: items.length > 0 && items.every((item) => item.source?.startsWith('local_db')),
    needsClarification: data.needs_clarification === true,
    errors,
    error: data.error,
  };
}

async function main() {
  const approvedCases = paidAiApproval.boundJobs(dataset.cases, {
    maxAttemptsPerJob:
      FOOD_PARSE_OPAQUE_MAX_PROVIDER_ATTEMPTS * runsPerCase,
  });
  const token = await accessToken();
  const results: Awaited<ReturnType<typeof runCase>>[] = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < approvedCases.length) {
      const index = next++;
      results[index] = await runCase(approvedCases[index], token);
    }
  }));

  const latencies = results.map((item) => item.latencyMs).sort((a, b) => a - b);
  const groups = [...new Set(results.map((item) => item.category))].map((category) => {
    const selected = results.filter((item) => item.category === category);
    return { category, passed: selected.filter((item) => item.passed).length, total: selected.length };
  });
  const metricSummary = (metric: 'calories' | 'protein' | 'carbs' | 'fat') => {
    const selected = results
      .map((item) => item.errors[metric])
      .filter((item) => item.absolutePercentageError !== null);
    return {
      sampleSize: selected.length,
      mape: selected.reduce((sum, item) => sum + item.absolutePercentageError!, 0) / selected.length,
      meanSignedError: selected.reduce((sum, item) => sum + item.signedError!, 0) / selected.length,
    };
  };
  const sourceCounts = results.flatMap((item) => item.parsedItems)
    .reduce<Record<string, number>>((counts, item) => {
      counts[item.source ?? 'unknown'] = (counts[item.source ?? 'unknown'] ?? 0) + 1;
      return counts;
    }, {});
  const summary = {
    version: dataset.version,
    baseUrl,
    total: results.length,
    passed: results.filter((item) => item.passed).length,
    passRate: results.filter((item) => item.passed).length / results.length,
    p50LatencyMs: latencies[Math.ceil(latencies.length * 0.5) - 1],
    p95LatencyMs: latencies[Math.ceil(latencies.length * 0.95) - 1],
    dbResolvedRate: results.filter((item) => item.dbResolved).length / results.length,
    clarificationRate: results.filter((item) => item.needsClarification).length / results.length,
    emptyRate: results.filter((item) => item.empty).length / results.length,
    emptyMeals: results.filter((item) => item.empty).length,
    metrics: {
      calories: metricSummary('calories'),
      protein: metricSummary('protein'),
      carbs: metricSummary('carbs'),
      fat: metricSummary('fat'),
    },
    sourceCounts,
    groups,
    accAt7_5: (() => {
      const threshold = 0.075;
      // Eligible: calories APE computable. Macros with near-zero expected
      // centers (APE excluded) count as passing when the value is in range.
      const macroOk = (r: typeof results[number], metric: 'protein' | 'carbs' | 'fat') => {
        const ape = r.errors[metric].absolutePercentageError;
        if (ape !== null) return ape <= threshold;
        const check = r.checks[metric];
        return check === true;
      };
      const eligible = results.filter(r => r.errors.calories.absolutePercentageError !== null);
      const passing = eligible.filter(r =>
        r.errors.calories.absolutePercentageError! <= threshold &&
        macroOk(r, 'protein') && macroOk(r, 'carbs') && macroOk(r, 'fat')
      );
      return { passed: passing.length, eligible: eligible.length, rate: eligible.length > 0 ? passing.length / eligible.length : 0 };
    })(),
  };
  mkdirSync(join(process.cwd(), 'artifacts', 'evals'), { recursive: true });
  // Per-dataset filename (2026-07-03): back-to-back v2+v3 runs used to overwrite
  // each other's per-case dump, destroying A/B forensics for whichever ran first.
  const datasetTag = process.env.EVAL_DATASET === 'v3' ? 'v3' : 'v2';
  writeFileSync(
    join(process.cwd(), 'artifacts', 'evals', `nutrition-enterprise-production-${datasetTag}.json`),
    JSON.stringify({ createdAt: new Date().toISOString(), summary, results }, null, 2),
  );
  console.log(JSON.stringify(summary, null, 2));

  // ── MAPE history tracking ──────────────────────────────────────────────────
  const historyDir = join(process.cwd(), 'agents', 'evals', 'results');
  mkdirSync(historyDir, { recursive: true });
  let commitSha = 'unknown';
  try { commitSha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim(); } catch {}
  const historyEntry = JSON.stringify({
    timestamp: new Date().toISOString(),
    version: summary.version,
    total: summary.total,
    passed: summary.passed,
    passRate: summary.passRate,
    mape: {
      calories: summary.metrics.calories.mape,
      protein: summary.metrics.protein.mape,
      carbs: summary.metrics.carbs.mape,
      fat: summary.metrics.fat.mape,
    },
    dbResolvedRate: summary.dbResolvedRate,
    accAt7_5: summary.accAt7_5.rate,
    commitSha,
  });
  appendFileSync(join(historyDir, 'nutrition-enterprise-history.jsonl'), historyEntry + '\n');

  // ── Eval gate enforcement ────────────────────────────────────────────────
  const enforceGate = process.env.EVAL_ENFORCE_GATE === '1';
  if (enforceGate) {
    const minPassRate = parseFloat(process.env.EVAL_MIN_PASS_RATE ?? '0.40');
    if (summary.passRate < minPassRate) {
      console.error(`\n❌ EVAL GATE FAILED: pass rate ${(summary.passRate * 100).toFixed(1)}% < required ${(minPassRate * 100).toFixed(1)}%`);
      process.exit(1);
    }
    console.log(`\n✅ EVAL GATE PASSED: ${(summary.passRate * 100).toFixed(1)}% ≥ ${(minPassRate * 100).toFixed(1)}%`);
  }

  // ── Latency p95 gate ─────────────────────────────────────────────────────
  const P95_LATENCY_LIMIT_MS = 3500;
  if (summary.p95LatencyMs > P95_LATENCY_LIMIT_MS) {
    console.warn(`\n⚠️ LATENCY WARNING: p95 = ${summary.p95LatencyMs}ms > ${P95_LATENCY_LIMIT_MS}ms limit`);
    if (enforceGate) {
      console.error('❌ LATENCY GATE FAILED — exiting');
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
