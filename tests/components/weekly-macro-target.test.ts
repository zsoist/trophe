import { describe, expect, it } from 'vitest';
import {
  weeklyCalorieBarColor,
  weeklyCalorieTargetY,
} from '../../lib/nutrition/weekly-calorie-visuals';

describe('weekly calorie target visuals', () => {
  it('treats zero or invalid targets as unset instead of dividing by them', () => {
    expect(weeklyCalorieTargetY(0, 2_000, 120)).toBeNull();
    expect(weeklyCalorieTargetY(Number.NaN, 2_000, 120)).toBeNull();
    expect(weeklyCalorieBarColor(1_800, 0)).toBe('var(--data-neutral)');
    expect(weeklyCalorieBarColor(1_800, Number.NaN)).toBe('var(--data-neutral)');
  });

  it('preserves empty, under, on-target, and over-target states for a real target', () => {
    expect(weeklyCalorieBarColor(0, 2_000)).toBe('var(--surface-2)');
    expect(weeklyCalorieBarColor(1_700, 2_000)).toBe('var(--data-neutral)');
    expect(weeklyCalorieBarColor(2_000, 2_000)).toBe('var(--data-calories)');
    expect(weeklyCalorieBarColor(2_300, 2_000)).toBe('var(--status-danger-fg)');
    expect(weeklyCalorieTargetY(2_000, 2_200, 120)).toBeCloseTo(10.91, 1);
  });
});
