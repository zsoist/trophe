const EMPTY_BAR = 'var(--surface-2)';
const NEUTRAL_BAR = 'var(--data-neutral)';
const TARGET_BAR = 'var(--data-calories)';
const OVER_TARGET_BAR = 'var(--status-danger-fg)';

function hasCalorieTarget(targetCalories: number): boolean {
  return Number.isFinite(targetCalories) && targetCalories > 0;
}

export function weeklyCalorieTargetY(
  targetCalories: number,
  maxCalories: number,
  chartHeight: number,
): number | null {
  if (!hasCalorieTarget(targetCalories)) return null;
  if (!Number.isFinite(maxCalories) || maxCalories <= 0) return null;
  return chartHeight - (targetCalories / maxCalories) * chartHeight;
}

export function weeklyCalorieBarColor(
  calories: number,
  targetCalories: number,
): string {
  if (calories === 0) return EMPTY_BAR;
  if (!hasCalorieTarget(targetCalories)) return NEUTRAL_BAR;

  const ratio = calories / targetCalories;
  if (ratio >= 0.9 && ratio <= 1.1) return TARGET_BAR;
  if (ratio < 0.9) return NEUTRAL_BAR;
  return OVER_TARGET_BAR;
}
