import { describe, expect, it } from 'vitest';
import { buildWarmupRamp, calculatePlateLoad, nearestPlateLoad } from '@/lib/workout/plates';

describe('plate loading', () => {
  it('returns an exact mirrored per-side load', () => {
    expect(calculatePlateLoad({ total: 100, bar: 20, plates: [20, 15, 10, 5, 2.5, 1.25] })).toEqual({
      exact: true,
      perSide: [20, 20],
      achievedTotal: 100,
    });
  });

  it('returns the closest safe mirrored load when an exact total is unavailable', () => {
    expect(nearestPlateLoad({ total: 101, bar: 20, plates: [20, 10, 5] })).toEqual({
      exact: false,
      perSide: [20, 20],
      achievedTotal: 100,
    });
  });

  it('builds a percentage-based warm-up ramp rounded to available load increments', () => {
    expect(buildWarmupRamp({ workingWeight: 100, bar: 20, plates: [20, 10, 5], unit: 'kg' })).toEqual([
      { percentage: 40, reps: 10, weight: 40 },
      { percentage: 60, reps: 6, weight: 60 },
      { percentage: 80, reps: 3, weight: 80 },
    ]);
  });
});
