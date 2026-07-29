import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MEAL_PLAN_PROVIDER_ATTEMPTS,
  MAX_MEAL_PLAN_UNIQUE_DESCRIPTIONS,
  MEAL_PLAN_PARSE_RESERVE_MS,
  MEAL_PLAN_ROUTE_BUDGET_MS,
  buildMealPlanDayTotals,
  createMealPlanMacroBudget,
} from '../../app/api/coach/meal-plan-macros/core';

describe('coach meal-plan macro safety core', () => {
  it('matches the database cardinality and leaves parser headroom below the route cap', () => {
    expect(MAX_MEAL_PLAN_UNIQUE_DESCRIPTIONS).toBe(35);
    expect(MEAL_PLAN_ROUTE_BUDGET_MS).toBe(55_000);
    expect(MEAL_PLAN_PARSE_RESERVE_MS).toBe(50_000);
  });

  it('starts no parser after the full parser reserve is unavailable', () => {
    let now = 1_000;
    const budget = createMealPlanMacroBudget({ startedAt: now, now: () => now });

    now = 5_999;
    expect(budget.canStartParse()).toBe(true);
    now = 6_001;
    expect(budget.canStartParse()).toBe(false);
  });

  it('hard-stops provider transport fan-out across concurrent parsers', () => {
    const budget = createMealPlanMacroBudget({ startedAt: 0, now: () => 1 });

    for (let i = 0; i < MAX_MEAL_PLAN_PROVIDER_ATTEMPTS; i++) {
      expect(() => budget.beforeTransportAttempt('mock://provider')).not.toThrow();
    }
    expect(budget.providerAttempts()).toBe(MAX_MEAL_PLAN_PROVIDER_ATTEMPTS);
    expect(() => budget.beforeTransportAttempt('mock://provider')).toThrow(/provider attempt budget/i);
  });

  it('marks a day incomplete instead of presenting a missing parse as zero nutrition', () => {
    const days = buildMealPlanDayTotals(
      [
        { day_of_week: 0, description: 'eggs' },
        { day_of_week: 0, description: 'rice' },
        { day_of_week: 1, description: 'eggs' },
      ],
      new Map([
        ['eggs', { ok: true, sum: { kcal: 140, protein: 12, carbs: 1, fat: 10 } }],
        ['rice', { ok: false, sum: { kcal: 0, protein: 0, carbs: 0, fat: 0 } }],
      ]),
    );

    expect(days).toEqual([
      { day: 0, slots: 2, kcal: 140, protein: 12, carbs: 1, fat: 10, complete: false },
      { day: 1, slots: 1, kcal: 140, protein: 12, carbs: 1, fat: 10, complete: true },
    ]);
  });

  it('rejects transports after the route deadline before incrementing the counter', () => {
    const now = vi.fn(() => 55_001);
    const budget = createMealPlanMacroBudget({ startedAt: 0, now });

    expect(() => budget.beforeTransportAttempt('mock://provider')).toThrow(/route deadline/i);
    expect(budget.providerAttempts()).toBe(0);
  });

  it('wires the shared budget into the route and exposes incomplete totals honestly', () => {
    const route = readFileSync(
      join(process.cwd(), 'app/api/coach/meal-plan-macros/route.ts'),
      'utf8',
    );
    const modal = readFileSync(
      join(process.cwd(), 'components/coach/MacroRollupModal.tsx'),
      'utf8',
    );

    expect(route).toContain('createMealPlanMacroBudget()');
    expect(route).toContain('if (!budget.canStartParse())');
    expect(route).toContain('beforeTransportAttempt: budget.beforeTransportAttempt');
    expect(route).toContain('buildMealPlanDayTotals(cells, parsedByDesc)');
    expect(route).toContain('consumeRateLimit(`meal-macros:${userId}`, 5, 600)');
    expect(modal).toContain('complete: boolean');
    expect(modal).toContain('Some meal descriptions could not be counted');
    expect(modal).toContain("d.complete ? d.kcal : '—'");
  });
});
