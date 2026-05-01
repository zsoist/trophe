// ═══════════════════════════════════════════════
// τροφή (Trophē) — Evidence-Based Nutrition Engine
// All formulas sourced from ISSN, ACSM, IOC position stands
// ═══════════════════════════════════════════════

import type { Sex, ActivityLevel, Goal, MacroTargets } from './types';

// ─── Activity Multipliers (Harris-Benedict / Mifflin-St Jeor) ───
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

// ─── Goal-based calorie adjustments ───
const GOAL_CALORIE_ADJUSTMENTS: Record<Goal, (tdee: number) => number> = {
  fat_loss: (tdee) => Math.round(tdee * 0.80),      // 20% deficit
  muscle_gain: (tdee) => Math.round(tdee + 300),     // +300 kcal surplus
  maintenance: (tdee) => Math.round(tdee),
  recomp: (tdee) => Math.round(tdee * 0.95),         // 5% deficit
  endurance: (tdee) => Math.round(tdee * 1.15),      // +15%
  health: (tdee) => Math.round(tdee),                // no adjustment
};

// ─── Macro targets by goal (g/kg/day) ───
// Sources: ISSN Position Stand, ACSM Guidelines
const MACRO_RATIOS: Record<Goal, { protein: number; carbs: [number, number]; fat: number }> = {
  fat_loss:     { protein: 2.2, carbs: [2, 4],   fat: 0.8 },
  muscle_gain:  { protein: 1.8, carbs: [4, 6],   fat: 1.0 },
  maintenance:  { protein: 1.6, carbs: [3, 5],   fat: 1.0 },
  recomp:       { protein: 2.0, carbs: [3, 4],   fat: 0.9 },
  endurance:    { protein: 1.4, carbs: [6, 10],  fat: 1.0 },
  health:       { protein: 1.2, carbs: [3, 5],   fat: 1.0 },
};

/**
 * Calculate Basal Metabolic Rate using Mifflin-St Jeor equation.
 * Most accurate for general population (validated against indirect calorimetry).
 */
export function calculateBMR(weight_kg: number, height_cm: number, age: number, sex: Sex): number {
  const base = (10 * weight_kg) + (6.25 * height_cm) - (5 * age);
  return Math.round(sex === 'male' ? base + 5 : base - 161);
}

/**
 * Calculate Total Daily Energy Expenditure.
 * TDEE = BMR × activity multiplier
 */
export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

/**
 * Calculate goal-adjusted calorie target.
 */
export function calculateTargetCalories(tdee: number, goal: Goal): number {
  return GOAL_CALORIE_ADJUSTMENTS[goal](tdee);
}

/**
 * Calculate complete macro targets based on body stats and goal.
 * Returns calories, protein, carbs, fat, fiber, and water targets.
 */
export function calculateMacroTargets(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: Sex,
  activityLevel: ActivityLevel,
  goal: Goal,
): MacroTargets {
  const bmr = calculateBMR(weight_kg, height_cm, age, sex);
  const tdee = calculateTDEE(bmr, activityLevel);
  const targetCalories = calculateTargetCalories(tdee, goal);

  const ratios = MACRO_RATIOS[goal];

  // Protein: fixed g/kg target
  const protein_g = Math.round(ratios.protein * weight_kg);
  const proteinCalories = protein_g * 4;

  // Fat: fixed g/kg target
  const fat_g = Math.round(ratios.fat * weight_kg);
  const fatCalories = fat_g * 9;

  // Carbs: fill remaining calories
  const remainingCalories = Math.max(0, targetCalories - proteinCalories - fatCalories);
  const carbs_g = Math.round(remainingCalories / 4);

  // Fiber: 14g per 1000 kcal (IOM recommendation)
  const fiber_g = Math.round((targetCalories / 1000) * 14);

  // Sugar: recommended max is ~10% of calories (WHO), track as target ceiling
  // We use 25g (WHO limit) as default daily target ceiling
  const sugar_g = 25;

  // Hydration: 35ml/kg body weight base
  const water_ml = Math.round(35 * weight_kg);

  return {
    calories: targetCalories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sugar_g,
    water_ml,
  };
}

/**
 * Calculate all nutrition values from body stats.
 * Returns BMR, TDEE, and complete macro targets.
 */
export function calculateFullProfile(
  weight_kg: number,
  height_cm: number,
  age: number,
  sex: Sex,
  activityLevel: ActivityLevel,
  goal: Goal,
) {
  const bmr = calculateBMR(weight_kg, height_cm, age, sex);
  const tdee = calculateTDEE(bmr, activityLevel);
  const targets = calculateMacroTargets(weight_kg, height_cm, age, sex, activityLevel, goal);

  return { bmr, tdee, ...targets };
}

