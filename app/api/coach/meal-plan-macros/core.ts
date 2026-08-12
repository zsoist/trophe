export const MAX_MEAL_PLAN_UNIQUE_DESCRIPTIONS = 35;
export const MAX_MEAL_PLAN_PROVIDER_ATTEMPTS = 48;
export const MEAL_PLAN_ROUTE_BUDGET_MS = 55_000;
export const MEAL_PLAN_PARSE_RESERVE_MS = 50_000;

export interface MealPlanMacroSum {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface MealPlanMacroResult {
  ok: boolean;
  sum: MealPlanMacroSum;
}

interface MealPlanCell {
  day_of_week: number;
  description: string;
}

interface MealPlanBudgetOptions {
  startedAt?: number;
  now?: () => number;
}

export function createMealPlanMacroBudget(options: MealPlanBudgetOptions = {}) {
  const now = options.now ?? (() => performance.now());
  const startedAt = options.startedAt ?? now();
  const deadlineAt = startedAt + MEAL_PLAN_ROUTE_BUDGET_MS;
  let attempts = 0;

  return {
    canStartParse(): boolean {
      return deadlineAt - now() >= MEAL_PLAN_PARSE_RESERVE_MS;
    },
    beforeTransportAttempt(endpoint: string): void {
      void endpoint;
      if (now() > deadlineAt) {
        throw new Error('Meal-plan macro route deadline exhausted');
      }
      if (attempts >= MAX_MEAL_PLAN_PROVIDER_ATTEMPTS) {
        throw new Error('Meal-plan macro provider attempt budget exhausted');
      }
      attempts += 1;
    },
    providerAttempts(): number {
      return attempts;
    },
  };
}

export function buildMealPlanDayTotals(
  cells: MealPlanCell[],
  parsedByDescription: ReadonlyMap<string, MealPlanMacroResult>,
) {
  const totals = new Map<number, MealPlanMacroSum & { slots: number; complete: boolean }>();

  for (const cell of cells) {
    const result = parsedByDescription.get(cell.description.trim());
    const current = totals.get(cell.day_of_week) ?? {
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      slots: 0,
      complete: true,
    };
    const sum = result?.sum;

    totals.set(cell.day_of_week, {
      kcal: current.kcal + (sum?.kcal ?? 0),
      protein: current.protein + (sum?.protein ?? 0),
      carbs: current.carbs + (sum?.carbs ?? 0),
      fat: current.fat + (sum?.fat ?? 0),
      slots: current.slots + 1,
      complete: current.complete && result?.ok === true,
    });
  }

  return Array.from(totals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, total]) => ({
      day,
      slots: total.slots,
      kcal: Math.round(total.kcal),
      protein: Math.round(total.protein),
      carbs: Math.round(total.carbs),
      fat: Math.round(total.fat),
      complete: total.complete,
    }));
}
