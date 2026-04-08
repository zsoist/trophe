// F10: Meal Quality Score — rates each meal 0-100
// Algorithm: 40% macro balance + 30% protein adequacy + 30% variety

import type { FoodLogEntry } from './types';

export interface MealScore {
  score: number;
  label: string;
  color: string;
  breakdown: {
    balance: number;  // 0-100
    protein: number;  // 0-100
    variety: number;  // 0-100
  };
}

// Target protein per meal for a person eating ~2000 kcal/day with 1.6g/kg at 75kg
const TARGET_PROTEIN_PER_MEAL = 25; // grams

export function calculateMealScore(entries: FoodLogEntry[]): MealScore | null {
  if (entries.length === 0) return null;

  const totalCal = entries.reduce((s, e) => s + (e.calories ?? 0), 0);
  const totalProtein = entries.reduce((s, e) => s + (e.protein_g ?? 0), 0);
  const totalCarbs = entries.reduce((s, e) => s + (e.carbs_g ?? 0), 0);
  const totalFat = entries.reduce((s, e) => s + (e.fat_g ?? 0), 0);

  if (totalCal === 0) return null;

  // 1. Macro balance score (40%)
  // Ideal: 25-35% protein, 35-55% carbs, 20-35% fat
  const proteinPct = (totalProtein * 4 / totalCal) * 100;
  const carbsPct = (totalCarbs * 4 / totalCal) * 100;
  const fatPct = (totalFat * 9 / totalCal) * 100;

  const proteinBalance = proteinPct >= 20 && proteinPct <= 40 ? 100
    : proteinPct >= 15 ? 70
    : proteinPct >= 10 ? 40
    : 20;

  const carbBalance = carbsPct >= 30 && carbsPct <= 60 ? 100
    : carbsPct >= 20 ? 70
    : 40;

  const fatBalance = fatPct >= 15 && fatPct <= 40 ? 100
    : fatPct >= 10 ? 70
    : 40;

  const balanceScore = (proteinBalance + carbBalance + fatBalance) / 3;

  // 2. Protein adequacy (30%)
  const proteinScore = Math.min(100, (totalProtein / TARGET_PROTEIN_PER_MEAL) * 100);

  // 3. Variety score (30%)
  const uniqueFoods = new Set(entries.map(e => e.food_name)).size;
  const varietyScore = uniqueFoods >= 4 ? 100
    : uniqueFoods === 3 ? 80
    : uniqueFoods === 2 ? 60
    : 40;

  const score = Math.round(balanceScore * 0.4 + proteinScore * 0.3 + varietyScore * 0.3);

  return {
    score,
    label: score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D',
    color: score >= 80 ? 'text-green-400'
      : score >= 60 ? 'gold-text'
      : score >= 40 ? 'text-orange-400'
      : 'text-red-400',
    breakdown: {
      balance: Math.round(balanceScore),
      protein: Math.round(proteinScore),
      variety: Math.round(varietyScore),
    },
  };
}

// Get score badge color for background
export function getScoreBgColor(score: number): string {
  if (score >= 80) return 'bg-green-500/15 border-green-500/25';
  if (score >= 60) return 'bg-[#D4A853]/15 border-[#D4A853]/25';
  if (score >= 40) return 'bg-orange-500/15 border-orange-500/25';
  return 'bg-red-500/15 border-red-500/25';
}
