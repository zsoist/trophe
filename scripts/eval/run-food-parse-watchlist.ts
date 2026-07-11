#!/usr/bin/env npx tsx

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { foodParseSimulatorPolicy, taskPolicies } from '../../agents/router/policies';
import { assertOffPeakEvalWindow } from './off-peak';
import { verifyProductionFoodParsePolicy } from './verify-production-food-parse-policy';

loadEnvConfig(process.cwd());

type Range = { min: number; max: number };
type WatchCase = {
  id: string;
  input: string;
  language: string;
  category: string;
  greek_tagged: boolean;
  expected_canonical_foods: string[];
  expect_item_count: number;
  expect_total: Record<'calories' | 'protein_g' | 'carbs_g' | 'fat_g', Range>;
};

type WatchFixture = { version: string; cases: WatchCase[] };

type ParsedItem = {
  food_name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};
type ParseResponseBody = { items?: ParsedItem[]; error?: string };

const fixturePath = join(process.cwd(), 'tests/fixtures/food-parse-luna-watchlist.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as WatchFixture;

function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

function normalizeFoodName(value: string): string {
  return value.normalize('NFKD').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function canonicalFoodsMatch(expected: string[], actual: string[]): boolean {
  const normalizedActual = actual.map(normalizeFoodName);
  return expected.every((expectedName) => {
    const normalizedExpected = normalizeFoodName(expectedName);
    return normalizedActual.some((actualName) =>
      actualName.includes(normalizedExpected) || normalizedExpected.includes(actualName),
    );
  });
}

async function getAccessToken(): Promise<string> {
  const email = process.env.EVAL_AUTH_EMAIL;
  const password = process.env.EVAL_AUTH_PASSWORD;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!email || !password || !supabaseUrl || !anonKey) {
    throw new Error('EVAL_AUTH_EMAIL, EVAL_AUTH_PASSWORD, NEXT_PUBLIC_SUPABASE_URL, and NEXT_PUBLIC_SUPABASE_ANON_KEY are required');
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json() as { access_token?: string; error_description?: string };
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? `Eval authentication failed (${response.status})`);
  }
  return data.access_token;
}

async function main(): Promise<void> {
  assertOffPeakEvalWindow();
  if (foodParseSimulatorPolicy !== taskPolicies.food_parse) {
    throw new Error('Watch-list simulator policy is not the production food_parse policy object');
  }
  const token = await getAccessToken();
  const apiBase = process.env.TROPHE_API ?? 'https://trophe.app';
  const deployedPolicy = await verifyProductionFoodParsePolicy(apiBase);

  const results = [];
  for (const testCase of fixture.cases) {
    const startedAt = Date.now();
    let response: Response | undefined;
    let body: ParseResponseBody | null = null;
    let transportError: string | undefined;
    try {
      response = await fetch(`${apiBase}/api/food/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'x-trophe-eval-suite': 'phase3-luna-watchlist',
          'x-request-id': `watchlist-${testCase.id}-${Date.now()}`,
        },
        body: JSON.stringify({ text: testCase.input, language: testCase.language }),
      });
      body = await response.json().catch(() => null) as ParseResponseBody | null;
    } catch (error) {
      transportError = error instanceof Error ? error.message : String(error);
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    const malformed = !response?.ok || !body || !Array.isArray(body.items);
    const totals = {
      calories: items.reduce((sum, item) => sum + item.calories, 0),
      protein_g: items.reduce((sum, item) => sum + item.protein_g, 0),
      carbs_g: items.reduce((sum, item) => sum + item.carbs_g, 0),
      fat_g: items.reduce((sum, item) => sum + item.fat_g, 0),
    };
    const failures: string[] = [];
    if (malformed) {
      failures.push(transportError ?? body?.error ?? `malformed/empty output (HTTP ${response?.status ?? 0})`);
    }
    if (items.length !== testCase.expect_item_count) {
      failures.push(`item count ${items.length} != ${testCase.expect_item_count}`);
    }
    const foodNames = items.map((item) => item.food_name);
    if (!canonicalFoodsMatch(testCase.expected_canonical_foods, foodNames)) {
      failures.push(`canonical foods ${JSON.stringify(foodNames)} did not match ${JSON.stringify(testCase.expected_canonical_foods)}`);
    }
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      if (!inRange(totals[key], testCase.expect_total[key])) {
        const range = testCase.expect_total[key];
        failures.push(`${key} ${totals[key]} outside [${range.min}, ${range.max}]`);
      }
    }
    results.push({
      id: testCase.id,
      greekTagged: testCase.greek_tagged,
      passed: failures.length === 0,
      malformed,
      failures,
      latencyMs: Date.now() - startedAt,
      httpStatus: response?.status ?? 0,
      expectedModel: foodParseSimulatorPolicy.model,
      items,
      totals,
    });
    console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${testCase.id}`);
  }

  const output = {
    timestamp: new Date().toISOString(),
    fixtureVersion: fixture.version,
    apiBase,
    expectedPolicy: foodParseSimulatorPolicy,
    verifiedDeployedPolicy: deployedPolicy,
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    malformedRate: results.filter((result) => result.malformed).length / results.length,
    results,
  };
  const reportDir = join(process.cwd(), 'artifacts/watchlist');
  mkdirSync(reportDir, { recursive: true });
  const reportPath = join(reportDir, `food-parse-watchlist-${Date.now()}.json`);
  writeFileSync(reportPath, JSON.stringify(output, null, 2));
  console.log(`Watch-list: ${output.passed}/${output.total}; report=${reportPath}`);
  if (output.passed !== output.total) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
