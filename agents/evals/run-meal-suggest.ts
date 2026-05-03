/**
 * Trophē v0.3 — meal_suggest model eval.
 *
 * Validates Claude Haiku 4.5 + tool_choice as the meal_suggest model.
 * Decision gate for migrating from gemini-2.0-flash (deprecated June 1, 2026).
 *
 * Approach:
 *   - Anthropic SDK with tool_use + tool_choice forcing `submit_meal_suggestions`
 *   - Schema enforcement at decoding layer (no regex extraction needed)
 *   - 10 prompts covering diverse macro scenarios
 *
 * Scoring (deterministic, no LLM judge):
 *   1. Schema validity   — tool was called with all required fields (1pt)
 *   2. Suggestion count   — exactly 3 suggestions (1pt)
 *   3. Macro fit          — each suggestion's cals ≤ remaining * 1.25 (1pt)
 *   4. Diversity          — 3 unique meal names (1pt)
 *   5. Realism            — no zero/negative values, portions make sense (1pt)
 *   Total: 5pts/prompt × 10 prompts = 50 max. Pass threshold: ≥40/50 (80%).
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx agents/evals/run-meal-suggest.ts
 *
 * Exit codes:
 *   0 — eval completed (check report for results)
 *   1 — hard failure or below threshold
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// ── Config ──────────────────────────────────────────────────────────────────

const MODEL = 'claude-haiku-4-5-20251001';
const REPORT_DIR = join(process.cwd(), 'agents/evals/reports');
mkdirSync(REPORT_DIR, { recursive: true });

// ── Types ───────────────────────────────────────────────────────────────────

interface MealSuggestInput {
  id: string;
  remaining_calories: number;
  remaining_protein_g: number;
  remaining_carbs_g: number;
  remaining_fat_g: number;
  preferences?: string;
  meal_type?: string;
  scenario: string;
}

interface Suggestion {
  name: string;
  description: string;
  ingredients: string[];
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
}

interface CaseScore {
  schemaValid: boolean;
  suggestionCount: boolean;
  macroFit: boolean;
  diversity: boolean;
  realism: boolean;
  points: number;
  failures: string[];
  latencyMs: number;
  suggestions?: Suggestion[];
}

// ── Tool schema ─────────────────────────────────────────────────────────────

const MEAL_SUGGEST_TOOL = {
  name: 'submit_meal_suggestions',
  description: 'Submit 3 meal suggestions matching the macro budget',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            description: { type: 'string' as const },
            ingredients: { type: 'array' as const, items: { type: 'string' as const } },
            estimated_calories: { type: 'number' as const },
            estimated_protein_g: { type: 'number' as const },
            estimated_carbs_g: { type: 'number' as const },
            estimated_fat_g: { type: 'number' as const },
          },
          required: [
            'name', 'description', 'ingredients',
            'estimated_calories', 'estimated_protein_g',
            'estimated_carbs_g', 'estimated_fat_g',
          ],
        },
      },
    },
    required: ['suggestions'],
  },
};

const SYSTEM_PROMPT = `You are a sports nutritionist. Given a client's remaining macro budget for the day, suggest 3 practical, delicious meal options that fit within the budget. Each suggestion should include a name, brief description, ingredients list with approximate quantities, and estimated macros. Be realistic with portions and calorie estimates.`;

// ── 10 eval prompts ─────────────────────────────────────────────────────────

const EVAL_CASES: MealSuggestInput[] = [
  {
    id: 'balanced_lunch',
    remaining_calories: 600, remaining_protein_g: 35, remaining_carbs_g: 70, remaining_fat_g: 20,
    meal_type: 'lunch',
    scenario: 'Balanced lunch for an office worker',
  },
  {
    id: 'high_protein_deficit',
    remaining_calories: 800, remaining_protein_g: 80, remaining_carbs_g: 60, remaining_fat_g: 25,
    scenario: 'Evening meal, need high protein to hit daily target',
  },
  {
    id: 'low_cal_snack',
    remaining_calories: 200, remaining_protein_g: 15, remaining_carbs_g: 20, remaining_fat_g: 5,
    meal_type: 'snack',
    scenario: 'Light snack to close out the day under budget',
  },
  {
    id: 'vegetarian_dinner',
    remaining_calories: 650, remaining_protein_g: 45, remaining_carbs_g: 60, remaining_fat_g: 20,
    preferences: 'vegetarian',
    meal_type: 'dinner',
    scenario: 'Vegetarian needing to hit protein without meat',
  },
  {
    id: 'breakfast_quick',
    remaining_calories: 400, remaining_protein_g: 25, remaining_carbs_g: 45, remaining_fat_g: 12,
    meal_type: 'breakfast',
    preferences: 'quick prep, under 10 minutes',
    scenario: 'Quick breakfast before work',
  },
  {
    id: 'mediterranean_style',
    remaining_calories: 700, remaining_protein_g: 35, remaining_carbs_g: 75, remaining_fat_g: 28,
    preferences: 'Mediterranean diet, olive oil based',
    scenario: 'Mediterranean diet adherent in Greece',
  },
  {
    id: 'post_workout',
    remaining_calories: 1000, remaining_protein_g: 60, remaining_carbs_g: 120, remaining_fat_g: 30,
    meal_type: 'post-workout',
    scenario: 'Post-workout meal, need carb-heavy recovery',
  },
  {
    id: 'minimal_remaining',
    remaining_calories: 150, remaining_protein_g: 10, remaining_carbs_g: 15, remaining_fat_g: 3,
    scenario: 'Very little budget left, something satisfying but tiny',
  },
  {
    id: 'high_cal_bulk',
    remaining_calories: 1500, remaining_protein_g: 80, remaining_carbs_g: 180, remaining_fat_g: 50,
    scenario: 'Bulking phase, lots of calories remaining',
  },
  {
    id: 'near_zero_carb',
    remaining_calories: 300, remaining_protein_g: 30, remaining_carbs_g: 5, remaining_fat_g: 18,
    preferences: 'very low carb, keto-friendly',
    scenario: 'Near-zero carb budget remaining',
  },
];

// ── Anthropic API caller ────────────────────────────────────────────────────

async function callHaikuWithTool(input: MealSuggestInput): Promise<{
  suggestions: Suggestion[] | null;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  error?: string;
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const macroContext = [
    `Calories: ${input.remaining_calories} kcal`,
    `Protein: ${input.remaining_protein_g}g`,
    `Carbs: ${input.remaining_carbs_g}g`,
    `Fat: ${input.remaining_fat_g}g`,
  ].join(', ');

  const preferencesNote = input.preferences ? ` Dietary preferences: ${input.preferences}.` : '';
  const mealTypeNote = input.meal_type ? ` This is for: ${input.meal_type}.` : '';

  const userMessage = `Remaining macro budget: ${macroContext}.${preferencesNote}${mealTypeNote} Suggest 3 meal options.`;

  const start = Date.now();

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      tools: [MEAL_SUGGEST_TOOL],
      tool_choice: { type: 'tool', name: 'submit_meal_suggestions' },
    }),
  });

  const latencyMs = Date.now() - start;

  if (!res.ok) {
    const errText = await res.text();
    return { suggestions: null, latencyMs, tokensIn: 0, tokensOut: 0, error: `API ${res.status}: ${errText.slice(0, 200)}` };
  }

  const body = await res.json() as {
    content: Array<{ type: string; name?: string; input?: { suggestions?: Suggestion[] } }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const toolUse = body.content.find(c => c.type === 'tool_use' && c.name === 'submit_meal_suggestions');
  if (!toolUse?.input?.suggestions) {
    return { suggestions: null, latencyMs, tokensIn: body.usage.input_tokens, tokensOut: body.usage.output_tokens, error: 'tool_use not found in response' };
  }

  return {
    suggestions: toolUse.input.suggestions,
    latencyMs,
    tokensIn: body.usage.input_tokens,
    tokensOut: body.usage.output_tokens,
  };
}

// ── Scorer ──────────────────────────────────────────────────────────────────

function scoreCase(input: MealSuggestInput, suggestions: Suggestion[] | null, latencyMs: number, error?: string): CaseScore {
  const failures: string[] = [];

  if (!suggestions || error) {
    return {
      schemaValid: false, suggestionCount: false, macroFit: false,
      diversity: false, realism: false, points: 0,
      failures: [error || 'no suggestions returned'],
      latencyMs,
    };
  }

  // 1. Schema validity — all required fields present and typed correctly
  let schemaValid = true;
  for (const [i, s] of suggestions.entries()) {
    if (typeof s.name !== 'string' || s.name.length < 2) {
      failures.push(`[${i}].name invalid`); schemaValid = false;
    }
    if (typeof s.estimated_calories !== 'number') {
      failures.push(`[${i}].estimated_calories not a number`); schemaValid = false;
    }
    if (typeof s.estimated_protein_g !== 'number') {
      failures.push(`[${i}].estimated_protein_g not a number`); schemaValid = false;
    }
    if (typeof s.estimated_carbs_g !== 'number') {
      failures.push(`[${i}].estimated_carbs_g not a number`); schemaValid = false;
    }
    if (typeof s.estimated_fat_g !== 'number') {
      failures.push(`[${i}].estimated_fat_g not a number`); schemaValid = false;
    }
    if (!Array.isArray(s.ingredients) || s.ingredients.length < 1) {
      failures.push(`[${i}].ingredients empty or not array`); schemaValid = false;
    }
  }

  // 2. Suggestion count — exactly 3
  const suggestionCount = suggestions.length === 3;
  if (!suggestionCount) {
    failures.push(`suggestion_count=${suggestions.length}, expected 3`);
  }

  // 3. Macro fit — each suggestion's calories ≤ remaining * 1.25
  let macroFit = true;
  for (const [i, s] of suggestions.entries()) {
    if (typeof s.estimated_calories === 'number' && s.estimated_calories > input.remaining_calories * 1.25) {
      failures.push(`[${i}] ${s.estimated_calories} kcal exceeds ${input.remaining_calories} budget by >25%`);
      macroFit = false;
    }
  }

  // 4. Diversity — 3 unique meal names
  let diversity = true;
  if (suggestions.length >= 3) {
    const uniqueNames = new Set(suggestions.map(s => (s.name || '').toLowerCase().trim()));
    if (uniqueNames.size < 3) {
      failures.push(`only ${uniqueNames.size} unique meal names`);
      diversity = false;
    }
  } else {
    diversity = false;
  }

  // 5. Realism — no zero/negative calorie values, no absurd portions
  let realism = true;
  for (const [i, s] of suggestions.entries()) {
    if (typeof s.estimated_calories === 'number' && s.estimated_calories <= 0) {
      failures.push(`[${i}] zero/negative calories`); realism = false;
    }
    if (typeof s.estimated_protein_g === 'number' && s.estimated_protein_g < 0) {
      failures.push(`[${i}] negative protein`); realism = false;
    }
    if (typeof s.estimated_carbs_g === 'number' && s.estimated_carbs_g < 0) {
      failures.push(`[${i}] negative carbs`); realism = false;
    }
    if (typeof s.estimated_fat_g === 'number' && s.estimated_fat_g < 0) {
      failures.push(`[${i}] negative fat`); realism = false;
    }
    // Absurd: single meal over 3000 kcal
    if (typeof s.estimated_calories === 'number' && s.estimated_calories > 3000) {
      failures.push(`[${i}] absurd calories: ${s.estimated_calories}`); realism = false;
    }
  }

  const points = [schemaValid, suggestionCount, macroFit, diversity, realism]
    .filter(Boolean).length;

  return {
    schemaValid, suggestionCount, macroFit, diversity, realism,
    points, failures, latencyMs, suggestions,
  };
}

// ── Formatting ──────────────────────────────────────────────────────────────

function bold(s: string): string { return `\x1b[1m${s}\x1b[0m`; }
function green(s: string): string { return `\x1b[32m${s}\x1b[0m`; }
function red(s: string): string { return `\x1b[31m${s}\x1b[0m`; }
function dim(s: string): string { return `\x1b[2m${s}\x1b[0m`; }

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold('\n🍽️  Trophē — meal_suggest eval (Haiku 4.5 + tool_choice)'));
  console.log(dim(`   Model: ${MODEL}`));
  console.log(dim(`   ${EVAL_CASES.length} prompts × 5 criteria = ${EVAL_CASES.length * 5} max points`));
  console.log(dim(`   Pass threshold: ≥${EVAL_CASES.length * 5 * 0.8}/50 (80%)`));
  console.log(dim(`   ${new Date().toISOString()}\n`));

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('❌ ANTHROPIC_API_KEY not set');
    process.exit(1);
  }

  const results: { id: string; scenario: string; score: CaseScore }[] = [];
  let totalLatency = 0;
  let totalTokensIn = 0;
  let totalTokensOut = 0;
  let totalCostUsd = 0;

  for (const input of EVAL_CASES) {
    process.stdout.write(`  ${input.id.padEnd(28)} `);

    try {
      const { suggestions, latencyMs, tokensIn, tokensOut, error } = await callHaikuWithTool(input);
      const score = scoreCase(input, suggestions, latencyMs, error);

      totalLatency += latencyMs;
      totalTokensIn += tokensIn;
      totalTokensOut += tokensOut;

      // Haiku 4.5: $1.00/M in, $5.00/M out
      const callCost = (tokensIn * 1.0 / 1_000_000) + (tokensOut * 5.0 / 1_000_000);
      totalCostUsd += callCost;

      const dims = [
        score.schemaValid ? 'schema' : red('schema'),
        score.suggestionCount ? 'count' : red('count'),
        score.macroFit ? 'macro' : red('macro'),
        score.diversity ? 'diverse' : red('diverse'),
        score.realism ? 'real' : red('real'),
      ].join(' ');

      const sym = score.points === 5 ? green('✓') : score.points >= 3 ? '◐' : red('✗');
      console.log(`${sym} ${score.points}/5 ${dims} ${dim(`(${latencyMs}ms $${callCost.toFixed(4)})`)}`);

      if (score.failures.length > 0) {
        for (const f of score.failures) {
          console.log(`      ${red('↳')} ${f}`);
        }
      }

      results.push({ id: input.id, scenario: input.scenario, score });
    } catch (err) {
      const errorScore: CaseScore = {
        schemaValid: false, suggestionCount: false, macroFit: false,
        diversity: false, realism: false, points: 0,
        failures: [`exception: ${err instanceof Error ? err.message : String(err)}`],
        latencyMs: 0,
      };
      console.log(red(`✗ 0/5 ERROR: ${err instanceof Error ? err.message : String(err)}`));
      results.push({ id: input.id, scenario: input.scenario, score: errorScore });
    }

    // Small delay between calls
    await new Promise(r => setTimeout(r, 300));
  }

  // ── Summary ─────────────────────────────────────────────────────────────

  const totalPoints = results.reduce((s, r) => s + r.score.points, 0);
  const maxPoints = EVAL_CASES.length * 5;
  const pct = (totalPoints / maxPoints) * 100;
  const passed = pct >= 80;

  console.log(bold('\n══ SUMMARY ' + '═'.repeat(68)));

  const criteriaNames = ['schemaValid', 'suggestionCount', 'macroFit', 'diversity', 'realism'] as const;
  for (const criterion of criteriaNames) {
    const count = results.filter(r => r.score[criterion]).length;
    const rate = ((count / EVAL_CASES.length) * 100).toFixed(0);
    const color = count === EVAL_CASES.length ? green : count >= EVAL_CASES.length * 0.8 ? (s: string) => s : red;
    console.log(`  ${criterion.padEnd(22)} ${color(`${rate}%`)} (${count}/${EVAL_CASES.length})`);
  }

  const avgLatency = Math.round(totalLatency / EVAL_CASES.length);
  const avgCost = totalCostUsd / EVAL_CASES.length;

  console.log();
  console.log(`  Total score:        ${pct >= 80 ? green(`${totalPoints}/${maxPoints}`) : red(`${totalPoints}/${maxPoints}`)} (${pct.toFixed(1)}%)`);
  console.log(`  Avg latency:        ${avgLatency}ms`);
  console.log(`  Total cost:         $${totalCostUsd.toFixed(4)}`);
  console.log(`  Avg cost/call:      $${avgCost.toFixed(5)}`);
  console.log(`  Total tokens:       ${totalTokensIn} in / ${totalTokensOut} out`);

  console.log(bold('\n── DECISION '));
  if (passed) {
    console.log(green(`  ✅ PASS: ${totalPoints}/${maxPoints} (${pct.toFixed(1)}%) ≥ 80% threshold`));
    console.log(`     Proceed with policies.ts migration to ${MODEL}`);
  } else {
    console.log(red(`  ❌ FAIL: ${totalPoints}/${maxPoints} (${pct.toFixed(1)}%) < 80% threshold`));
    console.log(`     Do NOT ship. Investigate failures above.`);
  }

  // ── Write report ──────────────────────────────────────────────────────

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = join(REPORT_DIR, `meal-suggest-eval-${timestamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify({
      when: new Date().toISOString(),
      model: MODEL,
      totalCases: EVAL_CASES.length,
      totalPoints,
      maxPoints,
      pct,
      passed,
      avgLatencyMs: avgLatency,
      totalCostUsd,
      avgCostPerCall: avgCost,
      totalTokensIn,
      totalTokensOut,
      results,
    }, null, 2),
  );
  console.log(dim(`\n  Report → ${reportPath}\n`));

  process.exit(passed ? 0 : 1);
}

main().catch((err) => {
  console.error('Eval runner failed:', err);
  process.exit(1);
});
