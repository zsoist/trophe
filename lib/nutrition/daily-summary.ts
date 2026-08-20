export type SugarCompleteness = 'complete' | 'partial' | 'unknown';

export interface SugarSummary {
  totalGrams: number | null;
  completeness: SugarCompleteness;
  missingEntries: number;
}

export interface DailyNutritionEntry {
  food_name: string;
  protein_g: number | null;
  fiber_g: number | null;
  sugar_g: number | null;
}

export interface DailyNutritionNoteInput {
  entries: DailyNutritionEntry[];
  targetProteinG: number;
  waterMl: number;
  hour: number;
}

export interface DailyNutritionNote {
  tone: 'neutral' | 'info' | 'positive' | 'attention';
  icon: 'i-leaf' | 'i-dumbbell' | 'i-drop' | 'i-check' | 'i-zap';
  text: string;
}

export function summarizeSugar(entries: Array<{ sugar_g: number | null }>): SugarSummary {
  if (entries.length === 0) {
    return { totalGrams: null, completeness: 'unknown', missingEntries: 0 };
  }

  const known = entries.filter((entry) => entry.sugar_g !== null);
  const missingEntries = entries.length - known.length;
  if (known.length === 0) {
    return { totalGrams: null, completeness: 'unknown', missingEntries };
  }

  const totalGrams = known.reduce((sum, entry) => sum + (entry.sugar_g ?? 0), 0);
  return {
    totalGrams: Math.round(totalGrams * 10) / 10,
    completeness: missingEntries > 0 ? 'partial' : 'complete',
    missingEntries,
  };
}

export function buildDailyNutritionNote({
  entries,
  targetProteinG,
  waterMl,
  hour,
}: DailyNutritionNoteInput): DailyNutritionNote {
  if (entries.length === 0) {
    return {
      tone: 'neutral',
      icon: 'i-leaf',
      text: 'Log your first meal to start today’s nutrition feedback.',
    };
  }

  const sugar = summarizeSugar(entries);
  if (sugar.completeness !== 'complete') {
    const noun = sugar.missingEntries === 1 ? 'entry is' : 'entries are';
    return {
      tone: 'info',
      icon: 'i-zap',
      text: `Total sugar is incomplete because ${sugar.missingEntries} logged ${noun} missing that value.`,
    };
  }

  const totalProtein = entries.reduce((sum, entry) => sum + (entry.protein_g ?? 0), 0);
  const totalFiber = entries.reduce((sum, entry) => sum + (entry.fiber_g ?? 0), 0);

  if (entries.length >= 2 && targetProteinG > 0 && totalProtein < targetProteinG * 0.3) {
    return {
      tone: 'attention',
      icon: 'i-dumbbell',
      text: `${Math.max(0, Math.round(targetProteinG - totalProtein))} g protein remains today. Make the next meal protein-forward.`,
    };
  }

  if (entries.length >= 3 && totalFiber < 10) {
    return {
      tone: 'attention',
      icon: 'i-leaf',
      text: `Fiber is ${Math.round(totalFiber)} g so far. Add beans, vegetables, fruit, or whole grains next.`,
    };
  }

  if (hour >= 14 && waterMl < 500) {
    return {
      tone: 'info',
      icon: 'i-drop',
      text: 'Hydration is light so far. A glass of water now is an easy win.',
    };
  }

  if (targetProteinG > 0 && totalProtein >= targetProteinG) {
    return {
      tone: 'positive',
      icon: 'i-check',
      text: `Great protein intake. You reached today’s ${Math.round(targetProteinG)} g protein target.`,
    };
  }

  const uniqueFoods = new Set(entries.map((entry) => entry.food_name.trim().toLowerCase()).filter(Boolean));
  if (uniqueFoods.size >= 6) {
    return {
      tone: 'positive',
      icon: 'i-check',
      text: `Good variety today: ${uniqueFoods.size} different foods logged.`,
    };
  }

  return {
    tone: 'neutral',
    icon: 'i-zap',
    text: 'Good start. Keep logging so today’s feedback gets more useful.',
  };
}