/**
 * Calculate protein per meal for optimal muscle protein synthesis.
 * Aim for ≥3g leucine per meal (~25-35g protein from quality sources).
 */
export function proteinPerMeal(totalProtein_g: number, mealsPerDay: number = 4): number {
  return Math.round(totalProtein_g / mealsPerDay);
}

/**
 * Format macro as percentage of total calories.
 */
export function macroPercentage(grams: number, caloriesPerGram: number, totalCalories: number): number {
  return Math.round((grams * caloriesPerGram / totalCalories) * 100);
}

/**
 * Estimate daily caloric burn from steps.
 * Rough estimate: ~0.04 kcal per step per kg of body weight.
 */
export function caloriesFromSteps(steps: number, weight_kg: number): number {
  return Math.round(steps * 0.04 * (weight_kg / 70));
}

/**
 * Calculate remaining macros for the day.
 */
export function remainingMacros(
  targets: MacroTargets,
  consumed: { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g?: number; water_ml: number },
): MacroTargets {
  return {
    calories: Math.max(0, targets.calories - consumed.calories),
    protein_g: Math.max(0, targets.protein_g - consumed.protein_g),
    carbs_g: Math.max(0, targets.carbs_g - consumed.carbs_g),
    fat_g: Math.max(0, targets.fat_g - consumed.fat_g),
    fiber_g: Math.max(0, targets.fiber_g - consumed.fiber_g),
    sugar_g: Math.max(0, targets.sugar_g - (consumed.sugar_g ?? 0)),
    water_ml: Math.max(0, targets.water_ml - consumed.water_ml),
  };
}

// ─── Activity level descriptions (for UI) ───
export const ACTIVITY_DESCRIPTIONS: Record<ActivityLevel, { en: string; es: string; el: string }> = {
  sedentary:   { en: 'Little or no exercise, desk job',        es: 'Poco o nada de ejercicio, trabajo de oficina',     el: 'Λίγη ή καθόλου άσκηση, γραφείο' },
  light:       { en: 'Light exercise 1-3 days/week',           es: 'Ejercicio ligero 1-3 días/semana',                 el: 'Ελαφριά άσκηση 1-3 ημέρες/εβδομάδα' },
  moderate:    { en: 'Moderate exercise 3-5 days/week',        es: 'Ejercicio moderado 3-5 días/semana',               el: 'Μέτρια άσκηση 3-5 ημέρες/εβδομάδα' },
  active:      { en: 'Hard exercise 6-7 days/week',            es: 'Ejercicio intenso 6-7 días/semana',                el: 'Έντονη άσκηση 6-7 ημέρες/εβδομάδα' },
  very_active: { en: 'Very hard exercise + physical job',      es: 'Ejercicio muy intenso + trabajo físico',           el: 'Πολύ έντονη άσκηση + σωματική εργασία' },
};

// ─── Goal descriptions (for UI) ───
export const GOAL_DESCRIPTIONS: Record<Goal, { en: string; es: string; el: string; emoji: string }> = {
  fat_loss:     { en: 'Lose fat while preserving muscle',      es: 'Perder grasa conservando músculo',                el: 'Απώλεια λίπους διατηρώντας μυϊκή μάζα',      emoji: '🔥' },
  muscle_gain:  { en: 'Build muscle with minimal fat gain',    es: 'Ganar músculo con mínima grasa',                  el: 'Αύξηση μυϊκής μάζας με ελάχιστο λίπος',      emoji: '💪' },
  maintenance:  { en: 'Maintain current weight & composition', es: 'Mantener peso y composición actual',              el: 'Διατήρηση τρέχοντος βάρους',                   emoji: '⚖️' },
  recomp:       { en: 'Lose fat and gain muscle simultaneously', es: 'Perder grasa y ganar músculo simultáneamente',  el: 'Ταυτόχρονη απώλεια λίπους & μυϊκή αύξηση',   emoji: '🔄' },
  endurance:    { en: 'Fuel for endurance training & races',   es: 'Alimentar entrenamiento de resistencia',           el: 'Ενέργεια για αντοχή & αγώνες',                emoji: '🏃' },
  health:       { en: 'General health & wellbeing',            es: 'Salud general y bienestar',                        el: 'Γενική υγεία & ευεξία',                        emoji: '🌿' },
};
