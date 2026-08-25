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

  it('chooses the true absolute nearest load and prefers the lower load on a tie', () => {
    expect(nearestPlateLoad({ total: 99, bar: 20, plates: [20] })).toMatchObject({ exact: false, achievedTotal: 100, perSide: [20, 20] });
    expect(nearestPlateLoad({ total: 21, bar: 20, plates: [20] })).toMatchObject({ exact: false, achievedTotal: 20, perSide: [] });
  });

  it('rejects absurd finite values without allocating from the target size', () => {
    expect(() => calculatePlateLoad({ total: 1e12, bar: 20, plates: [20, 10] })).not.toThrow();
    expect(calculatePlateLoad({ total: 1e12, bar: 20, plates: [20, 10] })).toMatchObject({ exact: false, achievedTotal: 0 });
  });

  it('never returns an advertised load above the 2,000 kg allocation bound', () => {
    const load = calculatePlateLoad({ total: 2_000, bar: 100, plates: [100, 99.99, 75, 50, 25, 20, 10, 5, 2.5, 1.25, 1, 0.5] });
    expect(load.achievedTotal).toBeLessThanOrEqual(2_000);
  });

  it('omits unsafe low-load warm-ups and reports actual achieved percentages', () => {
    expect(buildWarmupRamp({ workingWeight: 20, bar: 20, plates: [20, 10], unit: 'kg' })).toEqual([]);
    expect(buildWarmupRamp({ workingWeight: 65, bar: 20, plates: [20], unit: 'kg' })).toEqual([
      { percentage: 40, achievedPercentage: 30.8, reps: 10, weight: 20 },
      { percentage: 80, achievedPercentage: 92.3, reps: 3, weight: 60 },
    ]);
  });

  it('builds a percentage-based warm-up ramp rounded to available load increments', () => {
    expect(buildWarmupRamp({ workingWeight: 100, bar: 20, plates: [20, 10, 5], unit: 'kg' })).toEqual([
      { percentage: 40, achievedPercentage: 40, reps: 10, weight: 40 },
      { percentage: 60, achievedPercentage: 60, reps: 6, weight: 60 },
      { percentage: 80, achievedPercentage: 80, reps: 3, weight: 80 },
    ]);
  });
});
