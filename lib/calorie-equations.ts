/**
 * Deterministic calorie / macro baseline (Daily Nutrafit — Michael: "if a client
 * inputs body-comp + height it should suggest calories, tweakable by me").
 *
 * Pure functions, no I/O — easy to unit-test and for a coach to reason about.
 * Mifflin-St Jeor is the default BMR estimator; Katch-McArdle is used when body
 * fat % is known (more accurate for lean/athletic clients). These are estimates
 * (±~10% person to person) — the coach reviews and overrides.
 */

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
};

/** Mifflin-St Jeor BMR (kcal/day). */
export function mifflinStJeor(sex: Sex, ageYears: number, weightKg: number, heightCm: number): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
  return Math.round(base + (sex === 'male' ? 5 : -161));
}

/** Katch-McArdle BMR (kcal/day) — uses lean mass, best when body fat % is known. */
export function katchMcArdle(weightKg: number, bodyFatPct: number): number {
  const lean = weightKg * (1 - bodyFatPct / 100);
  return Math.round(370 + 21.6 * lean);
}

export function tdeeFromBmr(bmr: number, activity: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_FACTOR[activity]);
}

/** Goal adjustment: ~15% deficit/surplus off maintenance. */
export function targetCalories(tdee: number, goal: Goal): number {
  if (goal === 'lose') return Math.round(tdee * 0.85);
  if (goal === 'gain') return Math.round(tdee * 1.1);
  return tdee;
}

export interface MacroSplit { protein_g: number; carbs_g: number; fat_g: number; calories: number; }

/**
 * Split a calorie target into macros. Protein anchored to body weight
 * (2.0 g/kg default — Michael can raise for athletes/older clients), fat at 25%
 * of calories, carbs fill the remainder. Calories are recomputed from the macros
 * (Atwater 4/4/9) so the split is internally consistent.
 */
export function macroSplit(calories: number, weightKg: number, proteinPerKg = 2.0): MacroSplit {
  const protein_g = Math.round(weightKg * proteinPerKg);
  const fat_g = Math.round((calories * 0.25) / 9);
  const remaining = calories - (protein_g * 4 + fat_g * 9);
  const carbs_g = Math.max(0, Math.round(remaining / 4));
  return { protein_g, carbs_g, fat_g, calories: protein_g * 4 + carbs_g * 4 + fat_g * 9 };
}

export interface BaselineInput {
  sex: Sex; ageYears: number; weightKg: number; heightCm: number;
  bodyFatPct?: number | null; activity?: ActivityLevel; goal?: Goal; proteinPerKg?: number;
}
export interface BaselineResult {
  bmr: number; tdee: number; formula: 'mifflin_st_jeor' | 'katch_mccardle';
  target: MacroSplit;
}

/** End-to-end: body comp → BMR → TDEE → goal-adjusted calorie target → macro split. */
export function computeBaseline(i: BaselineInput): BaselineResult {
  const useKatch = typeof i.bodyFatPct === 'number' && i.bodyFatPct > 0;
  const bmr = useKatch ? katchMcArdle(i.weightKg, i.bodyFatPct as number)
                       : mifflinStJeor(i.sex, i.ageYears, i.weightKg, i.heightCm);
  const tdee = tdeeFromBmr(bmr, i.activity ?? 'moderate');
  const cals = targetCalories(tdee, i.goal ?? 'maintain');
  return {
    bmr, tdee,
    formula: useKatch ? 'katch_mccardle' : 'mifflin_st_jeor',
    target: macroSplit(cals, i.weightKg, i.proteinPerKg ?? 2.0),
  };
}
